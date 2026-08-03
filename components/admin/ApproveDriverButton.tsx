"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck, AlertCircle } from "lucide-react";

type State = "idle" | "loading" | "done" | "error";

/**
 * Approves a pending driver from the /admin dashboard.
 * The driver id is only a hint — the API re-checks the caller's admin role
 * from the session cookie before doing anything.
 */
export function ApproveDriverButton({ driverId }: { driverId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const approve = async () => {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/drivers/${driverId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Échec de la validation");
        return;
      }
      setState("done");
      setMessage(data.emailed === false ? "Validé (e-mail non envoyé)" : "Validé");
      // Re-run the server component so the row leaves the pending list.
      setTimeout(() => router.refresh(), 1200);
    } catch {
      setState("error");
      setMessage("Erreur réseau");
    }
  };

  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {message}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={approve}
        disabled={state === "loading"}
        className="inline-flex items-center gap-1.5 rounded-full bg-royal-400 px-3.5 py-1.5 text-xs font-semibold text-ink-950 transition hover:bg-royal-300 active:scale-[0.97] disabled:opacity-50"
      >
        {state === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5" />
        )}
        Valider le profil
      </button>
      {state === "error" && message && (
        <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
          <AlertCircle className="h-3 w-3" />
          {message}
        </span>
      )}
    </div>
  );
}
