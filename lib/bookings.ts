/** Booking (course request) domain types + pure helpers (unit-testable). */

export type BookingStatus = "pending" | "confirmed" | "refused";

export interface Booking {
  id: string;
  driverId: string;
  clientId: string;
  clientName: string;
  hours: number;
  total: number; // euros
  pickup: string;
  dropoff: string;
  when: string;
  status: BookingStatus;
  createdAt: number;
}

export interface NewBookingInput {
  driverId: string;
  clientId: string;
  clientName: string;
  hours: number;
  total: number;
  pickup?: string;
  dropoff?: string;
  when?: string;
}

/** Whether a status change is allowed (pending → confirmed/refused only). */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from !== "pending") return false;
  return to === "confirmed" || to === "refused";
}

export function statusLabel(status: BookingStatus): string {
  switch (status) {
    case "pending":
      return "En attente";
    case "confirmed":
      return "Acceptée";
    case "refused":
      return "Refusée";
  }
}

/** Build a fully-formed Booking from raw input (applies defaults + clamps). */
export function buildBooking(
  input: NewBookingInput,
  idFactory: () => string = defaultId,
  now: () => number = Date.now
): Booking {
  return {
    id: idFactory(),
    driverId: input.driverId,
    clientId: input.clientId,
    clientName: input.clientName || "Client",
    hours: Math.max(1, Math.min(24, Math.floor(input.hours) || 1)),
    total: Math.max(0, Math.round(input.total)),
    pickup: input.pickup?.trim() || "Adresse de départ",
    dropoff: input.dropoff?.trim() || "Destination",
    when: input.when?.trim() || "Dès que possible",
    status: "pending",
    createdAt: now(),
  };
}

function defaultId(): string {
  return `bk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
