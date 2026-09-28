import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCHEDULE,
  PRESET_WEEKDAYS,
  cloneSchedule,
  dayIndex,
  dayScheduleFor,
  formatDayWindow,
  isDayOpen,
  isUnconstrained,
  isWithinSchedule,
  isWithinScheduleRange,
  MAX_SLOT_RANGE_DAYS,
  sanitizeSchedule,
  type WeeklySchedule,
} from "@/lib/schedule";

// 2026-07-01 is a Wednesday; 2026-07-04 a Saturday, 2026-07-05 a Sunday.
const WED = "2026-07-01";
const SAT = "2026-07-04";
const SUN = "2026-07-05";

describe("schedule — index des jours (lundi en premier)", () => {
  it("mappe une date ISO sur son jour de semaine", () => {
    expect(dayIndex(WED)).toBe(2); // mercredi
    expect(dayIndex(SAT)).toBe(5);
    expect(dayIndex(SUN)).toBe(6);
  });

  it("renvoie -1 pour une date invalide", () => {
    expect(dayIndex("pas-une-date")).toBe(-1);
    expect(dayScheduleFor(DEFAULT_SCHEDULE, "")).toBeNull();
  });
});

describe("schedule — planning par défaut", () => {
  it("n'impose aucune contrainte", () => {
    expect(isUnconstrained(DEFAULT_SCHEDULE)).toBe(true);
    expect(isDayOpen(DEFAULT_SCHEDULE, SUN)).toBe(true);
    expect(isWithinSchedule(DEFAULT_SCHEDULE, SUN, "03:00")).toBe(true);
  });

  it("le préréglage semaine ferme le week-end", () => {
    expect(isUnconstrained(PRESET_WEEKDAYS)).toBe(false);
    expect(isDayOpen(PRESET_WEEKDAYS, WED)).toBe(true);
    expect(isDayOpen(PRESET_WEEKDAYS, SAT)).toBe(false);
    expect(isDayOpen(PRESET_WEEKDAYS, SUN)).toBe(false);
  });
});

describe("schedule — créneau dans les horaires", () => {
  it("accepte une heure dans la fenêtre, bornes incluses", () => {
    expect(isWithinSchedule(PRESET_WEEKDAYS, WED, "07:00")).toBe(true);
    expect(isWithinSchedule(PRESET_WEEKDAYS, WED, "12:30")).toBe(true);
    expect(isWithinSchedule(PRESET_WEEKDAYS, WED, "19:00")).toBe(true);
  });

  it("refuse une heure hors fenêtre", () => {
    expect(isWithinSchedule(PRESET_WEEKDAYS, WED, "06:59")).toBe(false);
    expect(isWithinSchedule(PRESET_WEEKDAYS, WED, "19:01")).toBe(false);
    expect(isWithinSchedule(PRESET_WEEKDAYS, WED, "23:00")).toBe(false);
  });

  it("refuse tout un jour fermé, heure ou pas", () => {
    expect(isWithinSchedule(PRESET_WEEKDAYS, SAT, "10:00")).toBe(false);
    expect(isWithinSchedule(PRESET_WEEKDAYS, SAT, "")).toBe(false);
  });

  it("sans heure, il suffit que le jour soit ouvert", () => {
    expect(isWithinSchedule(PRESET_WEEKDAYS, WED, "")).toBe(true);
  });

  it("refuse une date illisible plutôt que de laisser passer", () => {
    expect(isWithinSchedule(PRESET_WEEKDAYS, "2026-13-40", "10:00")).toBe(false);
  });
});

describe("schedule — assainissement des données relues", () => {
  it("retombe sur le défaut si la forme est mauvaise", () => {
    expect(sanitizeSchedule(null)).toEqual(DEFAULT_SCHEDULE);
    expect(sanitizeSchedule([{ open: true }])).toEqual(DEFAULT_SCHEDULE);
    expect(sanitizeSchedule("lundi")).toEqual(DEFAULT_SCHEDULE);
  });

  it("répare les heures invalides", () => {
    const raw = Array.from({ length: 7 }, () => ({
      open: true,
      start: "nope",
      end: "25:99",
    }));
    const s = sanitizeSchedule(raw);
    expect(s[0].start).toBe("00:00");
    expect(s[0].end).toBe("23:59");
  });

  it("répare une fin antérieure au début, qui rendrait le jour inréservable", () => {
    const raw = Array.from({ length: 7 }, () => ({
      open: true,
      start: "19:00",
      end: "07:00",
    }));
    expect(sanitizeSchedule(raw)[0].end).toBe("23:59");
  });

  it("conserve un planning déjà valide", () => {
    expect(sanitizeSchedule(PRESET_WEEKDAYS)).toEqual(PRESET_WEEKDAYS);
  });
});

