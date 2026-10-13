"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Trash2, Loader2, AlertTriangle } from "lucide-react";

/**
 * Actions sur une demande de devis : marquer traitée / rouvrir, supprimer.
 *
 * ⚠️ La suppression demande deux clics et nomme le client : c'est une donnée
 * qu'on ne retrouvera pas.
 */
export function QuoteActions({
  quoteId,
  handled,
  client,
}: {
  quoteId: string;
  handled: boolean;
  client: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}`, {
        ...init,
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Action impossible.");
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

  if (asking) {
    return (
      <div className="flex w-60 flex-col gap-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-left">
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-red-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Supprimer la demande de <strong className="text-white">{client}</strong> ?
            Irréversible.
          </span>
        </p>
        {error && <p className="text-xs text-red-200">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => call({ method: "DELETE" })}
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

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => call({ method: "PATCH", body: JSON.stringify({ handled: !handled }) })}
          disabled={busy}
          className={handled ? "btn-ghost text-xs" : "btn-primary text-xs"}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : handled ? (
            <RotateCcw className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {handled ? "Rouvrir" : "Traitée"}
        </button>
        <button
          onClick={() => setAsking(true)}
          disabled={busy}
          title="Supprimer cette demande"
          aria-label={`Supprimer la demande de ${client}`}
          className="rounded-xl border border-white/10 p-2 text-white/40 transition hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-300"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

/** Supprime les demandes au-delà de la durée de conservation. */
export function PurgeQuotesButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purge = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/quotes/purge", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Purge impossible.");
        return;
      }
      router.refresh();
    } catch {
      setError("Le serveur ne répond pas.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={purge}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        Supprimer les {count} demande{count > 1 ? "s" : ""} expirée{count > 1 ? "s" : ""}
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
