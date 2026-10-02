"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Loader2,
  AlertCircle,
  CreditCard,
  Car,
  FileUp,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { rateError } from "@/lib/pricing";
import { isValidSiren } from "@/lib/siren";
import type { VehicleCategory } from "@/lib/types";
import {
  DOCUMENT_LABELS,
  documentError,
  missingRequired,
  documentsToCollect,
  type DriverDocumentKind,
} from "@/lib/driverDocuments";
import { springSnappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Tunnel d'inscription chauffeur, en trois étapes.
 *
 * ## Pourquoi un tunnel et pas un formulaire
 *
 * Devenir chauffeur VTC demande un numéro de permis, une carte
 * professionnelle, un véhicule déclaré et quatre pièces justificatives. Tout
 * afficher d'un coup fait abandonner ; découper en trois permet aussi
 * d'enregistrer au fur et à mesure — un dossier interrompu se reprend là où
 * il s'est arrêté.
 *
 * ## Ce que l'étape 3 ne fait pas
 *
 * Les fichiers ne partent **jamais directement** vers Supabase Storage : ils
 * transitent par `/api/driver/documents`, qui vérifie la session, le rôle, le
 * type réel et le poids. Un dépôt direct depuis le navigateur passerait par la
 * clé anon, avec les seules règles que Storage sait exprimer.
 *
 * Le dossier complet ne rend pas le chauffeur public : il devient **examinable**.
 * La validation reste une décision humaine, dans `/admin`.
 */

type Step = 1 | 2 | 3;

const CATEGORIES: { id: VehicleCategory; label: string; hint: string }[] = [
  { id: "Business", label: "Berline Business", hint: "Classe E, Série 5, A6…" },
  { id: "Van", label: "Van", hint: "Classe V, Vito — jusqu'à 7 places" },
  { id: "Van Luxury", label: "Van VIP", hint: "Van aménagé haut de gamme" },
  { id: "Luxury", label: "Luxury First", hint: "Classe S, Série 7, A8…" },
  { id: "Moto", label: "Moto", hint: "Taxi-moto" },
];

interface DocumentState {
  kind: DriverDocumentKind;
  status: string;
  review_note: string | null;
}

export function DriverOnboarding() {
  const { user, loading } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Étape 1
  const [licence, setLicence] = useState("");
  const [vtcCard, setVtcCard] = useState("");
  const [siret, setSiret] = useState("");
  const [experience, setExperience] = useState("");

  // Étape 2
  const [category, setCategory] = useState<VehicleCategory>("Business");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [hourRate, setHourRate] = useState("");
  const [dayRate, setDayRate] = useState("");

  // Étape 3
  const [documents, setDocuments] = useState<DocumentState[]>([]);
  const [uploading, setUploading] = useState<DriverDocumentKind | null>(null);
  /**
   * Les types de pièce que la base accepte réellement, tels que le serveur les
   * rapporte. `null` = indéterminé : on applique alors la règle complète.
   *
   * ⚠️ Ce n'est pas une préférence d'affichage, c'est l'écart entre le code et
   * la migration. Une pièce devenue obligatoire alors que l'enum
   * `driver_document_kind` ne la connaît pas encore rend l'étape 3
   * infranchissable : chaque dépôt est refusé, et la porte réclame une pièce
   * qu'aucun fichier ne peut satisfaire.
   */
  const [supportedKinds, setSupportedKinds] = useState<string[] | null>(null);

  const isDriver = user?.role === "driver";

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/driver/documents");
      if (!res.ok) return;
      const data = await res.json();
      setDocuments((data.documents as DocumentState[]) ?? []);
      setSupportedKinds(
        Array.isArray(data.supportedKinds) ? (data.supportedKinds as string[]) : null
      );
    } catch {
      /* hors ligne : l'étape reste utilisable, le dépôt échouera franchement */
    }
  }, []);

  useEffect(() => {
    if (isDriver) void loadDocuments();
  }, [isDriver, loadDocuments]);

  // Les tarifs ne suivent plus la gamme : le chauffeur fixe les siens, quelle
  // que soit la classe de son véhicule. Les deux champs partent donc vides et
  // rien ne les préremplit — une valeur suggérée par la plateforme serait un
  // prix conseillé, c'est-à-dire un prix.

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (!isDriver) {
    return (
      <div className="rounded-3xl glass p-8 text-center">
        <p className="text-sm text-white/60">
          Cet espace est réservé aux comptes chauffeur.
        </p>
        <Link href="/auth/register?role=driver" className="btn-primary mt-5 text-sm">
          Créer un compte chauffeur
        </Link>
      </div>
    );
  }

  const hourError = rateError("hour", Number.parseFloat(hourRate));
  const dayError = rateError("day", Number.parseFloat(dayRate));

  /** Enregistre les étapes 1 et 2 sur la fiche d'annuaire. */
  const saveProfile = async (nextStep: Step) => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/driver/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenceNumber: licence.trim(),
          vtcCardNumber: vtcCard.trim(),
          siret: siret.trim(),
          experienceYears: Number.parseInt(experience, 10) || 0,
          category,
          carMake: make.trim(),
          carModel: model.trim(),
          carPlate: plate.trim().toUpperCase(),
          carYear: year,
          carColor: color.trim(),
          // Le tarif du chauffeur, ou 0 s'il n'a encore rien saisi. ⚠️ Pas de
          // repli sur une valeur de la plateforme : 0 se lit « non communiqué »,
          // un nombre se lirait comme son prix. Un dossier interrompu se
          // reprend, il ne repart pas avec un tarif qu'il n'a pas choisi.
          pricePerHour: Number.parseFloat(hourRate) || 0,
          pricePerDay: Number.parseFloat(dayRate) || 0,
          onboardingStep: nextStep,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Enregistrement impossible.");
        return false;
      }
      setStep(nextStep);
      return true;
    } catch {
      setError("Connexion au serveur impossible. Vérifiez votre réseau.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const upload = async (kind: DriverDocumentKind, file: File) => {
    // Refusé côté navigateur avec les MÊMES règles que le serveur : inutile
    // d'envoyer 20 Mo pour se les voir refuser à l'arrivée.
    const invalid = documentError(file);
    if (invalid) {
      setError(`${DOCUMENT_LABELS[kind].label} : ${invalid}`);
      return;
    }
    setError(null);
    setUploading(kind);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const res = await fetch("/api/driver/documents", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Dépôt impossible.");
        return;
      }
      await loadDocuments();
    } catch {
      setError("Connexion au serveur impossible pendant l'envoi.");
    } finally {
      setUploading(null);
    }
  };

  // Un seul dossier, celui du VTC : la carte CNAPS est facultative et ne
  // conditionne pas la validation (voir lib/cnaps.ts).
  //
  // ⚠️ `supportedKinds` écarte les pièces que la base ne sait pas encore
  // stocker — sinon la porte exigerait l'impossible. L'exigence revient d'elle-
  // même dès que la migration est appliquée, sans retoucher ce fichier.
  const missing = missingRequired(documents, supportedKinds ?? undefined);
  const unavailable = supportedKinds
    ? documentsToCollect().filter((k) => !supportedKinds.includes(k))
    : [];

  // Le SIREN est vérifié par sa clé de contrôle : un numéro inventé sur le bon
  // de réservation est exactement ce que ce document ne doit pas porter.
  const step1Valid =
    licence.trim().length >= 5 && vtcCard.trim().length >= 5 && isValidSiren(siret);
  const step2Valid =
    make.trim().length >= 2 &&
    model.trim().length >= 1 &&
    plate.trim().length >= 4 &&
    !hourError &&
    !dayError;

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springSnappy}
        className="rounded-3xl glass p-10 text-center"
      >
        <ShieldCheck className="mx-auto h-14 w-14 text-royal-300" />
        <h2 className="mt-4 text-xl font-semibold text-white">
          Dossier transmis
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
          Votre dossier est complet et part à la vérification. Vous recevrez un
          e-mail dès qu&apos;il sera validé — votre profil apparaîtra alors dans
          l&apos;annuaire et vous pourrez recevoir des courses.
        </p>
        <Link href="/compte" className="btn-ghost mt-6 text-sm">
          Retour à mon espace
        </Link>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <AnimatePresence mode="wait">
        {step === 1 && (
          <Panel key="1" icon={CreditCard} title="Vos informations professionnelles">
            <Field label="Numéro de permis de conduire">
              <input
                value={licence}
                onChange={(e) => setLicence(e.target.value)}
                className="input"
                autoComplete="off"
                placeholder="12AB34567"
              />
            </Field>
            <Field
              label="Numéro de carte professionnelle VTC"
              hint="Délivrée par la préfecture. Sans elle, l'exercice est illégal."
            >
              <input
                value={vtcCard}
                onChange={(e) => setVtcCard(e.target.value)}
                className="input"
                autoComplete="off"
                placeholder="VTC-075-2024-000000"
              />
            </Field>
            <Field
              label="SIREN ou SIRET"
              hint="Mention obligatoire du bon de réservation remis au client."
            >
              <input
                value={siret}
                // Chiffres seuls : le numéro est stocké nu, la mise en forme
                // appartient à l'affichage (voir lib/bookingVoucher.ts).
                onChange={(e) => setSiret(e.target.value.replace(/\D/g, "").slice(0, 14))}
                inputMode="numeric"
                className="input"
                autoComplete="off"
                placeholder="123456789"
              />
              {siret.length > 0 && !isValidSiren(siret) && (
                <span className="mt-1 block text-[11px] text-amber-300">
                  9 chiffres (SIREN) ou 14 (SIRET), clé de contrôle comprise.
                </span>
              )}
            </Field>
            <Field label="Années d'expérience">
              <input
                value={experience}
                onChange={(e) => setExperience(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="input"
                placeholder="5"
              />
            </Field>
            <button
              onClick={() => saveProfile(2)}
              disabled={!step1Valid || saving}
              className="btn-primary w-full disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Continuer
            </button>
          </Panel>
        )}

        {step === 2 && (
          <Panel key="2" icon={Car} title="Votre véhicule">
            <div className="grid gap-2 sm:grid-cols-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition",
                    category === c.id
                      ? "border-royal-400/60 bg-royal-400/10"
                      : "border-white/10 hover:border-white/25"
                  )}
                >
                  <span className="block text-sm font-medium text-white">
                    {c.label}
                  </span>
                  <span className="block text-xs text-white/45">{c.hint}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Marque">
                <input value={make} onChange={(e) => setMake(e.target.value)} className="input" />
              </Field>
              <Field label="Modèle">
                <input value={model} onChange={(e) => setModel(e.target.value)} className="input" />
              </Field>
              <Field label="Immatriculation">
                <input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  className="input uppercase"
                  placeholder="AA-123-BB"
                />
              </Field>
              <Field label="Année">
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="input"
                  placeholder="2023"
                />
              </Field>
              <Field label="Couleur">
                <input value={color} onChange={(e) => setColor(e.target.value)} className="input" />
              </Field>
              <Field
                label="Tarif horaire (TTC)"
                hint="Vous fixez librement vos tarifs."
                error={hourError}
              >
                <input
                  value={hourRate}
                  onChange={(e) => setHourRate(e.target.value)}
                  inputMode="decimal"
                  className="input"
                  placeholder="180"
                />
              </Field>
              <Field
                label="Tarif journalier (TTC)"
                hint="Vous fixez librement vos tarifs."
                error={dayError}
              >
                <input
                  value={dayRate}
                  onChange={(e) => setDayRate(e.target.value)}
                  inputMode="decimal"
                  className="input"
                  placeholder="1500"
                />
              </Field>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn-ghost flex-1 text-sm">
                Retour
              </button>
              <button
                onClick={() => saveProfile(3)}
                disabled={!step2Valid || saving}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Continuer
              </button>
            </div>
          </Panel>
        )}

        {step === 3 && (
          <Panel key="3" icon={FileUp} title="Vos pièces justificatives">
            <p className="text-xs text-white/45">
              JPEG, PNG, WebP ou PDF — 8 Mo maximum par pièce. Vos documents
              sont stockés de façon privée et ne sont lus que par notre équipe
              de vérification.
            </p>

            <div className="space-y-2">
              {documentsToCollect().map((kind) => (
                <DocumentRow
                  key={kind}
                  kind={kind}
                  current={documents.find((d) => d.kind === kind)}
                  uploading={uploading === kind}
                  unavailable={unavailable.includes(kind)}
                  onPick={(file) => upload(kind, file)}
                />
              ))}
            </div>

            {unavailable.length > 0 && (
              <p className="rounded-2xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
                Le dépôt de{" "}
                {unavailable.map((k) => DOCUMENT_LABELS[k].label).join(" et ")} n
                &apos;est pas encore ouvert sur la plateforme. Transmettez votre
                dossier sans {unavailable.length > 1 ? "ces pièces" : "cette pièce"}{" "}
                — {unavailable.length > 1 ? "elles" : "elle"} vous{" "}
                {unavailable.length > 1 ? "seront" : "sera"} demandée
                {unavailable.length > 1 ? "s" : ""} ensuite, avant la mise en
                ligne de votre fiche.
              </p>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 text-sm">
                Retour
              </button>
              <button
                onClick={() => setDone(true)}
                disabled={missing.length > 0}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                Transmettre mon dossier
              </button>
            </div>
            {missing.length > 0 && (
              <p className="text-center text-xs text-amber-300/80">
                Encore {missing.length} pièce{missing.length > 1 ? "s" : ""} :{" "}
                {missing.map((k) => DOCUMENT_LABELS[k].label).join(", ")}.
              </p>
            )}
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Stepper({ step }: { step: Step }) {
  const labels = ["Profil", "Véhicule", "Documents"];
  return (
    <ol className="flex items-center gap-2">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const state = n < step ? "done" : n === step ? "current" : "todo";
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                state === "done" && "bg-royal-400 text-ink-900",
                state === "current" && "bg-white text-ink-900",
                state === "todo" && "bg-white/10 text-white/40"
              )}
            >
              {state === "done" ? <Check className="h-3.5 w-3.5" /> : n}
            </span>
            <span
              className={cn(
                "text-xs",
                state === "todo" ? "text-white/35" : "text-white/70"
              )}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <span className="h-px flex-1 bg-white/10" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof CreditCard;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={springSnappy}
      className="space-y-5 rounded-3xl glass p-6"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Icon className="h-4 w-4 text-royal-400" />
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-wider text-white/45">
        {label}
      </span>
      {children}
      {error ? (
        <span className="block text-xs text-red-300">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-white/40">{hint}</span>
      ) : null}
    </label>
  );
}

function DocumentRow({
  kind,
  current,
  uploading,
  unavailable = false,
  onPick,
}: {
  kind: DriverDocumentKind;
  current?: DocumentState;
  uploading: boolean;
  /** La base n'accepte pas encore ce type : la ligne est montrée, pas offerte. */
  unavailable?: boolean;
  onPick: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const meta = DOCUMENT_LABELS[kind];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3",
        unavailable
          ? "border-white/5 bg-white/[0.015]"
          : "border-white/10 bg-white/[0.03]"
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            unavailable ? "text-white/45" : "text-white"
          )}
        >
          {meta.label}
          {unavailable ? (
            <span className="ml-2 text-xs text-amber-300/70">bientôt</span>
          ) : (
            !meta.required && (
              <span className="ml-2 text-xs text-white/35">facultatif</span>
            )
          )}
        </p>
        <p className="truncate text-xs text-white/40">
          {unavailable
            ? "Dépôt pas encore ouvert — ne bloque pas votre dossier."
            : current?.review_note ?? meta.hint}
        </p>
      </div>

      {current ? (
        <span
          className={cn(
            "chip shrink-0 text-xs",
            current.status === "approved"
              ? "bg-emerald-400/10 text-emerald-300"
              : current.status === "rejected"
              ? "bg-red-400/10 text-red-300"
              : "bg-amber-400/10 text-amber-300"
          )}
        >
          {current.status === "approved"
            ? "Validée"
            : current.status === "rejected"
            ? "Refusée"
            : "En vérification"}
        </span>
      ) : null}

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Réinitialisé pour que redéposer le MÊME fichier redéclenche
          // l'événement — sinon un envoi échoué ne peut pas être réessayé.
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={uploading || unavailable}
        title={
          unavailable
            ? "Le dépôt de cette pièce n'est pas encore ouvert"
            : undefined
        }
        className="btn-ghost shrink-0 text-xs disabled:opacity-40"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : unavailable ? (
          "Indisponible"
        ) : current ? (
          "Remplacer"
        ) : (
          "Déposer"
        )}
      </button>
    </div>
  );
}
