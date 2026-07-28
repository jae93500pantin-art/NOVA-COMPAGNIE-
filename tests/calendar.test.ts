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
