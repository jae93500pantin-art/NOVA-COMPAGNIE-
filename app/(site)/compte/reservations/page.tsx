import { ClientBookings } from "@/components/ClientBookings";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Mes réservations — Nova Compagnie" };

export default async function ReservationsPage() {
  await requireUser("/compte/reservations");

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <ClientBookings />
    </div>
  );
}
