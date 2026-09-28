import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RATE_LIMITS,
  PLATFORM_COMMISSION_RATE,
  CLIENT_SERVICE_FEE_RATE,
} from "@/lib/pricing";

/**
 * Les garde-fous de saisie et les taux existent à deux endroits :
 * `lib/pricing.ts`, qui fait foi, et la table `pricing_rules` semée par
 * supabase/schema.sql, qui sert au calcul côté base.
 *
 * Une seule des deux copies peut être juste. Ce test la compare à l'autre et
 * échoue si l'une bouge sans l'autre — c'est exactement le genre d'écart qui
 * ne se voit qu'au moment de facturer le mauvais montant.
 *
 * ⚠️ Depuis le passage au **statut d'annuaire**, ces bornes ne sont plus un
 * barème : la plateforme n'impose aucun prix. Le test le vérifie dans les deux
 * sens — mêmes bornes qu'en TypeScript, et **aucune gamme à prix unique**.
 */

interface SeededBand {
  minHour: number;
  maxHour: number;
  minDay: number;
  maxDay: number;
}

const SCHEMA = readFileSync(
  resolve(__dirname, "..", "supabase", "schema.sql"),
  "utf8"
);

/** Les lignes `('Business', 1, 1000, 1, 10000),` du bloc d'amorçage. */
function seededBands(): Record<string, SeededBand> {
  const insert = SCHEMA.split("insert into public.pricing_rules")[1];
  expect(insert, "bloc d'amorçage pricing_rules introuvable").toBeTruthy();
  const values = insert.split("on conflict")[0];

  const rows: Record<string, SeededBand> = {};
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

  it("sème les cinq gammes", () => {
    expect(Object.keys(seeded).sort()).toEqual([
      "Business",
      "Luxury",
      "Moto",
      "Van",
      "Van Luxury",
    ]);
  });

  it("donne à chaque gamme les garde-fous de RATE_LIMITS", () => {
    for (const [category, band] of Object.entries(seeded)) {
      expect(band, category).toEqual({
        minHour: RATE_LIMITS.hour.min,
        maxHour: RATE_LIMITS.hour.max,
        minDay: RATE_LIMITS.day.min,
        maxDay: RATE_LIMITS.day.max,
      });
    }
  });

  it("⚠️ n'impose un prix à AUCUNE gamme", () => {
    // Statut d'annuaire : un prix imposé se modélisait par min = max. Ce test
    // échoue si une gamme y revient côté SQL — la base accepterait alors un
    // seul tarif là où le formulaire en accepte mille, et le refus tomberait à
    // l'insertion, sous forme de panne.
    for (const [category, band] of Object.entries(seeded)) {
      expect(band.maxHour, `${category} horaire`).toBeGreaterThan(band.minHour);
      expect(band.maxDay, `${category} journalier`).toBeGreaterThan(band.minDay);
    }
  });

  it("réécrit les bornes des lignes déjà semées", () => {
    // `on conflict do nothing` laisse intactes les lignes créées sous
    // l'ancien barème : sans cet `update`, la base continuerait de refuser
    // tout tarif hors 120 €/h pendant que le site les accepte.
    const m = SCHEMA.match(
      /update public\.pricing_rules\s+set min_hour = ([\d.]+), max_hour = ([\d.]+),\s+min_day\s+= ([\d.]+), max_day\s+= ([\d.]+)/
    );
    expect(m, "réécriture des bornes introuvable").toBeTruthy();
    expect(Number(m![1])).toBe(RATE_LIMITS.hour.min);
    expect(Number(m![2])).toBe(RATE_LIMITS.hour.max);
    expect(Number(m![3])).toBe(RATE_LIMITS.day.min);
    expect(Number(m![4])).toBe(RATE_LIMITS.day.max);
  });

  it("⚠️ ne substitue plus un tarif plateforme à un tarif manquant", () => {
    // `coalesce(p_price_per_hour, band.min_hour)` facturait le plancher de la
    // plateforme au nom d'un chauffeur qui n'avait rien annoncé.
    expect(SCHEMA).not.toContain("coalesce(p_price_per_hour, band.min_hour)");
    expect(SCHEMA).not.toContain("coalesce(p_price_per_day, band.min_day)");
    expect(SCHEMA).toMatch(/Tarif horaire du chauffeur absent/);
    expect(SCHEMA).toMatch(/Tarif journalier du chauffeur absent/);
  });

  it("applique le même taux de commission par défaut", () => {
    const m = SCHEMA.match(/commission_rate\s+numeric\(4,3\)\s+not null default ([\d.]+)/);
    expect(m, "défaut de commission_rate introuvable").toBeTruthy();
    expect(Number(m![1])).toBe(PLATFORM_COMMISSION_RATE);
  });

  it("applique les mêmes frais de service client par défaut", () => {
    const m = SCHEMA.match(/service_fee_rate\s+numeric\(4,3\)\s+not null default ([\d.]+)/);
    expect(m, "défaut de service_fee_rate introuvable").toBeTruthy();
    expect(Number(m![1])).toBe(CLIENT_SERVICE_FEE_RATE);
  });

  it("réécrit les lignes semées sous l'ancien barème", () => {
    // `add column ... default` ne touche pas les lignes existantes : sans ce
    // `update`, une base créée avant ce barème continuerait de répondre 25 %
    // pendant que TypeScript facture le nouveau partage.
    const m = SCHEMA.match(
      /update public\.pricing_rules\s+set commission_rate = ([\d.]+), service_fee_rate = ([\d.]+)/
    );
    expect(m, "mise à jour du barème existant introuvable").toBeTruthy();
    expect(Number(m![1])).toBe(PLATFORM_COMMISSION_RATE);
    expect(Number(m![2])).toBe(CLIENT_SERVICE_FEE_RATE);
  });

  it("applique les deux taux à la bonne base", () => {
    // Le piège du barème : les frais client et la commission chauffeur
    // portent tous deux sur le TARIF COURSE (`v_fare`), pas l'un sur l'autre.
    // Un `v_total * commission_rate` prélèverait le chauffeur sur les frais
    // que le client vient de payer.
    expect(SCHEMA).toMatch(/v_fee\s+:= round\(v_fare \* band\.service_fee_rate, 2\)/);
    expect(SCHEMA).toMatch(/v_comm\s+:= round\(v_fare \* band\.commission_rate, 2\)/);
  });

  it("compose le total client par addition", () => {
    expect(SCHEMA).toMatch(/v_total := v_fare \+ v_fee/);
  });

  it("borne les quantités comme lib/payments.ts", () => {
    // 1..24 heures, 1..30 jours : les mêmes plafonds que clampHours/clampDays.
    expect(SCHEMA).toMatch(/least\(24, greatest\(1,/);
    expect(SCHEMA).toMatch(/least\(30, greatest\(1,/);
  });

  it("dérive le net du chauffeur par soustraction", () => {
    // Arrondir la commission ET le net séparément, c'est finir à un euro près.
    // Depuis le tarif course, pas depuis le total client : le chauffeur
    // n'encaisse pas les frais de service, il ne peut pas en être défalqué.
    expect(SCHEMA).toMatch(/v_fare - v_comm/);
  });
});
