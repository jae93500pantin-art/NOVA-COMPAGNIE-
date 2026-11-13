/**
 * Squelette affiché AU CLIC, pendant que le serveur rend la page suivante.
 *
 * ⚠️ Ce n'est pas un ornement : `/drivers`, `/drivers/[id]` et
 * `/transfert-aeroport` sont `force-dynamic` (lecture de l'annuaire à chaque
 * requête). Sans `loading.tsx`, `next/link` ne peut rien précharger de ces
 * routes, et un clic ne produisait AUCUN retour visuel tant que Supabase
 * n'avait pas répondu — c'est la « latence » ressentie sur la navigation.
 * Avec lui, le lien précharge la coquille jusqu'à cette frontière et la
 * navigation s'affiche immédiatement ; le contenu arrive en streaming.
 *
 * Composant serveur, sans animation JS : il doit coûter zéro au clic.
 */
export default function SiteLoading() {
  return (
    <div
      className="mx-auto max-w-7xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Chargement…</span>
      <div className="animate-pulse space-y-6 motion-reduce:animate-none">
        <div className="h-4 w-32 rounded-full bg-white/[0.06]" />
        <div className="h-9 w-2/3 max-w-md rounded-xl bg-white/[0.06]" />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 rounded-3xl border border-white/[0.06] bg-white/[0.03]" />
          ))}
        </div>
      </div>
    </div>
  );
}
