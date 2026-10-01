import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { ADMIN_REFUSALS, adminRefusal } from "@/lib/adminHttp";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/adminDocuments";

/**
 * Garanties de sécurité de la consultation des pièces justificatives.
 *
 * ⚠️ Ces tests LISENT LE CODE SOURCE des routes d'administration. C'est
 * inhabituel, et c'est assumé : la propriété à garantir n'est pas le résultat
 * d'une fonction, c'est « aucune route d'administration n'oublie sa garde ».
 * Un test unitaire sur requireAdmin ne l'attraperait pas — le risque n'est pas
 * que la garde soit fausse, c'est qu'une route NEUVE oublie de l'appeler, et
 * ce test-là échouera le jour où ça arrive.
 *
 * Le pendant en conditions réelles (non-admin refusé par le serveur, lien
 * signé qui cesse de fonctionner) se lance avec
 * scripts/check-admin-security.mjs, qui exige un serveur et les clés.
 */

const ADMIN_API = resolve(__dirname, "..", "app", "api", "admin");

function adminRoutes(dir: string = ADMIN_API): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...adminRoutes(p));
    else if (entry.name === "route.ts") out.push(p);
  }
  return out;
}

const routes = adminRoutes();
const named = routes.map((r) => [r.split(/[\/]app[\/]/)[1], r] as const);

describe("routes d'administration — la garde n'est jamais oubliée", () => {
  it("trouve les routes d'administration", () => {
    expect(routes.length).toBeGreaterThanOrEqual(3);
  });

  it.each(named)("%s garde le client privilégié", (_name, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("requireAdmin()");
    // Le refus doit PRÉCÉDER l'usage du client privilégié : adminDb()
    // contourne la RLS, l'appeler avant d'avoir refusé rendrait la garde
    // décorative.
    const guardAt = src.indexOf("requireAdmin()");
    const dbAt = src.indexOf("adminDb()");
    expect(guardAt).toBeGreaterThan(-1);
    if (dbAt > -1) expect(guardAt).toBeLessThan(dbAt);
  });

  it.each(named)("%s refuse tout etat different de ok", (_name, file) => {
    const src = readFileSync(file, "utf8");
    // Le test n'impose pas une formulation, il impose la comparaison : une
    // route qui ne vérifie pas l'état laisse passer un visiteur anonyme.
    expect(src).toMatch(/guard\.state !== "ok"/);
  });

  it("aucune route d'administration ne rend d'URL de stockage brute", () => {
    // Une URL publique du bucket resterait valable indéfiniment : seule la
    // signature est admise, et elle ne vit que dans lib/adminDocuments.
    for (const file of routes) {
      expect(readFileSync(file, "utf8"), file).not.toContain("getPublicUrl");
    }
  });
});

describe("consultation des pieces — liens signes", () => {
  const source = readFileSync(
    resolve(__dirname, "..", "lib", "adminDocuments.ts"),
    "utf8"
  );

  it("la cle de service ne peut pas entrer dans un bundle navigateur", () => {
    // server-only fait échouer la COMPILATION si un composant client importe
    // ce module : c'est la seule barrière qui ne dépend pas de la vigilance.
    expect(source.startsWith('import "server-only";')).toBe(true);
  });

  it("limite la duree de vie d'un lien a 5 minutes", () => {
    // Assez pour regarder un document, trop peu pour qu'un lien oublié dans
    // un historique serve encore à quelque chose.
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(300);
    expect(SIGNED_URL_TTL_SECONDS).toBeGreaterThan(0);
  });

  it("signe les liens, et ne les rend jamais publics", () => {
    expect(source).toContain("createSignedUrl");
    expect(source).not.toContain("getPublicUrl");
  });
});

describe("codes de refus", () => {
  it("distingue 401 (identifiez-vous) et 403 (pas le droit)", () => {
    // Les confondre trompe l'appelant : se reconnecter aide dans un cas, pas
    // dans l'autre.
    expect(adminRefusal("anonymous").status).toBe(401);
    expect(adminRefusal("forbidden").status).toBe(403);
  });

  it("repond 503 quand l'instance n'est pas configuree, pas 500", () => {
    // Un 500 enverrait chercher un bug là où il manque une variable.
    expect(adminRefusal("unconfigured").status).toBe(503);
    expect(adminRefusal("no-service-role").status).toBe(503);
  });

  it("donne un message a chaque refus", () => {
    for (const [state, r] of Object.entries(ADMIN_REFUSALS)) {
      expect(r.error.length, state).toBeGreaterThan(10);
    }
  });
});
