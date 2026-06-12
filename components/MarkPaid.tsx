"use client";

import { useEffect } from "react";

/**
 * After a successful Stripe Checkout redirect, mark the booking as paid.
 * (In production this would be handled by a Stripe webhook; for the demo we
 * confirm on the success page.)
 */
export function MarkPaid({
  driverId,
  bookingId,
}: {
  driverId: string;
  bookingId: string;
}) {
  useEffect(() => {
    if (!driverId || !bookingId) return;
    fetch(`/api/bookings/${driverId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: "paid" }),
    }).catch(() => {});
  }, [driverId, bookingId]);
  return null;
}
