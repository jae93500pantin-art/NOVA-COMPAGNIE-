"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Star, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { Booking } from "@/lib/bookings";
import {
  REVIEW_MAX_COMMENT,
  REVIEW_MIN_COMMENT,
  maskAuthorName,
  reviewError,
  tripLabelFromBooking,
} from "@/lib/reviews";
import { getClientId } from "@/lib/clientBookings";
import { springSnappy } from "@/lib/motion";

/**
 * Review form for a finished ride. Rendered inline under a completed booking
 * in the client's history — the only place a review can start from, since a
 * review needs the ride it belongs to.
 */
export function ReviewForm({
  booking,
  clientName,
  onPublished,
}: {
  booking: Booking;
  clientName: string;
  onPublished?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const trip = tripLabelFromBooking(booking);
  const shown = hover || rating;

  const submit = async () => {
    const invalid = reviewError(rating, comment);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${booking.driverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: getClientId(),
          clientName,
          bookingId: booking.id,
          rating,
          comment,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Envoi impossible. Réessayez.");
        return;
      }
      setDone(true);
      onPublished?.();
    } catch {
      setError("Envoi impossible. Réessayez.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Merci, votre avis est publié sur le profil du chauffeur.
      </motion.div>
    );
  }

  const remaining = REVIEW_MAX_COMMENT - comment.trim().length;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4"
    >
      <p className="text-sm font-medium text-white">Votre avis sur la course</p>
      {trip && (
        <span className="chip mt-2 inline-flex border-royal-400/20 bg-royal-500/10 text-royal-200">
          {trip}
        </span>
      )}

      {/* Rating */}
      <div
        className="mt-3 flex items-center gap-1"
        role="radiogroup"
        aria-label="Note globale"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
            whileTap={{ scale: 0.88 }}
            transition={springSnappy}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => {
              setRating(n);
              setError(null);
            }}
            className="p-0.5"
          >
            <Star
              className={`h-6 w-6 transition ${
                n <= shown
                  ? "fill-gold-400 text-gold-400"
                  : "text-white/25"
              }`}
            />
          </motion.button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-xs text-white/50">{rating}/5</span>
        )}
      </div>

      <textarea
        value={comment}
        maxLength={REVIEW_MAX_COMMENT}
        rows={3}
        placeholder={`Comment s'est passée votre course ? (${REVIEW_MIN_COMMENT} caractères minimum)`}
        onChange={(e) => {
          setComment(e.target.value);
          setError(null);
        }}
        className="input mt-3 min-h-[84px] resize-y text-sm"
      />
      <p className="mt-1 text-right text-[11px] text-white/30">
        {remaining} caractères restants
      </p>

      {error && (
        <p className="mt-1 flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={sending}
        className="btn-primary mt-3 w-full text-sm disabled:opacity-60"
      >
        {sending && <Loader2 className="h-4 w-4 animate-spin" />}
        {sending ? "Publication…" : "Publier mon avis"}
      </button>
      <p className="mt-2 text-center text-[11px] text-white/30">
        Publié sous le nom « {maskAuthorName(clientName)} », avec le trajet
        certifié.
      </p>
    </motion.div>
  );
}
