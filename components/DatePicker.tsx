"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, Check, Clock } from "lucide-react";
import {
  monthGrid,
  parseISO,
  shiftMonth,
  isBefore,
  addDays,
  nextWeekendISO,
  todayISODate,
  formatSlot,
  isFutureSlot,
  timeSlots,
} from "@/lib/calendar";
import {
  dayScheduleFor,
  formatDayWindow,
  isDayOpen,
  isWithinSchedule,
  type WeeklySchedule,
} from "@/lib/schedule";
import { useI18n } from "@/lib/i18n";
import { ease, springSnappy, springSoft } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  /** Selected date "YYYY-MM-DD" ("" = none). In range mode this is the start. */
  date: string;
  /** Selected time "HH:mm" ("" = flexible). */
  time: string;
  onChange?: (date: string, time: string) => void;
  /** Earliest selectable date (defaults to today). */
  min?: string;
  /** When true, render a compact trigger (search bar) instead of the booking style. */
  variant?: "booking" | "search";
  /** Hide the time chooser when false. */
  showTime?: boolean;
  /**
   * Driver's weekly hours. Closed days are disabled and the time field is
   * bounded by the chosen day's window. Omit for no constraint.
   */
  schedule?: WeeklySchedule;
  /** "range" enables start→end selection (uses endDate + onRangeChange). */
  mode?: "single" | "range";
  /** End date in range mode ("YYYY-MM-DD"). */
  endDate?: string;
  onRangeChange?: (start: string, end: string) => void;
}

/** Sous cette largeur, le sélecteur s'ouvre en feuille depuis le bas. */
const SHEET_QUERY = "(max-width: 639px)";

/** Heure vers laquelle la grille défile quand rien n'est encore choisi. */
const DEFAULT_SCROLL_TIME = "08:00";

/**
 * Premium glass date+time picker — quick-chips, custom calendar, time grid.
 *
 * ## Une seule vue, deux enveloppes
 *
 * Le contenu (raccourcis, calendrier, heures) est le même partout. Seule
 * l'enveloppe change :
 * - **bureau / tablette** : popover ancré sous le champ ;
 * - **téléphone** (< 640 px) : feuille fixée en bas d'écran, calendrier et
 *   heures dans la zone qui défile, « Valider » toujours visible en pied.
 *   Un popover ancré à un champ de l'accueil sortait de l'écran et suivait le
 *   défilement.
 *
 * ## L'heure se choisit en boutons, pas au sélecteur natif
 *
 * L'ancien `<input type="time">` ouvrait la roue iOS ou l'horloge Android :
 * une troisième interface dans la première. La grille (demi-heures) s'affiche
 * **une fois le jour choisi**, ce qui permet de griser les heures passées et
 * celles hors du planning au lieu de corriger après coup.
 */
