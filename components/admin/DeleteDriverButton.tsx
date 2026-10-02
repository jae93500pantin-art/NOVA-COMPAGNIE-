"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";

/**
 * Suppression définitive d'un dossier chauffeur, depuis la console.
 *
 * ## ⚠️ Deux clics, et le second nomme la personne
 *
 * Un seul clic sur une ligne de tableau se donne par erreur — la souris glisse,
 * la ligne du dessus est sélectionnée. La confirmation **répète le nom et
 * l'e-mail** du dossier concerné : c'est la seule façon de s'apercevoir qu'on
 * s'est trompé de ligne avant que ce ne soit irréversible.
 *
 * ⚠️ Et c'est bien irréversible : le compte, sa fiche, son véhicule et ses
 * pièces partent, fichiers du stockage compris. Aucune corbeille.
 */
export function DeleteDriverButton({
  driverId,
  name,
  email,
  approved = false,
}: {
  driverId: string;
  name: string;
  email: string;
  /** Une fiche publique existe : la supprimer a des conséquences visibles. */
  approved?: boolean;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/drivers/${driverId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Suppression impossible.");
        return;
      }
      setAsking(false);
      router.refresh();
    } catch {
      setError("Le serveur ne répond pas.");
    } finally {
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <button
        onClick={() => setAsking(true)}
        title="Supprimer définitivement ce dossier"
        aria-label={`Supprimer le dossier de ${name || email}`}
        className="rounded-xl border border-white/10 p-2 text-white/40 transition hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-300"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="inline-flex max-w-xs flex-col gap-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-left">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-red-100">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Supprimer définitivement{" "}
          <strong className="text-white">{name || "ce dossier"}</strong>
          {email ? ` (${email})` : ""} ?{" "}
          {approved && (
            <strong className="text-white">
              Sa fiche publique disparaîtra de l&apos;annuaire.
            </strong>
          )}{" "}
          Le compte et ses pièces justificatives seront effacés. Irréversible.
        </span>
      </p>
      {error && <p className="text-xs text-red-200">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={remove}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Supprimer
        </button>
        <button
          onClick={() => {
            setAsking(false);
            setError(null);
          }}
          disabled={busy}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/5"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
