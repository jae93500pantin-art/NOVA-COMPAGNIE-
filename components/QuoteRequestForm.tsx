"use client";

import { useId, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  Route,
  CalendarClock,
  MessageSquare,
  Send,
  Loader2,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  QUOTE_ERRORS,
  QUOTE_HONEYPOT_FIELD,
  QUOTE_LIMITS,
  QUOTE_RETENTION_MONTHS,
  quoteError,
  type QuoteDraft,
  type QuoteField,
} from "@/lib/quoteRequest";
import { whatsappUrl } from "@/lib/whatsapp";

/**
 * Demande de devis depuis une fiche chauffeur, **sans compte**.
 *
 * ## ⚠️ Ce n'est pas une réservation, et le libellé doit le dire
 *
 * Statut d'annuaire : le site ne prend aucune réservation et n'encaisse aucune
 * course. Ce formulaire **transmet une demande** ; le chauffeur chiffre et
 * facture. D'où les choix de vocabulaire, qui ne sont pas cosmétiques :
 *
 * - « Demander un devis », jamais « Réserver » ni « Commander » ;
 * - aucun créneau à choisir — une date et une heure imposées ici se liraient
 *   comme un créneau retenu ;
 * - **aucun montant affiché ni calculé**, ni avant ni après l'envoi ;
 * - la confirmation annonce une **mise en relation**, pas une course confirmée.
 *
 * ## ⚠️ Aucune inscription demandée
 *
 * C'est le point de ce composant. Exiger un compte pour obtenir un prix
 * écarterait la majorité des visiteurs d'un annuaire, dont le seul service est
 * la mise en relation. Le compte ne sert qu'aux avis (voir `DriverReviews`).
 */