export function DatePicker({
  date,
  time,
  onChange,
  min,
  variant = "booking",
  showTime = true,
  schedule,
  mode = "single",
  endDate = "",
  onRangeChange,
}: DatePickerProps) {
  const { t, lang } = useI18n();
  const reduce = useReducedMotion();
  const today = todayISODate();
  const minDate = min ?? today;

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  /** Feuille du bas (téléphone) ou popover ancré (le reste). Fixé à l'ouverture. */
  const [sheet, setSheet] = useState(false);
  /**
   * Explains an automatic adjustment: "cleared" → time dropped because it has
   * passed on the new day, "outside" → outside the driver's working hours.
   */
  const [notice, setNotice] = useState<"" | "cleared" | "outside">("");
  /**
   * Popover : heures en colonne à DROITE du calendrier. Empilées dessous, elles
   * portaient le popover à ~580 px et faisaient sortir « Valider » de l'écran
   * sur un portable. Le popover n'existe qu'au-delà de 640 px : la place y est.
   */
  const side = !sheet && showTime;

  /** Working hours of the currently selected day, when a schedule is given. */
  const dayWindow = schedule ? dayScheduleFor(schedule, date || today) : null;
  const closedOn = (iso: string) => !!schedule && !isDayOpen(schedule, iso);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const timesRef = useRef<HTMLDivElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const timeSectionRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: "top" | "bottom";
  } | null>(null);

  // Month currently displayed in the calendar.
  const base = parseISO(date || minDate) ?? parseISO(today)!;
  const [view, setView] = useState({ year: base.year, month: base.month });

  useEffect(() => setMounted(true), []);

  // Position the popover under (or above) the trigger — portal escapes overflow.
  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Compact, fixed width — don't stretch to the (wide) search field.
    const width = side
      ? Math.min(548, window.innerWidth - 24)
      : Math.min(Math.max(r.width, 300), 340);
    let left = r.left;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 12);
    }
    // Flip above the trigger when there isn't enough room below.
    const estHeight = side ? 420 : 460;
    const spaceBelow = window.innerHeight - r.bottom;
    const placement: "top" | "bottom" =
      spaceBelow < estHeight && r.top > spaceBelow ? "top" : "bottom";
    const top =
      placement === "bottom"
        ? r.bottom + 8
        : Math.max(12, r.top - estHeight - 8);
    // Jamais plus haut que l'écran : au-delà, le popover défile lui-même.
    const maxHeight = Math.max(240, window.innerHeight - top - 12);
    setCoords({ top, left, width, maxHeight, placement });
  };

  const toggle = () => {
    if (!open) setSheet(window.matchMedia(SHEET_QUERY).matches);
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    if (sheet) {
      // La page ne défile plus sous la feuille : sur iOS, un glissement dans
      // le calendrier faisait sinon remonter l'accueil derrière.
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    place();
    const onScrollResize = () => place();
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    return () => {
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheet]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        popRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const months = useMemo(() => t("datepicker.months").split(","), [t]);
  const weekdays = useMemo(() => t("datepicker.weekdays").split(","), [t]);
  const grid = useMemo(() => monthGrid(view.year, view.month), [view]);
  const slots = useMemo(() => timeSlots(30, time), [time]);

  /**
   * Une heure est grisée si elle est passée sur le jour retenu (le premier
   * jour d'une plage : l'heure vaut pour chacun, c'est lui qui la contraint)
   * ou hors du planning du chauffeur.
   */
  const slotDisabled = (hhmm: string) =>
    !isFutureSlot(date, hhmm) ||
    (!!dayWindow?.open && (hhmm < dayWindow.start || hhmm > dayWindow.end));

  /**
   * Amène la grille sur l'heure retenue, sinon 08:00, sinon la première
   * disponible. À l'ouverture et au changement de jour seulement : défiler à
   * chaque choix d'heure déplacerait la grille sous le doigt.
   */
  useEffect(() => {
    if (!open || !date) return;
    const id = requestAnimationFrame(() => {
      const box = timesRef.current;
      if (!box) return;
      const pick = (hhmm: string) =>
        box.querySelector<HTMLButtonElement>(`[data-time="${hhmm}"]:not(:disabled)`);
      const target =
        (time && pick(time)) ||
        pick(DEFAULT_SCROLL_TIME) ||
        box.querySelector<HTMLButtonElement>("[data-time]:not(:disabled)");
      if (target) box.scrollTop = Math.max(0, target.offsetTop - 4);

      // Téléphone : le calendrier occupe l'écran, les heures arrivaient sous
      // le pli. On fait défiler la feuille juste assez pour les montrer en
      // entier — pas plus, pour que le haut du calendrier reste à portée
      // (le second jour d'une plage se touche encore sans remonter).
      const body = sheetBodyRef.current;
      const section = timeSectionRef.current;
      if (sheet && body && section) {
        const top = section.offsetTop + section.offsetHeight - body.clientHeight + 16;
        if (top > body.scrollTop) {
          body.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
        }
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date, sheet]);

  /** Le champ rend une date ET une heure : le dire avant qu'on l'ouvre. */
  const placeholder = t(
    showTime ? "datepicker.chooseDateTime" : "datepicker.chooseDate"
  );

  /**
   * ⚠️ Sur une plage, l'heure est collée à la FIN, une seule fois.
   *
   * Elle ne désigne plus une prise en charge le premier jour : c'est un critère
   * de recherche que `isWithinScheduleRange` applique à **chaque** jour de la
   * plage. L'écrire sur le début (« 29 sept. à 04:35 → 2 oct. ») se lirait
   * comme un départ suivi d'un retour, et le même libellé sert de puce de
   * filtre dans `DriversExplorer` — les deux doivent dire la même chose.
   *
   * Sur un jour unique, l'heure suit la date. Sans ça le champ n'affichait que
   * le jour une fois l'heure renseignée : le réglage semblait n'avoir rien fait.
   */
  const withTime = (iso: string) =>
    formatSlot(time ? `${iso}T${time}` : iso, lang);

  const label =
    mode === "range"
      ? date
        ? endDate && endDate !== date
          ? `${formatSlot(date, lang)} → ${withTime(endDate)}`
          : withTime(date)
        : placeholder
      : date
      ? withTime(date)
      : placeholder;

  /** Une heure déjà passée sur le nouveau jour de départ est retirée, et on le dit. */
  const dropPastTime = (iso: string) => {
    if (time && !isFutureSlot(iso, time)) {
      setNotice("cleared");
      onChange?.(iso, "");
      return true;
    }
    setNotice("");
    return false;
  };

  const pickDate = (iso: string) => {
    if (mode === "range") {
      // Nouveau départ : rien de choisi, plage déjà complète, ou jour antérieur
      // au début en cours. Sinon ce clic ferme la plage.
      const startsAnew = !date || !!endDate || isBefore(iso, date);
      onRangeChange?.(startsAnew ? iso : date, startsAnew ? "" : iso);
      if (startsAnew) dropPastTime(iso);
      else setNotice("");
      return;
    }
    // The user just expressed intent about the DAY: honour it and drop an hour
    // that has already passed, rather than moving them to another day.
    if (dropPastTime(iso)) return;
    onChange?.(iso, time);
  };

  /** "" = heure flexible. La grille n'apparaît qu'avec un jour : `date` est posé. */
  const pickTime = (hhmm: string) => {
    const outside =
      !!schedule && !!hhmm && !isWithinSchedule(schedule, date, hhmm);
    setNotice(outside ? "outside" : "");
    onChange?.(date, hhmm);
  };

  /** Raccourcis. En plage, « ce week-end » couvre samedi ET dimanche. */
  const weekendStart = nextWeekendISO(today);
  const weekendEnd = (() => {
    const p = parseISO(weekendStart);
    const saturday = !!p && new Date(p.year, p.month - 1, p.day).getDay() === 6;
    return saturday ? addDays(weekendStart, 1) : "";
  })();
  const quicks: { key: string; start: string; end: string }[] = [
    { key: "datepicker.today", start: today, end: "" },
    { key: "datepicker.tomorrow", start: addDays(today, 1), end: "" },
    {
      key: "datepicker.weekend",
      start: weekendStart,
      end: mode === "range" ? weekendEnd : "",
    },
  ];

  const quick = (start: string, end: string) => {
    const p = parseISO(start)!;
    setView({ year: p.year, month: p.month });
    if (mode === "range") {
      onRangeChange?.(start, end);
      dropPastTime(start);
      return;
    }
    pickDate(start);
  };

  const clear = () => {
    setNotice("");
    if (mode === "range") onRangeChange?.("", "");
    // L'heure part avec le jour : la grille disparaît, une heure restée
    // invisible filtrerait encore la recherche.
    onChange?.("", "");
  };

  // Keyboard navigation inside the grid (arrows = days, PageUp/Dn = months).
  const onGridKey = (e: React.KeyboardEvent, iso: string) => {
    let next = "";
    if (e.key === "ArrowRight") next = addDays(iso, 1);
    else if (e.key === "ArrowLeft") next = addDays(iso, -1);
    else if (e.key === "ArrowDown") next = addDays(iso, 7);
    else if (e.key === "ArrowUp") next = addDays(iso, -7);
    else return;
    e.preventDefault();
    if (isBefore(next, minDate) || closedOn(next)) return;
    const p = parseISO(next)!;
    setView({ year: p.year, month: p.month });
    requestAnimationFrame(() => {
      popRef.current
        ?.querySelector<HTMLButtonElement>(`[data-iso="${next}"]`)
        ?.focus();
    });
  };

  const triggerCls =
    variant === "search"
      ? "w-full bg-transparent text-left text-sm font-medium text-white outline-none"
      : "w-full text-left";

  const content = (
    <>
      <div className={cn(side && "flex gap-4")}>
        <div className={cn(side && "w-[296px] shrink-0")}>
          {/* Quick chips */}
          <div className="flex flex-wrap gap-1.5">
            {quicks.map((q) => (
              <QuickChip
                key={q.key}
                label={t(q.key)}
                onClick={() => quick(q.start, q.end)}
                active={
                  mode === "range"
                    ? date === q.start && endDate === q.end
                    : date === q.start
                }
              />
            ))}
          </div>

          {/* Month header */}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              aria-label={t("datepicker.prevMonth")}
              onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
              className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white coarse:h-11 coarse:w-11"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={`${view.year}-${view.month}`}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease }}
                className="text-sm font-semibold text-white"
              >
                {months[view.month - 1]} {view.year}
              </motion.span>
            </AnimatePresence>
            <button
              type="button"
              aria-label={t("datepicker.nextMonth")}
              onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
              className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white coarse:h-11 coarse:w-11"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-white/35">
            {weekdays.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>

          {/* Day grid */}
          <div role="grid" className="mt-1 grid grid-cols-7 gap-0.5">
            {grid.map((cell, i) => {
              if (!cell.inMonth) return <span key={i} aria-hidden />;
              const disabled = isBefore(cell.iso, minDate) || closedOn(cell.iso);
              const isStart = cell.iso === date;
              const isEnd = mode === "range" && !!endDate && cell.iso === endDate;
              const endpoint = isStart || isEnd;
              const inRange =
                mode === "range" &&
                !!date &&
                !!endDate &&
                cell.iso > date &&
                cell.iso < endDate;
              const selected = mode === "range" ? endpoint : isStart;
              const isToday = cell.iso === today;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  data-iso={cell.iso}
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={cell.iso}
                  disabled={disabled}
                  tabIndex={selected || (!date && isToday) ? 0 : -1}
                  onKeyDown={(e) => onGridKey(e, cell.iso)}
                  onClick={() => pickDate(cell.iso)}
                  className={cn(
                    "relative mx-auto grid h-8 w-8 place-items-center rounded-full text-[13px] transition coarse:h-11 coarse:w-11 coarse:text-sm",
                    disabled && "cursor-not-allowed text-white/20",
                    !disabled && !selected && !inRange && "text-white/80 hover:bg-white/10",
                    inRange && "bg-royal-500/15 text-white",
                    selected && "text-ink-950",
                    isToday && !selected && "ring-1 ring-royal-400/50"
                  )}
                >
                  {selected &&
                    (mode === "range" ? (
                      <span className="absolute inset-0 rounded-full bg-gradient-to-br from-royal-300 to-royal-500" />
                    ) : (
                      <motion.span
                        layoutId="dp-selected"
                        transition={reduce ? { duration: 0 } : springSnappy}
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-royal-300 to-royal-500"
                      />
                    ))}
                  <span className="relative z-10">{cell.day}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Time — a grid of buttons, shown once a day is chosen. */}
        {showTime && (
          <div
            ref={timeSectionRef}
            className={
              side
                ? "flex min-w-0 flex-1 flex-col border-l border-white/10 pl-4"
                : "mt-4 border-t border-white/10 pt-3"
            }
          >
            <div
              className={cn(
                "mb-2 flex gap-2",
                side ? "flex-col items-start" : "items-center justify-between"
              )}
            >
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
                <Clock className="h-3 w-3" /> {t("datepicker.chooseTime")}
                {dayWindow?.open && (
                  <span className="ml-1 normal-case tracking-normal text-white/30">
                    {formatDayWindow(dayWindow)}
                  </span>
                )}
              </p>
              {date && (
                <QuickChip
                  label={t("datepicker.anyTime")}
                  onClick={() => pickTime("")}
                  active={!time}
                />
              )}
            </div>
            {date ? (
              <>
                <div
                  ref={timesRef}
                  role="group"
                  aria-label={t("datepicker.chooseTime")}
                  className={cn(
                    "relative grid gap-1.5 overflow-y-auto overscroll-contain pr-1",
                    side
                      ? "max-h-[14.5rem] grid-cols-3"
                      : "max-h-44 grid-cols-4 coarse:max-h-48"
                  )}
                >
                  {slots.map((s) => {
                    const off = slotDisabled(s);
                    const on = s === time;
                    return (
                      <button
                        key={s}
                        type="button"
                        data-time={s}
                        aria-pressed={on}
                        disabled={off}
                        onClick={() => pickTime(s)}
                        className={cn(
                          "h-9 rounded-xl border text-[13px] tabular-nums transition coarse:h-11 coarse:text-sm",
                          on
                            ? "border-transparent bg-gradient-to-br from-royal-300 to-royal-500 font-semibold text-ink-950"
                            : off
                            ? "cursor-not-allowed border-white/5 text-white/20"
                            : "border-white/10 text-white/80 hover:bg-white/10 active:scale-[0.96]"
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                {mode === "range" && endDate && endDate !== date && (
                  <p className="mt-2 text-[11px] text-white/35">
                    {t("datepicker.timeEachDay")}
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-xs text-white/40">
                {t("datepicker.pickDayFirst")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Why the picker just moved something under the user's hands. */}
      <AnimatePresence initial={false}>
        {notice && (
          <motion.p
            key={notice}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease }}
            className="mt-2 rounded-xl border border-royal-400/20 bg-royal-400/10 px-3 py-2 text-[11px] leading-relaxed text-royal-100"
          >
            {notice === "outside"
              ? `${t("datepicker.outsideHours")} ${formatDayWindow(dayWindow)}`
              : t("datepicker.timePassed")}
          </motion.p>
        )}
      </AnimatePresence>
    </>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={clear}
        className="rounded-full px-3 py-1.5 text-xs text-white/50 transition hover:text-white coarse:min-h-11 coarse:text-sm"
      >
        {t("datepicker.clear")}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className={cn(
          "btn-primary",
          sheet ? "min-h-12 flex-1 text-sm" : "px-4 py-2 text-xs"
        )}
      >
        <Check className={sheet ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {t("datepicker.confirm")}
      </button>
    </div>
  );

  const popoverMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.96, y: coords?.placement === "top" ? 8 : -8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.97, y: coords?.placement === "top" ? 6 : -6 },
        transition: springSnappy,
      };

  const sheetMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { y: "100%" },
        animate: { y: 0 },
        exit: { y: "100%" },
        transition: springSoft,
      };

  const layer = !open ? null : sheet ? (
    <>
      <motion.div
        key="datepicker-backdrop"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease }}
        className="fixed inset-0 z-[79] bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        ref={popRef}
        key="datepicker-sheet"
        {...sheetMotion}
        role="dialog"
        aria-modal="true"
        aria-label={placeholder}
        className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[88dvh] flex-col rounded-t-3xl border-t border-white/10 bg-ink-900 shadow-card"
      >
        <div className="shrink-0 border-b border-white/10 px-5 pb-3 pt-2.5">
          <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-white/20" />
          <p className="mt-3 text-[11px] uppercase tracking-wider text-white/40">
            {placeholder}
          </p>
          {/* Le choix en cours, lisible sans remonter jusqu'au champ. */}
          <p
            aria-live="polite"
            className={cn(
              "mt-0.5 truncate text-base font-semibold",
              date ? "text-white" : "text-white/35"
            )}
          >
            {date ? label : "—"}
          </p>
        </div>
        <div
          ref={sheetBodyRef}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-4"
        >
          {content}
        </div>
        <div
          className="shrink-0 border-t border-white/10 bg-ink-900 px-5 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {footer}
        </div>
      </motion.div>
    </>
  ) : coords ? (
    <motion.div
      ref={popRef}
      key="datepicker-pop"
      {...popoverMotion}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        width: coords.width,
        maxHeight: coords.maxHeight,
        transformOrigin: coords.placement === "top" ? "bottom center" : "top center",
        zIndex: 80,
      }}
      role="dialog"
      aria-label={placeholder}
      className="overflow-y-auto rounded-2xl border border-white/10 bg-ink-900/95 p-3 shadow-card backdrop-blur-xl"
    >
      {content}
      <div className="mt-4">{footer}</div>
    </motion.div>
  ) : null;

  const popover = mounted
    ? createPortal(<AnimatePresence>{layer}</AnimatePresence>, document.body)
    : null;

  if (variant === "search") {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={triggerCls}
        >
          <span className={date ? "text-white" : "text-white/45"}>{label}</span>
        </button>
        {popover}
      </>
    );
  }

  // Booking variant — full bordered field with icon.
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="w-full rounded-xl border border-white/10 px-3 py-2.5 text-left transition hover:border-white/20 focus:border-royal-400/50 focus:outline-none"
      >
        <span className="flex items-center gap-1.5 text-[11px] text-white/40">
          <Calendar className="h-3 w-3" />{" "}
          {t(showTime ? "booking.dateTime" : "booking.date")}
        </span>
        <span className={cn("mt-0.5 block text-sm font-medium", date ? "text-white" : "text-white/45")}>
          {label}
        </span>
      </button>
      {popover}
    </>
  );
}

function QuickChip({
  label,
  onClick,
  active,
  subtle,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  subtle?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition coarse:min-h-11 coarse:px-4 coarse:text-sm",
        active
          ? "border-royal-400/50 bg-royal-500/20 text-white"
          : subtle
          ? "border-white/10 text-white/50 hover:bg-white/5 hover:text-white/80"
          : "border-white/10 text-white/70 hover:bg-white/5 hover:text-white"
      )}
    >
      {label}
    </motion.button>
  );
}
