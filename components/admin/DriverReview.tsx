"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  AlertTriangle,
  FileWarning,
  Clock,
  Loader2,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import {
  DOCUMENT_KINDS,
  DOCUMENT_LABELS,
  REJECTION_REASONS,
  REJECTION_LABELS,
  blockingDocuments,
  canApproveDossier,
  daysUntilExpiry,
  expiresSoon,
  isExpired,
  rejectionError,
  overrideError,
  type DriverDocumentKind,
  type RejectionReason,
} from "@/lib/driverDocuments";

/**
 * Contrôle d'un dossier chauffeur, pièce par pièce.
 *
 * ## ⚠️ Ce que cet écran doit rendre impossible
 *
 * Valider un chauffeur sans avoir regardé ses pièces. La page publique affiche
 * « habilitations vérifiées » : le bouton « Valider » reste donc **grisé** tant
 * que chaque pièce obligatoire n'est pas présente, non périmée, et **cochée
 * conforme** par un humain. Le même contrôle est refait côté serveur — un
 * bouton grisé n'est pas une règle, c'est une politesse.
 *
 * ## ⚠️ « Conforme » ne veut pas dire « le fichier existe »
 *
 * La case se coche APRÈS avoir ouvert le document et comparé au déclaré, qui
 * est affiché à côté. C'est un contrôle humain : le code montre, il ne juge
 * pas. Les trois choses à vérifier sont rappelées à l'écran, parce qu'elles
 * s'oublient — nom identique partout, inscription au registre, assurance qui
 * couvre bien le transport de personnes à titre onéreux.
 */

export interface ReviewDocument {
  id: string;
  kind: DriverDocumentKind;
  mimeType: string | null;
  status: string;
  checkedOk: boolean;
  expiresAt: string | null;
  url: string | null;
}

