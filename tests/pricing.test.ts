import { describe, it, expect } from "vitest";
import {
  PLATFORM_COMMISSION_RATE,
  RATE_LIMITS,
  boundsFor,
  clampRate,
  CLIENT_SERVICE_FEE_RATE,
  breakdownFromClientTotal,
  clientTotalOn,
  commissionOn,
  driverNetOn,
  priceBreakdown,
  isRateAcceptable,
  rateError,
} from "@/lib/pricing";
import { FIXTURE_DRIVERS as drivers } from "./fixtures/drivers";

describe("pricing — aucun tarif imposé (statut d'annuaire)", () => {
  it("applique les mêmes garde-fous à toutes les gammes", () => {
    expect(boundsFor("hour")).toEqual(RATE_LIMITS.hour);
    expect(boundsFor("day")).toEqual(RATE_LIMITS.day);
  });

  it("laisse passer un tarif libre, quel qu'il soit", () => {
    // Les trois valeurs qu'un barème par gamme refusait : sous l'ancien
    // plancher standard, entre les deux bandes, au-dessus du plafond premium.
    for (const rate of [90, 135, 400]) {
      expect(isRateAcceptable("hour", rate), `${rate} €/h`).toBe(true);
      expect(clampRate("hour", rate), `${rate} €/h`).toBe(rate);
    }
  });

  it("refuse une saisie absurde sans la remplacer par un prix", () => {
    // ⚠️ 0, et non un plancher : inventer un tarif au nom d'un chauffeur qui
    // n'a rien annoncé est exactement ce qu'un annuaire ne fait pas.
    expect(clampRate("hour", NaN)).toBe(0);
    expect(clampRate("hour", -50)).toBe(0);
    expect(clampRate("hour", 0)).toBe(0);
    expect(isRateAcceptable("hour", NaN)).toBe(false);
    expect(isRateAcceptable("hour", 0)).toBe(false);
  });

  it("plafonne une valeur aberrante au garde-fou", () => {
    expect(clampRate("hour", 99999)).toBe(RATE_LIMITS.hour.max);
    expect(clampRate("day", 999999)).toBe(RATE_LIMITS.day.max);
  });

  it("exige un tarif dans le formulaire, sans en suggérer un", () => {
    expect(rateError("hour", NaN)).toBe("Indiquez un tarif.");
    expect(rateError("hour", 0)).toBe("Indiquez un tarif.");
    expect(rateError("hour", 180)).toBeNull();
    expect(rateError("day", 1500)).toBeNull();
  });

  it("ne dit plus jamais « imposé » ni « gamme »", () => {
    // Le message d'erreur était le seul endroit où un prix plateforme se
    // lisait en clair. S'il y revient, c'est que la bande est revenue.
    for (const m of [rateError("hour", 99999), rateError("day", 999999)]) {
      expect(m).not.toBeNull();
      expect(m).not.toContain("imposé");
      expect(m).not.toContain("gamme");
    }
  });
});

