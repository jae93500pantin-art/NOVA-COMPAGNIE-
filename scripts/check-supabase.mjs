#!/usr/bin/env node
/**
 * Diagnostic de la configuration Supabase (auth réelle).
 *
 *   npm run check:auth
 *
 * Répond à une seule question : « pourquoi la connexion ne marche pas ? ».
 * Chaque vérification dit ce qui est cassé ET quoi faire, dans l'ordre où les
 * étapes doivent être franchies — inutile de vérifier le schéma si les clés
 * sont absentes.
 *
 * N'écrit rien, ne modifie rien, n'affiche jamais une clé en entier.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(root, ".env.local");

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  bold: "\x1b[1m",
};

const ok = (m) => console.log(`${c.green}  OK${c.reset}   ${m}`);
const bad = (m, fix) => {
  console.log(`${c.red}  KO${c.reset}   ${m}`);
  if (fix) console.log(`${c.dim}         → ${fix}${c.reset}`);
};
const warn = (m, fix) => {
  console.log(`${c.yellow}  ~ ${c.reset}   ${m}`);
  if (fix) console.log(`${c.dim}         → ${fix}${c.reset}`);
};

/** Minimal .env parser — no dependency, tolerant of comments and quotes. */
function readEnv(path) {
  if (!existsSync(path)) return null;
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Never print a secret: length and first characters are enough to identify it. */
const preview = (v) => `${v.slice(0, 6)}…  (${v.length} car.)`;

async function main() {
  console.log(`\n${c.bold}Diagnostic auth Supabase — Nova Compagnie${c.reset}\n`);

  /* ── 1. Le fichier ─────────────────────────────────────────── */
  console.log(`${c.bold}1. Fichier .env.local${c.reset}`);
  const env = readEnv(ENV_PATH);
  if (!env) {
    bad(".env.local introuvable", "cp .env.local.example .env.local");
    return 1;
  }
  ok(".env.local présent");

  /* ── 2. Les clés ───────────────────────────────────────────── */
  console.log(`\n${c.bold}2. Clés${c.reset}`);
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  let fatal = false;
  if (!url) {
    bad("NEXT_PUBLIC_SUPABASE_URL vide", "Supabase → Project Settings → API → Project URL");
    fatal = true;
  } else if (!url.startsWith("https://")) {
    bad(`NEXT_PUBLIC_SUPABASE_URL = ${url}`, "doit commencer par https://");
    fatal = true;
  } else ok(`URL ${url}`);

  // Ces deux seuils sont ceux de lib/config.ts : les reproduire ici garantit
  // que le diagnostic et l'application sont d'accord sur « configuré ».
  if (!anon) {
    bad("NEXT_PUBLIC_SUPABASE_ANON_KEY vide", "Project Settings → API → anon / public");
    fatal = true;
  } else if (anon.length <= 20) {
    bad("NEXT_PUBLIC_SUPABASE_ANON_KEY trop courte", "clé tronquée ? elle fait ~200+ caractères");
    fatal = true;
  } else ok(`anon key ${preview(anon)}`);

  if (!service) {
    warn(
      "SUPABASE_SERVICE_ROLE_KEY vide",
      "facultative : requise seulement pour /admin et la suppression de compte RGPD"
    );
  } else if (service === anon) {
    bad("SUPABASE_SERVICE_ROLE_KEY identique à la clé anon", "recopier la clé service_role, pas anon");
  } else ok(`service_role ${preview(service)}`);

  if (fatal) {
    console.log(
      `\n${c.red}Auth inactive${c.reset} — l'app reste en mode démo (test/test, driver/driver).\n`
    );
    return 1;
  }

  /* ── 3. Le projet répond ───────────────────────────────────── */
  console.log(`\n${c.bold}3. Connexion au projet${c.reset}`);
  const headers = { apikey: anon, Authorization: `Bearer ${anon}` };
  let res;
  try {
    res = await fetch(`${url}/auth/v1/health`, { headers });
  } catch (e) {
    bad(`Projet injoignable (${e.message})`, "URL erronée, projet en pause, ou pas de réseau");
    return 1;
  }
  if (res.status === 401) {
    bad("Projet joignable mais clé refusée (401)", "la clé anon n'appartient pas à ce projet");
    return 1;
  }
  if (!res.ok) {
    bad(`Réponse inattendue du service auth (HTTP ${res.status})`);
    return 1;
  }
  ok("Service d'authentification joignable");

  /* ── 4. Le schéma ──────────────────────────────────────────── */
  console.log(`\n${c.bold}4. Schéma SQL${c.reset}`);
  const probe = async (select) =>
    fetch(`${url}/rest/v1/profiles?select=${select}&limit=1`, { headers });

  const base = await probe("id");
  if (base.status === 404 || base.status === 400) {
    const body = await base.text();
    bad(
      "table public.profiles absente",
      "coller supabase/setup/1-schema.sql dans le SQL Editor"
    );
    console.log(`${c.dim}         ${body.slice(0, 160)}${c.reset}`);
    return 1;
  }
  if (!base.ok) {
    bad(`Lecture de profiles refusée (HTTP ${base.status})`, "RLS non appliquée ? relancer 1-schema.sql");
    return 1;
  }
  ok("table public.profiles présente et lisible");

  // La colonne `status` n'apparaît qu'après l'étape 3 : c'est le marqueur le
  // plus fiable pour savoir si la migration en deux temps a bien été jouée.
  const migrated = await probe("id,status");
  if (migrated.ok) ok("migration back-office appliquée (colonne status)");
  else
    warn(
      "colonne profiles.status absente — migration back-office non jouée",
      "lancer supabase/setup/2-enum-admin.sql SEUL, puis 3-admin-migration.sql"
    );

  /* ── 5. Verdict ────────────────────────────────────────────── */
  console.log(
    `\n${c.green}${c.bold}Auth réelle active.${c.reset} Redémarre le serveur ` +
      `(${c.dim}les NEXT_PUBLIC_* sont figées au démarrage${c.reset}) puis teste ` +
      `l'inscription sur /auth/register.\n`
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`\n${c.red}Le diagnostic a échoué :${c.reset}`, err);
    process.exit(1);
  }
);
