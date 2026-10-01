/**
 * Vérifie EN CONDITIONS RÉELLES les deux garanties de la consultation des
 * pièces justificatives :
 *
 *   1. un non-admin est refusé par le serveur (pas seulement par l'interface) ;
 *   2. un lien signé cesse de fonctionner une fois expiré.
 *
 * Les tests unitaires (`tests/adminSecurity.test.ts`) vérifient que les routes
 * appellent leur garde ; ce script vérifie que Supabase et le serveur se
 * comportent comme prévu. Il exige donc un serveur en ligne et les clés.
 *
 *   node scripts/check-admin-security.mjs [http://localhost:3000]
 */

import fs from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ENV_PATH = new URL("../.env.local", import.meta.url);

const env = {};
for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "OK  " : "ECHEC"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

/* 1. Un visiteur sans session est refusé par le SERVEUR ------------------- */

console.log("\n1. Routes d'administration, visiteur anonyme");
const anonymous = [
  ["GET", "/api/admin/documents/expiring"],
  ["POST", "/api/admin/documents/expiring"],
  ["PATCH", "/api/admin/drivers/00000000-0000-0000-0000-000000000000/documents"],
  ["POST", "/api/admin/drivers/00000000-0000-0000-0000-000000000000/reject"],
  ["POST", "/api/admin/drivers/00000000-0000-0000-0000-000000000000/approve"],
];
for (const [method, path] of anonymous) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : "{}",
    });
    // 401 attendu. ⚠️ Un 400 ou un 404 voudrait dire que la route a commencé à
    // travailler AVANT de refuser — donc que la garde arrive trop tard.
    check(res.status === 401, `${method} ${path}`, `HTTP ${res.status}`);
  } catch (e) {
    check(false, `${method} ${path}`, e.message);
  }
}

console.log("\n2. Écran de vérification, visiteur anonyme");
const page = await fetch(`${BASE}/admin/chauffeurs/00000000-0000-0000-0000-000000000000`, {
  redirect: "manual",
});
check(
  page.status === 307 || page.status === 302,
  "redirige vers /admin/login",
  `HTTP ${page.status} ${page.headers.get("location") ?? ""}`
);

/* 3. Un lien signé expire ------------------------------------------------- */

console.log("\n3. Lien signé expiré");
if (!url || !key) {
  check(false, "clés Supabase absentes de .env.local");
} else {
  const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const probe = `__verif-securite-${Date.now()}.png`;

  // ⚠️ Un PNG, pas un .txt : le bucket restreint les types MIME, et un dépôt
  // refusé empêcherait de tester ce qui nous intéresse ici — l'expiration.
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64"
  );
  const up = await fetch(`${url}/storage/v1/object/driver-docs/${probe}`, {
    method: "POST",
    headers: { ...h, "Content-Type": "image/png" },
    body: PNG,
  });
  if (!up.ok) {
    check(false, "dépôt du fichier témoin", `HTTP ${up.status}`);
  } else {
    const signed = await fetch(
      `${url}/storage/v1/object/sign/driver-docs/${probe}`,
      { method: "POST", headers: h, body: JSON.stringify({ expiresIn: 1 }) }
    );
    const { signedURL } = await signed.json();
    const link = `${url}/storage/v1${signedURL}`;

    const now = await fetch(link);
    check(now.ok, "le lien fonctionne immédiatement", `HTTP ${now.status}`);

    await new Promise((r) => setTimeout(r, 2500));
    const later = await fetch(link);
    check(!later.ok, "le lien ne fonctionne plus après expiration", `HTTP ${later.status}`);

    await fetch(`${url}/storage/v1/object/driver-docs`, {
      method: "DELETE",
      headers: h,
      body: JSON.stringify({ prefixes: [probe] }),
    });
  }
}

/* 4. Le bucket est privé -------------------------------------------------- */

console.log("\n4. Bucket driver-docs");
if (url && key) {
  const b = await fetch(`${url}/storage/v1/bucket/driver-docs`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const info = b.ok ? await b.json() : null;
  check(info?.public === false, "privé (aucun accès public)", `public=${info?.public}`);
}

console.log(
  failures === 0
    ? "\nToutes les garanties sont vérifiées.\n"
    : `\n${failures} vérification(s) en échec.\n`
);
process.exit(failures === 0 ? 0 : 1);
