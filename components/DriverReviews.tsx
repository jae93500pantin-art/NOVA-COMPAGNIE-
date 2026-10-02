"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Info, Loader2, PenLine, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AuthModal } from "./AuthModal";
import { cn } from "@/lib/utils";
import {
  COMMENT_MAX,
  COMMENT_MIN,
  RATING_MAX,
  REVIEW_DISCLOSURE,
  REVIEW_ERRORS,
  canModifyReview,
  ratingSummary,
  reviewContentError,
  wasEdited,
  type Review,
} from "@/lib/reviews";

/**
 * Les avis d'une fiche chauffeur.
 *
 * ## Lecture libre, écriture avec un compte
 *
 * La liste s'affiche pour **tout le monde**, sans session : des avis qu'il
 * faut un compte pour lire ne servent ni au visiteur ni au chauffeur. Le
 * bouton « Laisser un avis » ouvre la fenêtre de connexion si le visiteur n'a
 * pas de compte — ⚠️ avec la **raison** affichée, sinon un formulaire de
 * connexion qui surgit se lit comme un mur. La fenêtre ne navigue pas : elle
 * se referme sur cette page, et le formulaire d'avis s'ouvre dans la foulée.
 *
 * ## ⚠️ Ce composant ne doit JAMAIS écrire « vérifié » ni « certifié »
 *
 * Nova n'organise pas les courses : elle ne peut pas savoir qu'une prestation
 * a eu lieu. La mention `REVIEW_DISCLOSURE` est donc affichée **au-dessus de
 * la liste**, pas repliée en bas de page — publier des avis de consommateurs
 * oblige à dire s'ils sont vérifiés et comment (art. L111-7-2 du Code de la
 * consommation). Voir `lib/reviews.ts`.
 */
export function DriverReviews({
  driverSlug,
  driverName,
}: {
  driverSlug: string;
  driverName: string;
}) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(driverSlug)}`);
      if (!res.ok) {
        setReviews([]);
        return;
      }
      const data = await res.json();
      setReviews((data.reviews as Review[]) ?? []);
    } catch {
      // Hors ligne : la fiche reste lisible, la section s'affiche vide.
      setReviews([]);
    }
  }, [driverSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = ratingSummary(reviews ?? []);
  // ⚠️ `canModifyReview` plutôt qu'une comparaison d'ids écrite ici : la règle
  // est la même que celle du serveur, et elle traite le cas d'un auteur absent.
  const mine = user
    ? (reviews ?? []).find((r) => canModifyReview(r, user.id))
    : undefined;
  // ⚠️ Le rôle du navigateur ne décide de rien — le serveur refait le contrôle
  // dans `/api/reviews`. Il ne sert qu'à ne pas proposer un formulaire que la
  // route refusera : un chauffeur n'évalue pas un confrère.
  const isDriverAccount = user?.role === "driver";

  const onWriteClick = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setFormOpen(true);
  };

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Avis sur {driverName}</h2>
        {summary.average !== null && (
          <p className="flex items-center gap-1.5 text-sm text-white/60">
            <Star className="h-4 w-4 fill-gold-400 text-gold-400" />
            <strong className="text-white">
              {summary.average.toFixed(1).replace(".", ",")}
            </strong>
            <span>· {summary.count} avis</span>
          </p>
        )}
      </div>

      {/* ⚠️ La mention passe AVANT la liste : c'est ce qui qualifie tout ce qui
          suit, et elle n'a aucun effet si on la découvre après avoir lu. */}
      <p className="mt-3 flex gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-[11px] leading-relaxed text-white/50">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-royal-300" />
        <span>{REVIEW_DISCLOSURE}</span>
      </p>

      {reviews === null ? (
        <div className="mt-4 grid place-items-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-white/30" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/45">
          Aucun avis pour l&apos;instant. Si vous avez fait appel à {driverName},
          votre retour aidera les prochains clients à choisir.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reviews.map((r) =>
            mine?.id === r.id && editing ? (
              <li key={r.id}>
                <ReviewForm
                  driverSlug={driverSlug}
                  initial={r}
                  onCancel={() => setEditing(false)}
                  onPublished={async () => {
                    setEditing(false);
                    await load();
                  }}
                />
              </li>
            ) : (
              <li key={r.id} className="rounded-2xl glass p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">{r.authorName}</p>
                  <Stars value={r.rating} />
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/65">
                  {r.comment}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-[11px] text-white/30">
                    {formatDate(r.createdAt)}
                    {/* ⚠️ Un avis modifié doit le dire : sans cette mention, un
                        auteur peut retourner son texte sans que rien ne
                        l'indique, et le chauffeur ne peut pas le montrer. */}
                    {wasEdited(r) && " · modifié"}
                  </p>
                  {mine?.id === r.id && (
                    <>
                      <button
                        onClick={() => setEditing(true)}
                        className="inline-flex items-center gap-1 text-[11px] text-white/45 transition hover:text-white"
                      >
                        <Pencil className="h-3 w-3" />
                        Modifier
                      </button>
                      <DeleteReviewButton
                        driverSlug={driverSlug}
                        onDeleted={load}
                      />
                    </>
                  )}
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {/* Le bouton, ou la raison de son absence. ⚠️ On explique au lieu de
          masquer : un bouton qui disparaît sans un mot se lit comme un bug.
          ⚠️ Rien ici quand l'avis existe déjà : « Modifier » et « Supprimer »
          sont posés SUR l'avis, là où l'auteur le relit. */}
      <div className="mt-4">
        {mine ? null : isDriverAccount ? (
          <p className="text-sm text-white/40">{REVIEW_ERRORS.notClient}</p>
        ) : formOpen ? (
          <ReviewForm
            driverSlug={driverSlug}
            onCancel={() => setFormOpen(false)}
            onPublished={async () => {
              setFormOpen(false);
              await load();
            }}
          />
        ) : (
          <button onClick={onWriteClick} className="btn-ghost text-sm">
            <PenLine className="h-4 w-4" />
            Laisser un avis
          </button>
        )}
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          // ⚠️ `user` n'est pas encore à jour à cet instant (la session arrive
          // par un événement). On ouvre le formulaire sans condition : s'il n'y
          // a pas de session, la route refuse et le message l'explique — bien
          // plus lisible qu'un bouton qui ne réagit pas.
          setFormOpen(true);
        }}
        reason={`Connectez-vous ou créez un compte client pour évaluer ${driverName}.`}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} sur 5`}>
      {Array.from({ length: RATING_MAX }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i < value ? "fill-gold-400 text-gold-400" : "text-white/15"
          )}
        />
      ))}
    </span>
  );
}

