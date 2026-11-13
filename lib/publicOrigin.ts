/**
 * L'adresse PUBLIQUE du site (`https://novacompagnie.com`), vue depuis une
 * route serveur placée derrière un proxy.
 *
 * Derrière Caddy (Azure) comme derrière le proxy de Render, Next reçoit la
 * requête en HTTP sur un port interne : `new URL(req.url).origin` vaut alors
 * `http://…` — voire `http://localhost:10000`. Un lien fabriqué avec, comme
 * celui du mot de passe oublié, enverrait le visiteur sur une adresse
 * interne ou non chiffrée.
 *
 * Ordre de lecture, pour l'hôte comme pour le protocole :
 *   1. `x-forwarded-host` / `x-forwarded-proto` (posés par le proxy) ;
 *   2. l'en-tête `Host`, que Render transmet tel quel ;
 *   3. l'URL de la requête (développement local, sans proxy).
 *
 * ⚠️ Ces en-têtes viennent du réseau. C'est sans danger ICI parce que l'origine
 * ne sert qu'à un `redirectTo` que Supabase confronte à sa liste d'adresses
 * autorisées, et à une redirection vers une page de ce même site. Ne pas s'en
 * servir pour décider d'une autorisation.
 *
 * Pur (aucune dépendance à Next), testé dans `tests/publicOrigin.test.ts`.
 */
export function publicOrigin(req: { url: string; headers: Headers }): string {
  const url = new URL(req.url);
  const first = (v: string | null) => v?.split(",")[0].trim() || null;

  const host =
    first(req.headers.get("x-forwarded-host")) ??
    first(req.headers.get("host")) ??
    url.host;
  const proto =
    first(req.headers.get("x-forwarded-proto")) ?? url.protocol.replace(":", "");

  return `${proto}://${host}`;
}