describe("pricing — barème (5 % client, 15 % chauffeur)", () => {
  it("applique les deux taux au prix du chauffeur", () => {
    const s = priceBreakdown(200);
    expect(s.driverPrice).toBe(200);
    expect(s.clientFee).toBe(10); // + 5 %
    expect(s.clientTotal).toBe(210);
    expect(s.commission).toBe(30); // − 15 %
    expect(s.driverNet).toBe(170);
    expect(s.platformMargin).toBe(40); // 10 + 30
  });

  it("suit exactement les formules du barème", () => {
    for (const p of [120, 149, 170, 233, 999, 1501, 3000]) {
      const s = priceBreakdown(p);
      expect(s.clientTotal, `total ${p}`).toBe(Math.round(p * 1.05 * 100) / 100);
      expect(s.commission, `commission ${p}`).toBe(
        Math.round(p * 0.15 * 100) / 100
      );
      expect(s.clientFee, `frais ${p}`).toBe(Math.round(p * 0.05 * 100) / 100);
      expect(s.driverNet, `net ${p}`).toBe(p - s.commission);
      expect(s.platformMargin, `marge ${p}`).toBe(s.clientFee + s.commission);
    }
  });

  it("garde chaque décomposition cohérente avec elle-même", () => {
    // Une facture doit valoir la somme de ses lignes, et le décompte du
    // chauffeur retomber exactement sur son prix : c'est le seul invariant qui
    // empêche un centime de se perdre entre l'affichage et l'encaissement.
    for (const p of [95, 120, 149.5, 170, 233, 999, 1501] ) {
      const s = priceBreakdown(p);
      expect(s.driverPrice + s.clientFee, String(p)).toBeCloseTo(s.clientTotal, 10);
      expect(s.commission + s.driverNet, String(p)).toBeCloseTo(s.driverPrice, 10);
    }
  });

  it("ne mélange jamais les deux bases de calcul", () => {
    // La commission porte sur le prix chauffeur, PAS sur le total client :
    // 15 % de 210 ferait 31,50 € et mangerait des frais que le chauffeur
    // n'encaisse pas.
    const s = priceBreakdown(200);
    expect(s.commission).not.toBe(Math.round(s.clientTotal * 0.15 * 100) / 100);
    expect(s.commission).toBe(30);
  });

  it("descend au centime quand le taux tombe sur une demie", () => {
    const s = priceBreakdown(170); // 5 % = 8,50 € — un arrondi à l'euro mentirait
    expect(s.clientFee).toBe(8.5);
    expect(s.clientTotal).toBe(178.5);
    expect(s.commission).toBe(25.5);
    expect(s.driverNet).toBe(144.5);
  });

  it("expose les taux et les raccourcis", () => {
    expect(PLATFORM_COMMISSION_RATE).toBe(0.15);
    expect(CLIENT_SERVICE_FEE_RATE).toBe(0.05);
    expect(commissionOn(1000)).toBe(150);
    expect(driverNetOn(1000)).toBe(850);
    expect(clientTotalOn(1000)).toBe(1050);
  });

  it("neutralise un montant absent ou négatif", () => {
    expect(priceBreakdown(0).clientTotal).toBe(0);
    expect(priceBreakdown(-100).driverNet).toBe(0);
    expect(priceBreakdown(Number.NaN).commission).toBe(0);
  });
});

describe("pricing — décomposition depuis le total client", () => {
  it("retrouve le prix chauffeur à partir du total facturé", () => {
    for (const p of [120, 170, 200, 999, 1000, 1500]) {
      const forward = priceBreakdown(p);
      const back = breakdownFromClientTotal(forward.clientTotal);
      expect(back.driverPrice, String(p)).toBe(p);
      expect(back.commission, String(p)).toBe(forward.commission);
      expect(back.driverNet, String(p)).toBe(forward.driverNet);
    }
  });

  it("affiche toujours le total réellement facturé", () => {
    // Le total stocké fait foi : il a été encaissé. Le détail s'ajuste à lui,
    // jamais l'inverse — sinon la facture affichée cesse de correspondre au
    // relevé bancaire du client.
    for (const total of [178.5, 210, 535.5, 1050, 99.99]) {
      const s = breakdownFromClientTotal(total);
      expect(s.clientTotal, String(total)).toBe(total);
      expect(s.driverPrice + s.clientFee, String(total)).toBeCloseTo(total, 10);
    }
  });

  it("neutralise un total absent ou négatif", () => {
    expect(breakdownFromClientTotal(0).driverPrice).toBe(0);
    expect(breakdownFromClientTotal(-10).clientTotal).toBe(0);
  });
});

describe("pricing — cohérence des tarifs chauffeur", () => {
  it("accepte les tarifs des fixtures sans regarder leur gamme", () => {
    for (const d of drivers) {
      expect(isRateAcceptable("hour", d.pricePerHour), `${d.id} horaire`).toBe(true);
      expect(isRateAcceptable("day", d.pricePerDay), `${d.id} journalier`).toBe(true);
    }
  });

  it("n'est jamais modifié par le clamp serveur", () => {
    // Le tarif affiché est celui que le chauffeur a saisi, à l'euro près :
    // c'est toute la promesse d'un annuaire.
    for (const d of drivers) {
      expect(clampRate("hour", d.pricePerHour), d.id).toBe(d.pricePerHour);
      expect(clampRate("day", d.pricePerDay), d.id).toBe(d.pricePerDay);
    }
  });
});