/**
 * Supprimer son avis. ⚠️ Deux clics : un clic unique sur une ligne se donne
 * par erreur, et l'avis n'est pas reproductible — son auteur devrait le
 * réécrire de mémoire.
 */
function DeleteReviewButton({
  driverSlug,
  onDeleted,
}: {
  driverSlug: string;
  onDeleted: () => void | Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(driverSlug)}`, {
        method: "DELETE",
      });
      if (res.ok) await onDeleted();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  if (!asking) {
    return (
      <button
        onClick={() => setAsking(true)}
        className="inline-flex items-center gap-1 text-[11px] text-white/45 transition hover:text-red-300"
      >
        <Trash2 className="h-3 w-3" />
        Supprimer
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-[11px]">
      <span className="text-white/60">Supprimer cet avis ?</span>
      <button
        onClick={remove}
        disabled={busy}
        className="font-medium text-red-300 hover:text-red-200 disabled:opacity-50"
      >
        {busy ? "…" : "Oui"}
      </button>
      <button
        onClick={() => setAsking(false)}
        className="text-white/45 hover:text-white"
      >
        Annuler
      </button>
    </span>
  );
}

function ReviewForm({
  driverSlug,
  initial,
  onCancel,
  onPublished,
}: {
  driverSlug: string;
  /** Présent = modification d'un avis existant, absent = publication. */
  initial?: Review;
  onCancel: () => void;
  onPublished: () => void | Promise<void>;
}) {
  const editMode = Boolean(initial);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Les mêmes règles que le serveur, pour que l'erreur arrive avant
    // l'aller-retour réseau — jamais à sa place.
    const invalid = reviewContentError({ rating, comment });
    if (invalid) {
      setError(REVIEW_ERRORS[invalid]);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(driverSlug)}`, {
        // ⚠️ Pas d'id d'avis dans le corps : le serveur retrouve l'avis par son
        // AUTEUR, puisqu'il n'y en a qu'un par chauffeur. Un id envoyé par le
        // navigateur devrait de toute façon être revérifié.
        method: editMode ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Publication impossible.");
        return;
      }
      await onPublished();
    } catch {
      setError("Le serveur ne répond pas.");
    } finally {
      setBusy(false);
    }
  };

  const left = COMMENT_MIN - comment.trim().length;

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={submit}
      className="rounded-2xl glass p-5"
    >
      <p className="text-sm font-medium text-white">
        {editMode ? "Modifier votre avis" : "Votre avis"}
      </p>

      <div className="mt-3 flex items-center gap-1">
        {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
            className="p-1 transition active:scale-[0.9]"
          >
            <Star
              className={cn(
                "h-6 w-6",
                n <= rating ? "fill-gold-400 text-gold-400" : "text-white/20"
              )}
            />
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={COMMENT_MAX}
        rows={4}
        placeholder="Ponctualité, véhicule, conduite, accueil…"
        className="input mt-3 resize-none"
      />
      <p className="mt-1.5 text-[11px] text-white/35">
        {left > 0
          ? `Encore ${left} caractère${left > 1 ? "s" : ""}.`
          : `${comment.trim().length} / ${COMMENT_MAX}`}
      </p>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-xs text-red-300"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost flex-1 text-sm"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={busy}
          className="btn-primary flex-1 text-sm disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {editMode ? "Enregistrer" : "Publier"}
        </button>
      </div>
    </motion.form>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
