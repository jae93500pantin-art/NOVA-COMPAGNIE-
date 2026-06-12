import { ClientBookings } from "@/components/ClientBookings";

export const metadata = { title: "Mes réservations — LumeCar" };

export default function ReservationsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <ClientBookings />
    </div>
  );
}
