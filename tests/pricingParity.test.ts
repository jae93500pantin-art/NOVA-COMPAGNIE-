import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRICE_BANDS,
  PLATFORM_COMMISSION_RATE,
  type PriceBand,
} from "@/lib/pricing";
import type { VehicleCategory } from "@/lib/types";

/**
 * Le barème existe à deux endroits : `PRICE_BANDS` (lib/pricing.ts), qui fait
 * foi pour le montant facturé, et la table `pricing_rules` semée par
 * supabase/schema.sql, qui sert au calcul côté base.
 *
 * Une seule des deux copies peut être juste. Ce test la compare à l'autre et
 * échoue si l'une bouge sans l'autre — c'est exactement le genre d'écart qui
 * ne se voit qu'au moment de facturer le mauvais montant.
 */

const SCHEMA = readFileSync(
  resolve(__dirname, "..", "supabase", "schema.sql"),
  "utf8"
);

/** Les lignes `('Business', 120, 120, 1000, 1000),` du bloc d'amorçage. */
function seededBands(): Record<string, PriceBand> {
  const insert = SCHEMA.split("insert into public.pricing_rules")[1];
  expect(insert, "bloc d'amorçage pricing_rules introuvable").toBeTruthy();
  const values = insert.split("on conflict")[0];

  const rows: Record<string, PriceBand> = {};
  const re =
    /\(\s*'([^']+)'\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g;
  for (const m of values.matchAll(re)) {
    rows[m[1]] = {
      minHour: Number(m[2]),
      maxHour: Number(m[3]),
      minDay: Number(m[4]),
      maxDay: Number(m[5]),
    };
  }
  return rows;
}

describe("barème SQL ↔ barème TypeScript", () => {
  const seeded = seededBands();

  it("sème exactement les mêmes gammes", () => {
    expect(Object.keys(seeded).sort()).toEqual(Object.keys(PRICE_BANDS).sort());
  });

  it.each(Object.keys(PRICE_BANDS) as VehicleCategory[])(
    "%s a les mêmes bornes des deux côtés",
    (category) => {
      expect(seeded[category]).toEqual(PRICE_BANDS[category]);
    }
  );

  it("garde les classes standard à bande nulle", () => {
    // Un tarif imposé est modélisé comme min = max. Si le SQL laissait un
    // intervalle là où le TS n'en laisse pas, un chauffeur pourrait fixer un
    // prix que la plateforme refuse ailleurs.
    (["Business", "Moto", "Van"] as VehicleCategory[]).forEach((c) => {
      expect(seeded[c].minHour).toBe(seeded[c].maxHour);
      expect(seeded[c].minDay).toBe(seeded[c].maxDay);
    });
  });

  it("applique le même taux de commission par défaut", () => {
    const m = SCHEMA.match(/commission_rate\s+numeric\(4,3\)\s+not null default ([\d.]+)/);
    expect(m, "défaut de commission_rate introuvable").toBeTruthy();
    expect(Number(m![1])).toBe(PLATFORM_COMMISSION_RATE);
  });

  it("borne les quantités comme lib/payments.ts", () => {
    // 1..24 heures, 1..30 jours : les mêmes plafonds que clampHours/clampDays.
    expect(SCHEMA).toMatch(/least\(24, greatest\(1,/);
    expect(SCHEMA).toMatch(/least\(30, greatest\(1,/);
  });

  it("dérive le net du chauffeur par soustraction", () => {
    // Arrondir la commission ET le net séparément, c'est finir à un euro près.
    expect(SCHEMA).toMatch(/v_total - v_comm/);
  });
});
