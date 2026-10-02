"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  Route,
  MessageSquare,
  Send,
  Loader2,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  QUOTE_ERRORS,
  QUOTE_LIMITS,
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
    details: "",
  });
  const [error, setError] = useState<string | null>(null);
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
        body: JSON.stringify({ ...form, driverId: driverSlug }),
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
          Nous transmettons votre demande à {driverName}. Il vous répondra
          directement avec son tarif et ses disponibilités. Aucune course
          n&apos;est réservée à ce stade.
        </p>
        <button
          onClick={() => {
            setForm({ name: "", email: "", phone: "", trip: "", details: "" });
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
    <form onSubmit={submit} className="rounded-3xl glass-strong p-6">
      <p className="text-[11px] uppercase tracking-wider text-white/40">
        Demander un devis
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-white/50">
        Sans compte. {driverName} vous répond avec son propre tarif.
      </p>

      <div className="mt-4 space-y-3">
        <Field icon={User} placeholder="Votre nom" value={form.name} onChange={set("name")} max={QUOTE_LIMITS.name} />
        <Field icon={Mail} type="email" placeholder="Votre e-mail" value={form.email} onChange={set("email")} max={QUOTE_LIMITS.email} />
        <Field icon={Phone} type="tel" placeholder="Votre téléphone" value={form.phone} onChange={set("phone")} max={QUOTE_LIMITS.phone} />
        <Field icon={Route} placeholder="Trajet souhaité (départ → destination)" value={form.trip} onChange={set("trip")} max={QUOTE_LIMITS.trip} />
        <div className="relative">
          <MessageSquare className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-white/30" />
          <textarea
            value={form.details}
            onChange={set("details")}
            maxLength={QUOTE_LIMITS.details}
            rows={3}
            placeholder="Précisions (date approximative, nombre de passagers, bagages…)"
            className="input resize-none pl-10"
          />
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
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
  max,
}: {
  icon: typeof User;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  max: number;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
      <input
        type={type}
        value={value}
        onChange={onChange}
        maxLength={max}
        placeholder={placeholder}
        className="input pl-10"
      />
    </div>
  );
}