export function DriverReview({
  driver,
  declared,
  documents,
  schemaReady,
  linkTtlSeconds,
}: {
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    status: string;
    slug: string | null;
    rejectionReason: string | null;
    createdAt: string;
  };
  declared: {
    licenceNumber: string;
    vtcCardNumber: string;
    siret: string;
    vehicle: string;
  };
  documents: ReviewDocument[];
  /**
   * La migration du 2026-09-29 est-elle appliquée ?
   *
   * ⚠️ Faux ⇒ les pièces se **consultent** mais le contrôle ne peut pas
   * s'enregistrer : les colonnes `checked_ok` / `expires_at` n'existent pas.
   * L'écran le dit en haut et désactive les cases, au lieu de laisser cocher
   * dans le vide — une case qui revient à zéro sans explication est pire qu'une
   * case grisée.
   */
  schemaReady: boolean;
  linkTtlSeconds: number;
}) {
  const router = useRouter();
  const [docs, setDocs] = useState(documents);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  /** Dérogation : valider un dossier incomplet, avec justification écrite. */
  const [overriding, setOverriding] = useState(false);
  const [justification, setJustification] = useState("");
  const [reason, setReason] = useState<RejectionReason | "">("");
  const [note, setNote] = useState("");

  const blocking = useMemo(() => blockingDocuments(docs), [docs]);
  const approvable = canApproveDossier(docs);

  /** Enregistre le contrôle d'une pièce, puis reflète la réponse du serveur. */
  const saveCheck = async (
    doc: ReviewDocument,
    patch: { checkedOk?: boolean; expiresAt?: string | null }
  ) => {
    const next = { ...doc, ...patch };
    setBusy(doc.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/documents`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          checkedOk: next.checkedOk,
          expiresAt: next.expiresAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      // On reprend la valeur du serveur : une date refusée revient à null, et
      // l'écran doit le montrer plutôt que garder une saisie fantôme.
      setDocs((list) =>
        list.map((d) =>
          d.id === doc.id
            ? { ...d, checkedOk: data.checkedOk, expiresAt: data.expiresAt }
            : d
        )
      );
    } catch {
      setError("Le serveur ne répond pas.");
    } finally {
      setBusy(null);
    }
  };

  const approve = async (override = false) => {
    if (override) {
      const invalid = overrideError(justification);
      if (invalid) {
        setError(invalid);
        return;
      }
    }
    setBusy("approve");
    setError(null);
    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          override ? { override: true, justification } : {}
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        // Le serveur nomme les pièces qui bloquent : on les affiche telles
        // quelles plutôt qu'un « échec » opaque.
        setError(
          data.blocking
            ? `${data.error} — ${data.blocking.map((b: { text: string }) => b.text).join(", ")}`
            : data.error ?? "Validation impossible."
        );
        return;
      }
      setDone(data.message ?? "Chauffeur validé");
      setOverriding(false);
      router.refresh();
    } catch {
      setError("Le serveur ne répond pas.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    const invalid = rejectionError(reason, note);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy("reject");
    setError(null);
    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Refus impossible.");
        return;
      }
      setDone(data.message ?? "Dossier refusé");
      setRejecting(false);
      router.refresh();
    } catch {
      setError("Le serveur ne répond pas.");
    } finally {
      setBusy(null);
    }
  };

  const byKind = new Map(docs.map((d) => [d.kind, d]));

  return (
    <div className="space-y-6">
      {/* Identité du dossier */}
      <header className="rounded-2xl glass p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {driver.firstName} {driver.lastName}
            </h1>
            <p className="mt-1 text-sm text-white/50">
              {driver.email}
              {driver.phone ? ` · ${driver.phone}` : ""}
            </p>
          </div>
          <span
            className={`chip ${
              driver.status === "approved"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : driver.status === "rejected"
                  ? "border-red-400/30 bg-red-400/10 text-red-300"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-200"
            }`}
          >
            {driver.status}
          </span>
        </div>

        {driver.rejectionReason && driver.status === "rejected" && (
          <p className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200">
            Refus précédent : {driver.rejectionReason}
          </p>
        )}

        {/* Ce que le chauffeur a déclaré — la colonne de comparaison. */}
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Declared label="N° permis" value={declared.licenceNumber} />
          <Declared label="N° carte VTC" value={declared.vtcCardNumber} />
          <Declared label="SIREN / SIRET" value={declared.siret} />
          <Declared label="Véhicule" value={declared.vehicle} />
        </dl>
      </header>

      {!schemaReady && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Migration de base de données non appliquée
          </p>
          <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
            Les pièces sont consultables ci-dessous, mais le contrôle ne peut
            pas être enregistré : les colonnes <code>checked_ok</code> et{" "}
            <code>expires_at</code> n&apos;existent pas encore. Lancez{" "}
            <code>supabase/migrations/2026-09-29-verification-pieces.sql</code>{" "}
            dans l&apos;éditeur SQL Supabase — <strong>en deux temps</strong> :
            le bloc A seul, puis le bloc B.
          </p>
          <p className="mt-2 text-xs text-amber-100/60">
            La validation reste bloquée d&apos;ici là, ce qui est le
            comportement voulu : aucun chauffeur ne doit être validé sans
            contrôle enregistré.
          </p>
        </div>
      )}

      {/* Le contrôle humain, que le code ne peut pas faire à la place. */}
      <div className="rounded-2xl border border-royal-400/25 bg-royal-500/5 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-royal-100">
          <ShieldCheck className="h-4 w-4 shrink-0" /> À vérifier sur chaque pièce
        </p>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-white/55">
          <li>• Le nom est le même sur tous les documents et sur le compte.</li>
          <li>
            • La carte VTC est valide et l&apos;entreprise apparaît au registre
            des exploitants VTC du ministère des Transports.
          </li>
          <li>
            • L&apos;assurance couvre le <strong>transport de personnes à titre
            onéreux</strong> — pas une simple assurance auto personnelle.
          </li>
          <li>• Aucun document n&apos;est expiré.</li>
        </ul>
      </div>

      <p className="flex items-center gap-2 text-xs text-white/40">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        Les liens de consultation expirent après {Math.round(linkTtlSeconds / 60)}{" "}
        minutes. Rechargez la page pour les renouveler.
      </p>

      {/* Les pièces */}
      <div className="space-y-4">
        {DOCUMENT_KINDS.map((kind) => {
          const doc = byKind.get(kind);
          const meta = DOCUMENT_LABELS[kind];
          return (
            <DocumentCard
              key={kind}
              kind={kind}
              label={meta.label}
              hint={meta.hint}
              required={meta.required}
              doc={doc}
              busy={busy === doc?.id}
              editable={schemaReady}
              onCheck={(checked) => doc && saveCheck(doc, { checkedOk: checked })}
              onExpiry={(date) => doc && saveCheck(doc, { expiresAt: date })}
            />
          );
        })}
      </div>

      {/* Décision */}
      <div className="rounded-2xl glass p-6">
        {error && (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        {done && (
          <p className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-200">
            <Check className="h-4 w-4 shrink-0" /> {done}
          </p>
        )}

        {blocking.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
            <p className="text-sm font-semibold text-amber-200">
              Validation bloquée — {blocking.length} pièce
              {blocking.length > 1 ? "s" : ""}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-amber-100/75">
              {blocking.map((b) => (
                <li key={b.kind}>
                  • {DOCUMENT_LABELS[b.kind].label} —{" "}
                  {b.reason === "missing"
                    ? "absente"
                    : b.reason === "expired"
                      ? "expirée"
                      : "non contrôlée"}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => approve(false)}
            disabled={!approvable || !schemaReady || busy !== null || driver.status === "approved"}
            title={
              approvable ? undefined : "Toutes les pièces obligatoires doivent être contrôlées."
            }
            className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "approve" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Valider le chauffeur
          </button>

          <button
            onClick={() => setRejecting((r) => !r)}
            disabled={busy !== null || driver.status === "approved"}
            className="btn-ghost text-sm disabled:opacity-40"
          >
            <X className="h-4 w-4" /> Refuser le dossier
          </button>

          {/* ⚠️ DÉROGATION. Volontairement discrète, et proposée seulement
              quand le dossier bloque : c'est une sortie de route, pas une
              alternative de même rang. Elle exige une justification écrite et
              la fiche publique ne portera PAS la mention de contrôle. */}
          {blocking.length > 0 && driver.status !== "approved" && (
            <button
              onClick={() => setOverriding((o) => !o)}
              disabled={busy !== null}
              className="text-xs text-amber-200/70 underline decoration-dotted underline-offset-4 transition hover:text-amber-100 disabled:opacity-40"
            >
              Valider malgré les pièces manquantes…
            </button>
          )}
        </div>

        {overriding && (
          <div className="mt-5 space-y-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Validation par dérogation
            </p>
            <ul className="space-y-1 text-xs leading-relaxed text-amber-100/80">
              <li>
                • Le chauffeur sera <strong>référencé</strong> et joignable par
                les clients.
              </li>
              <li>
                • Sa fiche <strong>ne portera pas</strong> la mention
                « Habilitations vérifiées », et affichera au contraire que ses
                pièces n&apos;ont pas toutes été contrôlées.
              </li>
              <li>
                • La dérogation est <strong>journalisée</strong> avec votre
                justification et la liste de ce qui manquait.
              </li>
            </ul>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Pourquoi ce dossier est accepté malgré les pièces manquantes. Cette phrase est la seule qui expliquera votre décision dans six mois."
              className="input w-full resize-none"
            />
            <button
              onClick={() => approve(true)}
              disabled={busy !== null}
              className="btn-primary w-full text-sm disabled:opacity-40"
            >
              {busy === "approve" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Valider par dérogation
            </button>
          </div>
        )}

        {rejecting && (
          <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs uppercase tracking-wider text-white/40">
              Motif du refus
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {REJECTION_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    reason === r
                      ? "border-royal-400/50 bg-royal-500/15 text-white"
                      : "border-white/10 text-white/60 hover:bg-white/5"
                  }`}
                >
                  {REJECTION_LABELS[r]}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={
                reason === "other"
                  ? "Obligatoire : dites au chauffeur quoi corriger."
                  : "Précision envoyée au chauffeur (facultatif)."
              }
              className="input w-full resize-none"
            />
            <p className="text-[11px] leading-relaxed text-white/35">
              Le motif part par e-mail au chauffeur, qui peut redéposer ses
              pièces. Son dossier n&apos;est pas supprimé.
            </p>
            <button
              onClick={reject}
              disabled={busy !== null}
              className="btn-primary w-full text-sm disabled:opacity-40"
            >
              {busy === "reject" && <Loader2 className="h-4 w-4 animate-spin" />}
              Envoyer le refus
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Declared({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <dt className="text-[11px] uppercase tracking-wider text-white/35">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-white">
        {value || <span className="text-white/30">non renseigné</span>}
      </dd>
    </div>
  );
}

function DocumentCard({
  kind,
  label,
  hint,
  required,
  doc,
  busy,
  editable,
  onCheck,
  onExpiry,
}: {
  kind: DriverDocumentKind;
  label: string;
  hint: string;
  required: boolean;
  doc?: ReviewDocument;
  busy: boolean;
  /** Faux tant que la migration n'est pas appliquée : on montre, on n'écrit pas. */
  editable: boolean;
  onCheck: (checked: boolean) => void;
  onExpiry: (date: string | null) => void;
}) {
  const left = doc ? daysUntilExpiry(doc) : null;
  const expired = doc ? isExpired(doc) : false;
  const soon = doc ? expiresSoon(doc) : false;

  return (
    <section className="overflow-hidden rounded-2xl glass">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 p-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            {label}
            {required ? (
              <span className="chip border-white/10 text-[10px] text-white/50">
                obligatoire
              </span>
            ) : (
              <span className="chip border-white/10 text-[10px] text-white/35">
                facultative
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-white/40">{hint}</p>
        </div>

        {doc && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={doc.expiresAt ?? ""}
                onChange={(e) => onExpiry(e.target.value || null)}
                disabled={busy || !editable}
                aria-label={`Date d'expiration — ${label}`}
                className="input px-3 py-1.5 text-xs"
              />
            </label>
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                doc.checkedOk
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 text-white/60 hover:bg-white/5"
              }`}
            >
              <input
                type="checkbox"
                checked={doc.checkedOk}
                disabled={busy || !editable}
                onChange={(e) => onCheck(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Conforme
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            </label>
          </div>
        )}
      </div>

      <div className="p-5">
        {!doc ? (
          <p className="flex items-center gap-2 text-sm text-white/40">
            <FileWarning className="h-4 w-4 shrink-0" />
            Pièce non déposée.
          </p>
        ) : !doc.url ? (
          // ⚠️ Un fichier introuvable dans le bucket ne doit pas passer pour
          // une pièce présente : on le dit, et la case reste décochable.
          <p className="flex items-center gap-2 text-sm text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Fichier illisible ou absent du stockage.
          </p>
        ) : (
          <>
            {(expired || soon) && (
              <p
                className={`mb-3 flex items-center gap-2 rounded-xl border p-2.5 text-xs ${
                  expired
                    ? "border-red-400/25 bg-red-400/10 text-red-200"
                    : "border-amber-400/25 bg-amber-400/10 text-amber-100"
                }`}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {expired
                  ? `Expirée depuis ${Math.abs(left ?? 0)} jour(s) — la fiche est retirée de l'annuaire.`
                  : `Expire dans ${left} jour(s).`}
              </p>
            )}

            <DocumentViewer url={doc.url} mimeType={doc.mimeType} label={label} />

            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-royal-300 hover:underline"
            >
              Ouvrir en grand <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Affiche la pièce dans la page.
 *
 * ⚠️ Un PDF passe par `<iframe>`, une image par `<img>` : un PDF dans une
 * balise `img` ne s'affiche pas du tout, et l'administrateur conclurait que la
 * pièce est vide alors qu'elle est là.
 */
function DocumentViewer({
  url,
  mimeType,
  label,
}: {
  url: string;
  mimeType: string | null;
  label: string;
}) {
  if (mimeType === "application/pdf") {
    return (
      <iframe
        src={url}
        title={label}
        className="h-[28rem] w-full rounded-xl border border-white/10 bg-white"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={label}
      className="max-h-[28rem] w-auto rounded-xl border border-white/10 bg-black/40 object-contain"
    />
  );
}