describe("schedule — affichage et copie", () => {
  it("formate la fenêtre du jour", () => {
    expect(formatDayWindow(PRESET_WEEKDAYS[0])).toBe("07:00 – 19:00");
    expect(formatDayWindow(PRESET_WEEKDAYS[5])).toBe("Fermé");
    expect(formatDayWindow(null)).toBe("Fermé");
  });

  it("clone en profondeur, sans partager les jours", () => {
    const copy = cloneSchedule(PRESET_WEEKDAYS);
    copy[0].start = "05:00";
    expect(PRESET_WEEKDAYS[0].start).toBe("07:00");
  });
});

describe("schedule — recherche sur plusieurs jours", () => {
  /** Lun–Ven 07:00–19:00, week-end fermé. */
  const weekdays: WeeklySchedule = [
    ...Array.from({ length: 5 }, () => ({
      open: true,
      start: "07:00",
      end: "19:00",
    })),
    { open: false, start: "07:00", end: "19:00" },
    { open: false, start: "07:00", end: "19:00" },
  ];

  // 2026-09-28 = lundi · 10-02 = vendredi · 10-03 = samedi.
  it("accepte une plage entièrement ouvrée", () => {
    expect(
      isWithinScheduleRange(weekdays, "2026-09-28", "2026-10-02", "09:00")
    ).toBe(true);
  });

  it("⚠️ REFUSE dès qu'un seul jour de la plage est fermé", () => {
    // Lundi → samedi : le samedi suffit à disqualifier. « J'ai besoin d'un
    // chauffeur du lundi au samedi » veut dire les six jours.
    expect(
      isWithinScheduleRange(weekdays, "2026-09-28", "2026-10-03", "09:00")
    ).toBe(false);
  });

  it("applique l'heure à CHAQUE jour, pas seulement au premier", () => {
    expect(
      isWithinScheduleRange(weekdays, "2026-09-28", "2026-10-02", "21:00")
    ).toBe(false);
  });

  it("se comporte comme un jour unique sans fin, ou avec une fin incohérente", () => {
    expect(isWithinScheduleRange(weekdays, "2026-10-03", "", "09:00")).toBe(false);
    expect(isWithinScheduleRange(weekdays, "2026-09-28", "", "09:00")).toBe(true);
    // Fin antérieure au début : on ne parcourt rien à l'envers.
    expect(
      isWithinScheduleRange(weekdays, "2026-09-28", "2026-09-01", "09:00")
    ).toBe(true);
  });

  it("ignore l'heure quand elle n'est pas renseignée", () => {
    expect(isWithinScheduleRange(weekdays, "2026-09-28", "2026-10-02", "")).toBe(
      true
    );
  });

  it("⚠️ borne son parcours au lieu de boucler sur une URL absurde", () => {
    // Sans plafond, `?dateEnd=2090-01-01` ferait itérer 23 000 jours dans le
    // navigateur. On vérifie le mois demandé et on s'arrête.
    const open = DEFAULT_SCHEDULE;
    expect(
      isWithinScheduleRange(open, "2026-01-01", "2090-01-01", "09:00")
    ).toBe(true);
    expect(MAX_SLOT_RANGE_DAYS).toBe(31);
  });

  it("laisse passer un planning sans contrainte, sur n'importe quelle plage", () => {
    // Le cas le plus fréquent aujourd'hui : un chauffeur qui n'a rien déclaré.
    expect(
      isWithinScheduleRange(DEFAULT_SCHEDULE, "2026-09-28", "2026-10-05", "04:35")
    ).toBe(true);
  });
});
