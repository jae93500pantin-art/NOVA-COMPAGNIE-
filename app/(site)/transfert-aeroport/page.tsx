import { TransferAirport } from "@/components/TransferAirport";
import { listDirectory } from "@/lib/driverDirectory";

export const metadata = {
  title: "Transfert aéroport — chauffeurs référencés · Nova Compagnie",
};

/**
 * La page lit l'annuaire **ici**, côté serveur, et le passe au corps client.
 *
 * ⚠️ C'est indispensable depuis que le bloc de recherche liste de vrais
 * chauffeurs : `listDirectory` exige le service role (le statut de validation
 * vit dans `profiles`, que la RLS réserve à son propriétaire), donc un
 * composant client ne peut pas l'appeler. Avant ce câblage, `TransferEstimate`
 * lisait `lib/drivers.ts` — vide — et annonçait « 0 chauffeur » sur tous les
 * trajets.
 *
 * Rendu à la demande : un chauffeur validé doit apparaître ici sans
 * reconstruction du site.
 */
export const dynamic = "force-dynamic";

export default async function TransferPage() {
  const drivers = await listDirectory();

  return <TransferAirport drivers={drivers} />;
}
