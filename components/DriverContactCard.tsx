import { MessageCircle, Mail, CalendarClock, Info } from "lucide-react";
import type { Driver } from "@/lib/types";
import { formatPrice } from "@/lib/utils";
import { whatsappUrl, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import { DAY_LABELS_FR } from "@/lib/schedule";

/**
 * Bloc de contact d'une fiche chauffeur. Remplace `BookingWidget`.
 *
 * ## ⚠️ Ce bloc ne réserve rien et n'encaisse rien
 *
 * Statut d'annuaire : Nova met en relation, elle ne vend pas la course. Ce qui
 * a été retiré avec `BookingWidget`, et ne doit pas revenir ici : le sélecteur
 * heure / journée / aéroport, le curseur de durée, le choix d'un créneau, le
 * bouton « Demander cette course », le total client et sa ligne de frais.
 *
 * Trois choses restent, et suffisent à un annuaire :
 *
 * 1. **les tarifs annoncés par le chauffeur**, tels qu'il les a saisis — aucun
 *    montant calculé par la plateforme, donc rien qui ressemble à un devis ;
 * 2. **ses disponibilités**, s'il a renseigné un planning ;
 * 3. **un moyen de le joindre**.
 *
 * ⚠️ Le contact passe par la ligne Nova, **pas par le téléphone du chauffeur** :
 * `profiles.phone` n'est lisible que par son propriétaire (RLS), et le publier
 * demanderait son consentement explicite — une décision, pas un `select` de
 * plus. En l'état, la mise en relation est donc assistée.
 *
 * Composant **serveur** : aucun état, aucun événement. Le texte est en français
 * en dur, comme le reste de la page qui l'accueille.
 */
export function DriverContactCard({ driver }: { driver: Driver }) {
  const name = `${driver.firstName} ${driver.lastName}`.trim();
  // ⚠️ Un planning « tous les jours, 00:00–23:59 » EST le défaut d'un chauffeur
  // qui n'a rien renseigné (`DEFAULT_SCHEDULE`). L'afficher comme une
  // disponibilité déclarée serait une information inventée, alors qu'elle n'est
  // qu'une absence de contrainte.
  const week = driver.schedule ?? [];
  const hasRealSchedule =
    week.length === 7 &&
    !week.every((d) => d.open && d.start === "00:00" && d.end === "23:59");

  return (
    <div className="sticky top-28 space-y-4">
      <div className="rounded-3xl glass-strong p-6 shadow-card">
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Tarifs annoncés par le chauffeur
        </p>
        <div className="mt-3 space-y-2">
          {driver.pricePerHour > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-white/60">À l&apos;heure</span>
              <span className="text-xl font-semibold text-white">
                {formatPrice(driver.pricePerHour)}
                <span className="text-sm font-normal text-white/40"> / h</span>
              </span>
            </div>
          )}
          {driver.pricePerDay > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-white/60">À la journée</span>
              <span className="text-xl font-semibold text-white">
                {formatPrice(driver.pricePerDay)}
                <span className="text-sm font-normal text-white/40"> / jour</span>
              </span>
            </div>
          )}
        </div>

        {/* La mention qui empêche le malentendu. Un visiteur qui a vu un tarif
            et un bouton suppose qu'il vient de commander : il faut dire, au même
            endroit, avec qui le contrat se noue. */}
        <p className="mt-4 flex gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-white/55">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-royal-300" />
          <span>
            Nova Compagnie est un <strong className="text-white/75">annuaire</strong>.
            La prestation, son prix définitif et son paiement se règlent{" "}
            <strong className="text-white/75">directement avec le chauffeur</strong>,
            qui facture son client.
          </span>
        </p>

        <a
          href={whatsappUrl(
            `Bonjour, je souhaite être mis en relation avec ${name} (Nova Compagnie).`
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary mt-4 w-full text-sm"
        >
          <MessageCircle className="h-4 w-4" />
          Être mis en relation
        </a>
        <p className="mt-2 text-center text-[11px] text-white/35">
          WhatsApp {WHATSAPP_DISPLAY}
        </p>

        <a href="/contact" className="btn-ghost mt-2 w-full text-sm">
          <Mail className="h-4 w-4" />
          Nous écrire
        </a>
      </div>

      {hasRealSchedule && (
        <div className="rounded-3xl glass p-6">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
            <CalendarClock className="h-3.5 w-3.5 text-royal-400" />
            Disponibilités habituelles
          </p>
          <ul className="mt-3 space-y-1.5">
            {(driver.schedule ?? []).map((day, i) => (
              <li
                key={DAY_LABELS_FR[i]}
                className="flex items-center justify-between text-xs"
              >
                <span className={day.open ? "text-white/70" : "text-white/30"}>
                  {DAY_LABELS_FR[i]}
                </span>
                <span className={day.open ? "text-white/60" : "text-white/25"}>
                  {day.open ? `${day.start} – ${day.end}` : "Fermé"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-white/35">
            Indicatif : l&apos;horaire exact se convient avec le chauffeur.
          </p>
        </div>
      )}
    </div>
  );
}
