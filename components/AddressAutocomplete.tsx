"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLACES_DEBOUNCE_MS,
  shouldQueryPlaces,
  type PlaceSuggestion,
} from "@/lib/places";

/**
 * Champ d'adresse avec suggestions.
 *
 * ## Ce qu'il garantit
 *
 * - **Il reste utilisable sans fournisseur.** Si aucune clé n'est configurée
 *   (ou si le fournisseur tombe), la liste est vide et le champ redevient une
 *   saisie libre. On ne bloque jamais une réservation parce qu'une API tierce
 *   ne répond pas : une adresse tapée à la main est une adresse valide.
 * - **La valeur suit toujours la frappe.** `onChange` est émis à chaque
 *   caractère ; `onSelect` s'ajoute quand une suggestion est retenue. Un
 *   composant qui n'émettrait qu'à la sélection perdrait tout ce que
 *   l'utilisateur tape sans cliquer — le cas le plus fréquent.
 * - **Combobox accessible** : `role="combobox"` + `aria-activedescendant`,
 *   flèches pour naviguer, Entrée pour choisir, Échap pour fermer.
 *
 * ⚠️ Les réponses arrivent dans le désordre. Chaque requête porte un numéro de
 * séquence et une réponse plus ancienne que la dernière affichée est jetée :
 * sans cela, taper vite fait remonter les suggestions d'un préfixe précédent.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (place: PlaceSuggestion) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const boxRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  /** Ce que la dernière sélection a écrit : ne pas le re-interroger. */
  const chosen = useRef<string | null>(null);

  useEffect(() => {
    if (chosen.current === value) return;
    if (!shouldQueryPlaces(value)) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(value)}`);
        const data = await res.json();
        // Réponse périmée : une frappe plus récente est déjà partie.
        if (mine !== seq.current) return;
        const list = (data?.suggestions as PlaceSuggestion[]) ?? [];
        setSuggestions(list);
        setActive(-1);
        setOpen(list.length > 0);
      } catch {
        if (mine === seq.current) setSuggestions([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, PLACES_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  // Fermeture au clic extérieur — un listbox laissé ouvert recouvre la suite
  // du formulaire.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = (place: PlaceSuggestion) => {
    chosen.current = place.full;
    onChange(place.full);
    onSelect?.(place);
    setOpen(false);
    setSuggestions([]);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      // Uniquement quand une suggestion est surlignée : sinon Entrée doit
      // continuer à soumettre le formulaire avec la saisie libre.
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          chosen.current = null;
          onChange(e.target.value);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          active >= 0 ? `${listId}-${active}` : undefined
        }
        autoComplete="off"
        className="w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/30"
      />

      {loading && (
        <Loader2 className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-white/30" />
      )}

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-auto rounded-2xl glass-strong p-1 shadow-card"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                // `onMouseDown` et non `onClick` : le blur du champ se
                // déclencherait d'abord et fermerait la liste avant le clic.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition",
                  i === active ? "bg-white/10" : "hover:bg-white/5"
                )}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-royal-400" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white">
                    {s.label}
                  </span>
                  {s.context && (
                    <span className="block truncate text-[11px] text-white/45">
                      {s.context}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
