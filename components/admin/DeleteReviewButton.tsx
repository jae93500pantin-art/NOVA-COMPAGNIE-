"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import {
  REVIEW_REMOVAL_LABELS,
  REVIEW_REMOVAL_REASONS,
  reviewRemovalError,
  type ReviewRemovalReason,
} from "@/lib/reviews";

/**
 * Retrait d'un avis depuis la console.
 *
 * ## ⚠️ Deux clics, et un motif
 *
 * Comme pour un dossier chauffeur, la confirmation nomme l'auteur et le
 * chauffeur concernés : c'est là qu'on voit qu'on s'est trompé de ligne. Elle
 * exige en plus un motif de la liste fermée (`REVIEW_REMOVAL_REASONS`) — aucun
 * ne porte sur la note, et c'est voulu : voir `lib/reviews.ts`.
 *
 * La même règle (`reviewRemovalError`) est rejouée par le serveur.
 */
export function DeleteReviewButton({
  reviewId,
  author,
  driver,
}: {
  reviewId: string;
  author: string;
  driver: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<ReviewRemovalReason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setAsking(false);
    setReason("");
    setNote("");
    setError(null);
  };

  const remove = async () => {
    const invalid = reviewRemovalError(reason, note);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Suppression impossible.");
        return;
      }
      close();
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
        title="Retirer cet avis"
        aria-label={`Retirer l'avis de ${author} sur ${driver}`}
        className="rounded-xl border border-white/10 p-2 text-white/40 transition hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-300"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex w-72 flex-col gap-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-left">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-red-100">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Retirer l&apos;avis de <strong className="text-white">{author}</strong> sur{" "}
          <strong className="text-white">{driver}</strong> ? Irréversible.
        </span>
      </p>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as ReviewRemovalReason | "")}
        disabled={busy}
        className="input py-1.5 text-xs"
        aria-label="Motif du retrait"
      >
        <option value="">Motif du retrait…</option>
        {REVIEW_REMOVAL_REASONS.map((r) => (
          <option key={r} value={r}>
            {REVIEW_REMOVAL_LABELS[r]}
          </option>
        ))}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
        rows={2}
        maxLength={500}
        placeholder={reason === "other" ? "Précisez le motif (obligatoire)" : "Précision (facultatif)"}
        className="input resize-none py-1.5 text-xs"
      />
      {error && <p className="text-xs text-red-200">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={remove}
          disabled={busy || !reason}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Retirer l&apos;avis
        </button>
        <button
          onClick={close}
          disabled={busy}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/5"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
