import Link from "next/link";
import { CheckCircle2, MessageCircle, Home } from "lucide-react";
import { getDirectoryDriver } from "@/lib/driverDirectory";
import { whatsappUrl } from "@/lib/whatsapp";
import { MarkPaid } from "@/components/MarkPaid";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Réservation confirmée — Nova Compagnie" };

export default async function ReservationPage({
  searchParams,
}: {
  searchParams: { status?: string; driver?: string; booking?: string };
}) {
  await requireUser("/compte/reservation");

  const driver = searchParams.driver ? await getDirectoryDriver(searchParams.driver) : undefined;
  const success = searchParams.status === "success";

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-lg place-items-center px-5 pt-28 text-center lg:pt-32">
      {success && searchParams.driver && searchParams.booking && (
        <MarkPaid driverId={searchParams.driver} bookingId={searchParams.booking} />
      )}
      <div>
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-400/10">
          <CheckCircle2 className="h-9 w-9 text-emerald-400" />
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white">
          {success ? "Réservation confirmée !" : "Réservation"}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-white/60">
          {driver
            ? `Votre course avec ${driver.firstName} ${driver.lastName} (${driver.car.make} ${driver.car.model}) est confirmée. Vous recevrez les détails par e-mail.`
            : "Votre paiement a été traité avec succès."}
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {driver && (
            <a
              href={whatsappUrl(
                `Bonjour, au sujet de ma course avec ${driver.firstName} ${driver.lastName}.`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              <MessageCircle className="h-4 w-4" />
              Contacter sur WhatsApp
            </a>
          )}
          <Link href="/compte" className="btn-ghost">
            <Home className="h-4 w-4" />
            Mon espace
          </Link>
        </div>
      </div>
    </div>
  );
}
