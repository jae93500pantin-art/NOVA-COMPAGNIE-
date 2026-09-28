"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Search, MapPin, Calendar } from "lucide-react";
import { cities } from "@/lib/cities";
import { todayISODate } from "@/lib/calendar";
import { useI18n } from "@/lib/i18n";
import { DatePicker } from "./DatePicker";

/**
 * Carte de recherche de l'accueil : une ville, un créneau, et on va voir
 * l'annuaire.
 *
 * ## ⚠️ Le créneau est un CRITÈRE DE RECHERCHE, pas une réservation
 *
 * C'est toute la différence, et elle doit rester lisible dans le code comme à
 * l'écran. Ce qu'il fait : filtrer l'annuaire sur le **planning hebdomadaire**
 * que les chauffeurs déclarent (`isWithinSchedule`), pour ne pas afficher
 * quelqu'un qui ne travaille pas le dimanche matin. Ce qu'il ne fait pas :
 * bloquer un horaire, engager un chauffeur, créer quoi que ce soit.
 *
 * - Le créneau voyage par l'**URL** (`?date=&time=`), pas par `sessionStorage` :
 *   il alimente un filtre partageable, plus un formulaire de réservation. Les
 *   clés `jw_booking_*` ont disparu avec celui-ci.
 * - Le libellé du bouton reste « Voir les chauffeurs ». ⚠️ Ne pas le retitrer
 *   « Réserver » : ce serait promettre exactement ce que le site ne fait pas.
 * - L'heure est **facultative** — une date seule filtre sur le jour entier.
 */
export function SearchBar() {
  const router = useRouter();
  const { t } = useI18n();
  const today = todayISODate();
  const [city, setCity] = useState("paris");
  const [date, setDate] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [time, setTime] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set("city", city);
    // Rien de choisi = aucun filtre. Un paramètre vide dans l'URL se lirait
    // comme « le 1ᵉʳ janvier de l'an zéro » côté annuaire.
    if (date) params.set("date", date);
    // Plusieurs jours : on ne pose la fin que si elle ajoute quelque chose.
    // `dateEnd` egal au debut serait un parametre pour rien, et l'annuaire
    // doit pouvoir distinguer « un jour » de « une plage d'un jour ».
    if (date && dateEnd && dateEnd > date) params.set("dateEnd", dateEnd);
    if (date && time) params.set("time", time);
    router.push(`/drivers?${params.toString()}`);
  };

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-2 rounded-3xl glass-strong p-3 shadow-card"
    >
      <Field icon={<MapPin className="h-4 w-4 text-royal-400" />} label={t("search.city")}>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full bg-transparent text-sm font-medium text-white outline-none [&>option]:text-ink-900"
        >
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}, {c.country}
            </option>
          ))}
        </select>
      </Field>

      <Field icon={<Calendar className="h-4 w-4 text-royal-400" />} label={t("search.date")}>
        {/* `mode="range"` : un premier clic ouvre la plage, le second la ferme,
            un troisieme repart de zero. Un seul clic suffit donc toujours pour
            un jour unique — les plusieurs jours ne coutent rien a qui n'en veut
            pas. L'heure, si elle est donnee, vaut pour CHAQUE jour. */}
        <DatePicker
          date={date}
          time={time}
          endDate={dateEnd}
          mode="range"
          min={today}
          variant="search"
          showTime
          onRangeChange={(start, end) => {
            setDate(start);
            setDateEnd(end);
          }}
          onChange={(d, tm) => {
            setDate(d);
            setTime(tm);
          }}
        />
      </Field>

      <button
        type="submit"
        className="btn-primary mt-1 min-h-[52px] w-full px-7 text-sm"
      >
        <Search className="h-4 w-4" />
        {t("search.cta")}
      </button>
    </motion.form>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 transition hover:border-white/10 hover:bg-white/[0.04]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}
