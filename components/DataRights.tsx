"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  Trash2,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Check,
} from "lucide-react";
import { getConsent, clearConsent, type ConsentState } from "@/lib/consent";
import { isSupabaseConfigured } from "@/lib/config";

export function DataRights() {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setConsent(getConsent());
    const onChange = () => setConsent(getConsent());
    window.addEventListener("lumecar:consent", onChange);
    return () => window.removeEventListener("lumecar:consent", onChange);
  }, []);

  const exportData = async () => {
    setExporting(true);
    setNotice(null);
    try {
      let payload: unknown;
      if (isSupabaseConfigured) {
        const res = await fetch("/api/account/export");
        if (!res.ok) throw new Error();
        payload = await res.json();
      } else {
        // Demo export: everything we hold locally.
        payload = {
          generatedAt: new Date().toISOString(),
          mode: "demo",
          consent: getConsent(),
          note: "Export de démonstration. Connectez Supabase pour exporter les données réelles du compte.",
        };
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lumecar-mes-donnees.json";
      a.click();
      URL.revokeObjectURL(url);
      setNotice("Vos données ont été exportées.");
    } catch {
      setNotice("L’export a échoué. Veuillez réessayer.");
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setNotice(null);
    try {
      if (isSupabaseConfigured) {
        const res = await fetch("/api/account", { method: "DELETE" });
        if (!res.ok) throw new Error();
      }
      clearConsent();
      setConfirmDelete(false);
      setNotice(
        isSupabaseConfigured
          ? "Votre compte et vos données ont été supprimés."
          : "Mode démo : suppression simulée. Vos préférences locales ont été effacées."
      );
    } catch {
      setNotice("La suppression a échoué. Contactez notre support.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <h1>Mes données</h1>
      <p className="lead">
        Vous gardez le contrôle total de vos informations. Exercez vos droits
        RGPD en un clic : accès, portabilité, effacement et gestion du
        consentement.
      </p>

      {notice && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
        >
          <Check className="h-4 w-4 shrink-0" />
          {notice}
        </motion.div>
      )}

      {/* Consent */}
      <h2>Consentement</h2>
      <div className="not-prose mt-3 rounded-2xl glass p-5">
        {consent ? (
          <div className="space-y-2 text-sm text-white/70">
            <Line label="Strictement nécessaires" on />
            <Line label="Mesure d’audience" on={consent.analytics} />
            <Line label="Marketing" on={consent.marketing} />
            <p className="pt-2 text-xs text-white/40">
              Choix enregistré le{" "}
              {new Date(consent.date).toLocaleDateString("fr-FR")}.
            </p>
          </div>
        ) : (
          <p className="text-sm text-white/50">
            Aucun choix enregistré pour l’instant.
          </p>
        )}
        <button
          onClick={() => {
            clearConsent();
            // Reloading re-triggers the consent banner.
            location.reload();
          }}
          className="btn-ghost mt-4 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Revoir mes préférences cookies
        </button>
      </div>

      {/* Export */}
      <h2>Droit d’accès & portabilité</h2>
      <div className="not-prose mt-3 flex flex-col items-start justify-between gap-4 rounded-2xl glass p-5 sm:flex-row sm:items-center">
        <p className="text-sm text-white/60">
          Téléchargez une copie complète de vos données au format JSON.
        </p>
        <button
          onClick={exportData}
          disabled={exporting}
          className="btn-primary shrink-0 text-sm disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {exporting ? "Export…" : "Exporter mes données"}
        </button>
      </div>

      {/* Delete */}
      <h2>Droit à l’effacement</h2>
      <div className="not-prose mt-3 rounded-2xl border border-red-400/20 bg-red-400/[0.05] p-5">
        <p className="text-sm text-white/60">
          La suppression de votre compte est définitive et entraîne l’effacement
          ou l’anonymisation de vos données sous 30 jours.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="btn-ghost mt-4 border-red-400/30 text-sm text-red-300 hover:bg-red-400/10"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer mon compte
          </button>
        ) : (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-red-200">
              <AlertTriangle className="h-4 w-4" />
              Cette action est irréversible. Confirmer&nbsp;?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="btn text-sm bg-red-500 px-5 py-2.5 text-white hover:bg-red-400 disabled:opacity-60"
              >
                {deleting ? "Suppression…" : "Oui, supprimer"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="btn-ghost text-sm"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="not-prose mt-6 flex items-center gap-2 text-xs text-white/40">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        Vous pouvez aussi introduire une réclamation auprès de la CNIL.
      </p>
    </>
  );
}

function Line({ label, on }: { label: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          on
            ? "bg-emerald-400/10 text-emerald-300"
            : "bg-white/5 text-white/40"
        }`}
      >
        {on ? "Activé" : "Désactivé"}
      </span>
    </div>
  );
}