export function QuoteRequestForm({
  driverSlug,
  driverName,
}: {
  driverSlug: string;
  driverName: string;
}) {
  const [form, setForm] = useState<QuoteDraft>({
    name: "",
    email: "",
    phone: "",
    trip: "",
    when: "",
    details: "",
  });
  const [error, setError] = useState<string | null>(null);
  // Champ piège : un humain ne le voit pas, donc le laisse vide.
  const [trap, setTrap] = useState("");
  const detailsId = useId();
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  const set =
    (key: keyof QuoteDraft) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Les mêmes règles que la route : l'erreur arrive avant l'aller-retour,
    // jamais à sa place — `/api/quotes` les rejoue.
    const invalid: QuoteField | null = quoteError(form);
    if (invalid) {
      setError(QUOTE_ERRORS[invalid]);
      return;
    }
    setError(null);
    setStatus("sending");
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          driverId: driverSlug,
          [QUOTE_HONEYPOT_FIELD]: trap,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Envoi impossible.");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Le serveur ne répond pas. Réessayez, ou passez par WhatsApp.");
      setStatus("idle");
    }
  };

  if (status === "sent") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-3xl glass-strong p-6 text-center"
      >
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
        <p className="mt-3 text-sm font-medium text-white">
          Demande transmise
        </p>
        {/* ⚠️ « mise en relation », pas « réservation confirmée » : rien n'est
            réservé, et le prix reste à convenir avec le chauffeur. */}
        <p className="mt-2 text-xs leading-relaxed text-white/55">
          Nous transmettons votre demande à {driverName}, qui vous recontactera
          directement avec son tarif et ses disponibilités. Aucune course
          n&apos;est réservée à ce stade.
        </p>
        <button
          onClick={() => {
            setForm({ name: "", email: "", phone: "", trip: "", when: "", details: "" });
            setTrap("");
            setStatus("idle");
          }}
          className="btn-ghost mt-4 w-full text-sm"
        >
          Envoyer une autre demande
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="relative rounded-3xl glass-strong p-6">
      <p className="text-[11px] uppercase tracking-wider text-white/40">
        Demander un devis
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-white/50">
        {/* ⚠️ « Nova transmet », pas « X vous répond » : la demande arrive chez
            Nova, qui la fait suivre. Promettre la réponse du chauffeur, c'est
            garantir ce que personne ne contrôle. */}
        Sans compte. Nova transmet votre demande à {driverName}, qui vous
        répond avec son propre tarif.
      </p>

      <div className="mt-4 space-y-3">
        {/* ⚠️ Des étiquettes FIXES, pas seulement un texte d'exemple : le
            texte gris disparaît à la saisie, et sur mobile on ne sait plus ce
            qu'on remplit. Le texte d'exemple reste, comme exemple. */}
        <Field label="Votre nom" icon={User} placeholder="Ex. Claire Moreau" value={form.name} onChange={set("name")} max={QUOTE_LIMITS.name} autoComplete="name" />
        <Field label="Votre e-mail" icon={Mail} type="email" placeholder="Ex. claire@exemple.fr" value={form.email} onChange={set("email")} max={QUOTE_LIMITS.email} autoComplete="email" />
        <Field label="Votre téléphone" icon={Phone} type="tel" placeholder="Ex. 06 12 34 56 78" value={form.phone} onChange={set("phone")} max={QUOTE_LIMITS.phone} autoComplete="tel" />
        <Field label="Trajet souhaité" icon={Route} placeholder="Ex. Orly → Paris 8e" value={form.trip} onChange={set("trip")} max={QUOTE_LIMITS.trip} autoComplete="off" />
        {/* ⚠️ Texte libre, facultatif — PAS un sélecteur de date : rien n'est
            réservé, le chauffeur dit s'il est disponible (`QuoteDraft.when`). */}
        <Field label="Date et heure souhaitées" optional icon={CalendarClock} placeholder="Ex. vendredi 17 octobre vers 7 h" value={form.when ?? ""} onChange={set("when")} max={QUOTE_LIMITS.when} autoComplete="off" />
        <div>
          <label htmlFor={detailsId} className="mb-1.5 block text-xs font-medium text-white/60">
            Précisions <span className="font-normal text-white/35">(facultatif)</span>
          </label>
          <div className="relative">
            <MessageSquare className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-white/30" />
            <textarea
              id={detailsId}
              value={form.details}
              onChange={set("details")}
              maxLength={QUOTE_LIMITS.details}
              rows={3}
              placeholder="Nombre de passagers, bagages, numéro de vol…"
              className="input resize-none pl-10"
            />
          </div>
        </div>
        {/* Champ piège (antispam). ⚠️ Hors écran plutôt que display:none —
            certains robots sautent les champs masqués —, hors tabulation et
            caché aux lecteurs d'écran, sans autoremplissage. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Ne pas remplir
            <input
              type="text"
              name={QUOTE_HONEYPOT_FIELD}
              tabIndex={-1}
              autoComplete="off"
              value={trap}
              onChange={(e) => setTrap(e.target.value)}
            />
          </label>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-xs text-red-300"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <button
        type="submit"
        disabled={status === "sending"}
        className="btn-primary mt-4 w-full text-sm disabled:opacity-50"
      >
        {status === "sending" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Demander un devis
      </button>

      {/* La mention qui empêche le malentendu, au même endroit que le bouton :
          un visiteur qui vient de remplir un formulaire suppose avoir commandé. */}
      <p className="mt-3 flex gap-2 text-[11px] leading-relaxed text-white/45">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-royal-300" />
        <span>
          Nova Compagnie transmet votre demande : elle ne réserve pas la course,
          ne fixe pas le prix et n&apos;encaisse rien. Le devis et la facture
          viennent du chauffeur.
        </span>
      </p>
      {/* ⚠️ Information obligatoire AU MOMENT de la collecte (art. 13 RGPD) :
          ces visiteurs n'ont pas de compte, donc aucune autre occasion de la
          lire. La durée vient de la même constante que la purge de la console
          et que /legal/confidentialite. */}
      <p className="mt-2 text-[11px] leading-relaxed text-white/35">
        Vos coordonnées servent uniquement à transmettre cette demande à{" "}
        {driverName} et à vous recontacter. Conservées {QUOTE_RETENTION_MONTHS}{" "}
        mois au plus.{" "}
        <a
          href="/legal/confidentialite"
          className="underline underline-offset-2 hover:text-white/60"
        >
          Politique de confidentialité
        </a>
      </p>
      <a
        href={whatsappUrl(
          `Bonjour, je souhaite un devis avec ${driverName} (Nova Compagnie).`
        )}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block text-center text-[11px] text-white/35 underline-offset-2 hover:text-white/60 hover:underline"
      >
        Ou passez par WhatsApp
      </a>
    </form>
  );
}

function Field({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
  max,
  autoComplete,
  optional = false,
}: {
  label: string;
  optional?: boolean;
  icon: typeof User;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  max: number;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-white/60">
        {label}
        {optional && <span className="font-normal text-white/35"> (facultatif)</span>}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          id={id}
          autoComplete={autoComplete}
          type={type}
          value={value}
          onChange={onChange}
          maxLength={max}
          placeholder={placeholder}
          className="input pl-10"
        />
      </div>
    </div>
  );
}
