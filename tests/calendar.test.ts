import { describe, it, expect } from "vitest";
import {
  toISO,
  parseISO,
  daysInMonth,
  firstWeekdayMondayFirst,
  monthGrid,
  shiftMonth,
  isBefore,
  addDays,
  nextWeekendISO,
  todayISODate,
  composeSlot,
  isFutureSlot,
  rollPastTimeToNextDay,
  formatSlot,
} from "@/lib/calendar";

describe("calendar — toISO / parseISO", () => {
  it("formate avec zéros de remplissage", () => {
    expect(toISO(2026, 7, 1)).toBe("2026-07-01");
    expect(toISO(2026, 12, 25)).toBe("2026-12-25");
  });
  it("parse une date valide", () => {
    expect(parseISO("2026-07-15")).toEqual({ year: 2026, month: 7, day: 15 });
  });
  it("rejette une date invalide", () => {
    expect(parseISO("2026-13-01")).toBeNull();
    expect(parseISO("pas-une-date")).toBeNull();
    expect(parseISO("2026-7-1")).toBeNull(); // format strict
  });
});

describe("calendar — daysInMonth", () => {
  it("gère les mois standards", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
  it("gère février bissextile", () => {
    expect(daysInMonth(2024, 2)).toBe(29); // bissextile
    expect(daysInMonth(2026, 2)).toBe(28);
  });
});

describe("calendar — firstWeekdayMondayFirst (lundi = 0)", () => {
  it("place correctement le 1er du mois", () => {
    // 1er juillet 2026 = mercredi → index 2
    expect(firstWeekdayMondayFirst(2026, 7)).toBe(2);
    // 1er février 2026 = dimanche → index 6
    expect(firstWeekdayMondayFirst(2026, 2)).toBe(6);
  });
});

describe("calendar — monthGrid", () => {
  it("produit toujours 42 cellules (6 rangées)", () => {
    expect(monthGrid(2026, 7)).toHaveLength(42);
    expect(monthGrid(2026, 2)).toHaveLength(42);
  });
  it("commence par le bon nombre de cellules vides", () => {
    const grid = monthGrid(2026, 7); // mercredi → 2 paddings
    expect(grid[0].inMonth).toBe(false);
    expect(grid[1].inMonth).toBe(false);
    expect(grid[2]).toEqual({ iso: "2026-07-01", day: 1, inMonth: true });
  });
  it("contient tous les jours du mois", () => {
    const grid = monthGrid(2026, 7).filter((c) => c.inMonth);
    expect(grid).toHaveLength(31);
    expect(grid[30].iso).toBe("2026-07-31");
  });
});

describe("calendar — shiftMonth", () => {
  it("avance d'un mois", () => {
    expect(shiftMonth(2026, 7, 1)).toEqual({ year: 2026, month: 8 });
  });
  it("passe à l'année suivante en décembre", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
  it("recule à l'année précédente en janvier", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("calendar — isBefore (jours passés)", () => {
  it("détecte une date antérieure au minimum", () => {
    expect(isBefore("2026-06-30", "2026-07-01")).toBe(true);
    expect(isBefore("2026-07-01", "2026-07-01")).toBe(false);
    expect(isBefore("2026-07-02", "2026-07-01")).toBe(false);
  });
  it("renvoie false pour des entrées vides", () => {
    expect(isBefore("", "2026-07-01")).toBe(false);
    expect(isBefore("2026-07-01", "")).toBe(false);
  });
});

describe("calendar — addDays", () => {
  it("ajoute des jours en franchissant les mois", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("recule avec un delta négatif", () => {
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });
});

describe("calendar — nextWeekendISO", () => {
  it("renvoie le samedi à venir", () => {
    // 1er juillet 2026 = mercredi → samedi 4 juillet
    expect(nextWeekendISO("2026-07-01")).toBe("2026-07-04");
  });
  it("renvoie le jour même si déjà le week-end", () => {
    expect(nextWeekendISO("2026-07-04")).toBe("2026-07-04"); // samedi
    expect(nextWeekendISO("2026-07-05")).toBe("2026-07-05"); // dimanche
  });
});

/* -------------------------------------------------------------------------- */
/*  Créneaux : date + heure                                                   */
/* -------------------------------------------------------------------------- */

/** Horloge figée : mercredi 8 juillet 2026, 14:30 locales. */
const NOW = () => new Date(2026, 6, 8, 14, 30, 0).getTime();

describe("calendar — todayISODate", () => {
  it("rend la date locale au format ISO court", () => {
    expect(todayISODate(NOW)).toBe("2026-07-08");
  });
});

describe("calendar — composeSlot", () => {
  it("assemble date et heure", () => {
    expect(composeSlot("2026-07-08", "14:00")).toBe("2026-07-08T14:00");
  });

  it("rend la date seule sans heure valide", () => {
    expect(composeSlot("2026-07-08", "")).toBe("2026-07-08");
    expect(composeSlot("2026-07-08", "nope")).toBe("2026-07-08");
  });

  it("rend vide sans date valide", () => {
    expect(composeSlot("", "14:00")).toBe("");
    expect(composeSlot("08/07/2026", "14:00")).toBe("");
  });
});

describe("calendar — isFutureSlot", () => {
  it("accepte un créneau à venir", () => {
    expect(isFutureSlot("2026-07-08", "18:00", NOW)).toBe(true);
    expect(isFutureSlot("2026-12-01", "08:00", NOW)).toBe(true);
  });

  it("refuse une heure déjà passée aujourd'hui", () => {
    expect(isFutureSlot("2026-07-08", "09:00", NOW)).toBe(false);
  });

  it("accepte aujourd'hui SANS heure — le jour entier compte", () => {
    // Une date sans heure vaut jusqu'à 23:59 : sinon chercher « aujourd'hui »
    // deviendrait impossible passé midi.
    expect(isFutureSlot("2026-07-08", "", NOW)).toBe(true);
  });

  it("refuse une date passée et une saisie illisible", () => {
    expect(isFutureSlot("2026-07-07", "23:00", NOW)).toBe(false);
    expect(isFutureSlot("", "14:00", NOW)).toBe(false);
  });
});

describe("calendar — rollPastTimeToNextDay", () => {
  it("reporte au lendemain une heure passée aujourd'hui", () => {
    expect(rollPastTimeToNextDay("2026-07-08", "09:00", NOW)).toEqual({
      date: "2026-07-09",
      rolled: true,
    });
  });

  it("ne touche pas une heure encore à venir", () => {
    expect(rollPastTimeToNextDay("2026-07-08", "18:00", NOW)).toEqual({
      date: "2026-07-08",
      rolled: false,
    });
  });

  it("⚠️ ne reporte PAS une date déjà passée", () => {
    // Seul aujourd'hui roule. Une date passée est une erreur délibérée, que
    // `isFutureSlot` refuse — la corriger en silence masquerait la faute.
    expect(rollPastTimeToNextDay("2026-07-01", "09:00", NOW)).toEqual({
      date: "2026-07-01",
      rolled: false,
    });
  });

  it("laisse intacte une saisie incomplète", () => {
    expect(rollPastTimeToNextDay("2026-07-08", "", NOW)).toEqual({
      date: "2026-07-08",
      rolled: false,
    });
  });
});

describe("calendar — formatSlot", () => {
  it("met en forme une date et une heure, dans les deux langues", () => {
    expect(formatSlot("2026-07-08T14:00", "fr")).toBe("8 juillet 2026 à 14:00");
    expect(formatSlot("2026-07-08T14:00", "en")).toBe("July 8, 2026 at 14:00");
  });

  it("met en forme une date seule", () => {
    expect(formatSlot("2026-07-08", "fr")).toBe("8 juillet 2026");
  });

  it("rend « dès que possible » pour un créneau vide", () => {
    expect(formatSlot("", "fr")).toBe("Dès que possible");
    expect(formatSlot("   ", "en")).toBe("As soon as possible");
  });

  it("⚠️ ne construit jamais un Date — pas de décalage de fuseau", () => {
    // La chaîne est découpée, jamais parsée : un créneau local passé par un
    // `new Date()` serait rattaché au fuseau du serveur et s'afficherait
    // décalé d'une heure.
    expect(formatSlot("2026-01-01T00:30", "fr")).toBe("1 janvier 2026 à 00:30");
    expect(formatSlot("2026-12-31T23:45", "fr")).toBe("31 décembre 2026 à 23:45");
  });

  it("rend tel quel un texte libre hérité", () => {
    expect(formatSlot("demain matin", "fr")).toBe("demain matin");
  });
});
