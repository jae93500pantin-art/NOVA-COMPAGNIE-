import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { dictionaries } from "@/lib/dictionaries";

/**
 * Chaque clé `t("a.b")` écrite en dur dans le code existe en FR **et** en EN.
 *
 * ⚠️ Pourquoi ce test existe : `t()` retombe sur la clé elle-même quand elle
 * manque. Rien ne plante, rien ne s'affiche en rouge — la page publie
 * simplement « transfer.badge247 » en clair. C'est arrivé sur l'encart
 * aéroport de l'accueil (constaté le 2026-10-12) : la clé avait été retirée du
 * dictionnaire, pas du composant.
 *
 * Le typage `Dict` ne l'attrape pas : `t` prend une `string`.
 */

const ROOT = resolve(__dirname, "..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function lookup(dict: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (node, part) =>
      node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
    dict
  );
}

const used = new Map<string, string>();
for (const dir of ["app", "components", "lib"]) {
  for (const file of sources(join(ROOT, dir))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bt\("([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)"/g)) {
      if (!used.has(m[1])) used.set(m[1], file.slice(ROOT.length + 1));
    }
  }
}

describe("clés de traduction", () => {
  it("en trouve dans le code", () => {
    expect(used.size).toBeGreaterThan(100);
  });

  it.each(["fr", "en"] as const)("chaque clé utilisée existe en %s", (lang) => {
    const missing = Array.from(used)
      .filter(([key]) => typeof lookup(dictionaries[lang], key) !== "string")
      .map(([key, file]) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });
});
