import { Suspense } from "react";
import { DriversExplorer } from "@/components/DriversExplorer";
import { DriversIntro } from "@/components/DriversIntro";
import { listDirectory } from "@/lib/driverDirectory";

export const metadata = {
  title: "Chauffeurs privés — Nova Compagnie",
};

/**
 * L'annuaire vient de la base, pas du code : `lib/drivers.ts` est vide depuis
 * le retrait des profils inventés. La lecture est faite **ici**, côté serveur,
 * parce qu'elle exige le service role — le statut de validation vit dans
 * `profiles`, que la RLS réserve à son propriétaire, et une lecture anon
 * publierait les chauffeurs encore en attente.
 *
 * Rendu à la demande : un nouveau chauffeur validé doit apparaître sans
 * reconstruction du site.
 */
export const dynamic = "force-dynamic";

export default async function DriversPage() {
  const drivers = await listDirectory();

  return (
    <div className="mx-auto max-w-7xl px-5 pb-16 pt-32 lg:px-8 lg:pt-36">
      <DriversIntro />
      <Suspense fallback={<div className="text-white/40">…</div>}>
        <DriversExplorer drivers={drivers} />
      </Suspense>
    </div>
  );
}
