"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getDriver } from "@/lib/drivers";
import { DriverRequests } from "@/components/DriverRequests";

export function DriverCourses() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/auth/login");
    // Mirror image of the guard in ClientBookings: send a client to the page
    // that actually lists their own bookings.
    else if (user.role !== "driver") router.replace("/compte/reservations");
  }, [loading, user, router]);

  if (loading || !user || user.role !== "driver") {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const driver = user.driverId ? getDriver(user.driverId) : undefined;

  return (
    <div>
      <Link
        href="/compte"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" /> Mon espace
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-white">
        Mes courses
      </h1>
      <p className="mt-1 text-sm text-white/55">
        Acceptez ou refusez les demandes de vos clients en temps réel.
      </p>

      <div className="mt-8">
        {driver ? (
          <DriverRequests driverId={driver.id} />
        ) : (
          <div className="rounded-2xl glass p-8 text-center">
            <p className="text-sm text-white/70">
              Aucun profil chauffeur n’est lié à ce compte.
            </p>
            <p className="mt-2 text-xs text-white/45">
              Les demandes de course sont adressées à un profil public précis.
              Tant que le compte n’y est pas rattaché
              {user.driverId ? ` (profil « ${user.driverId} » introuvable)` : ""},
              aucune course ne peut arriver ici.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
