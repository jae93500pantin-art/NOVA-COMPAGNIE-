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
} from "@/lib/calendar";
import { todayISODate, formatWhen } from "@/lib/bookings";
import { useI18n } from "@/lib/i18n";
import { ease, springSnappy } from "@/lib/motion";
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
  /** "range" enables start→end selection (uses endDate + onRangeChange). */
  mode?: "single" | "range";
  /** End date in range mode ("YYYY-MM-DD"). */
  endDate?: string;
  onRangeChange?: (start: string, end: string) => void;
}

const QUICK_TIMES = ["09:00", "12:00", "18:00", "20:00"];

/**
 * Premium glass date+time picker — quick-chips, custom calendar, time chips.
 * Keyboard-accessible, reduced-motion-safe, mobile-first.
 */
export function DatePicker({
  date,
  time,
  onChange,
  min,
  variant = "booking",
  showTime = true,
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
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
    const width = Math.min(Math.max(r.width, 300), 340);
    let left = r.left;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 12);
    }
    // Flip above the trigger when there isn't enough room below.
    const estHeight = 460;
    const spaceBelow = window.innerHeight - r.bottom;
    const placement: "top" | "bottom" =
      spaceBelow < estHeight && r.top > spaceBelow ? "top" : "bottom";
    const top =
      placement === "bottom"
        ? r.bottom + 8
        : Math.max(12, r.top - estHeight - 8);
    setCoords({ top, left, width, placement });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onScrollResize = () => place();
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    return () => {
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const label =
    mode === "range"
      ? date
        ? endDate && endDate !== date
          ? `${formatWhen(date, lang)} → ${formatWhen(endDate, lang)}`
          : formatWhen(date, lang)
        : t("datepicker.chooseDate")
      : date
      ? formatWhen(time ? `${date}T${time}` : date, lang)
      : t("datepicker.chooseDate");

  const pickDate = (iso: string) => {
    if (mode === "range") {
      if (!date || (date && endDate)) onRangeChange?.(iso, "");
      else if (isBefore(iso, date)) onRangeChange?.(iso, "");
      else onRangeChange?.(date, iso);
      return;
    }
    onChange?.(iso, time);
  };
  const pickTime = (hhmm: string) => {
    onChange?.(date || today, hhmm === time ? "" : hhmm);
  };

  const quick = (iso: string) => {
    const p = parseISO(iso)!;
    setView({ year: p.year, month: p.month });
    onChange?.(iso, time);
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
    if (isBefore(next, minDate)) return;
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

  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.96, y: coords?.placement === "top" ? 8 : -8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.97, y: coords?.placement === "top" ? 6 : -6 },
        transition: springSnappy,
      };

  const popover =
    open && mounted && coords
      ? createPortal(
          <AnimatePresence>
            <motion.div
              ref={popRef}
              key="datepicker-pop"
              {...motionProps}
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                width: coords.width,
                transformOrigin: coords.placement === "top" ? "bottom center" : "top center",
                zIndex: 80,
              }}
              role="dialog"
              aria-label={t("datepicker.chooseDate")}
              className="rounded-2xl border border-white/10 bg-ink-900/95 p-3 shadow-card backdrop-blur-xl"
            >
              {/* Quick chips */}
              {mode !== "range" && (
                <div className="flex flex-wrap gap-1.5">
                  <QuickChip label={t("datepicker.today")} onClick={() => quick(today)} active={date === today} />
                  <QuickChip label={t("datepicker.tomorrow")} onClick={() => quick(addDays(today, 1))} active={date === addDays(today, 1)} />
                  <QuickChip label={t("datepicker.weekend")} onClick={() => quick(nextWeekendISO(today))} active={date === nextWeekendISO(today)} />
                </div>
              )}

              {/* Month header */}
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  aria-label={t("datepicker.prevMonth")}
                  onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
                  className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
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
                  className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
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
                  const disabled = isBefore(cell.iso, minDate);
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
                        "relative mx-auto grid h-8 w-8 place-items-center rounded-full text-[13px] transition",
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

              {/* Time chips */}
              {showTime && (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
                    <Clock className="h-3 w-3" /> {t("datepicker.chooseTime")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <QuickChip label={t("datepicker.anyTime")} onClick={() => pickTime(time)} active={!time} subtle />
                    {QUICK_TIMES.map((h) => (
                      <QuickChip key={h} label={h} onClick={() => pickTime(h)} active={time === h} />
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => (mode === "range" ? onRangeChange?.("", "") : onChange?.("", ""))}
                  className="rounded-full px-3 py-1.5 text-xs text-white/50 transition hover:text-white"
                >
                  {t("datepicker.clear")}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-primary px-4 py-2 text-xs"
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("datepicker.confirm")}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body
        )
      : null;

  if (variant === "search") {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
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
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="w-full rounded-xl border border-white/10 px-3 py-2.5 text-left transition hover:border-white/20 focus:border-royal-400/50 focus:outline-none"
      >
        <span className="flex items-center gap-1.5 text-[11px] text-white/40">
          <Calendar className="h-3 w-3" /> {t("booking.date")}
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
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
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
