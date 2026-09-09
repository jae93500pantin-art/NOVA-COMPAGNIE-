import { requireUser } from "@/lib/session";
import { DriverOnboarding } from "@/components/DriverOnboarding";

export const metadata = { title: "Devenir chauffeur — Nova Compagnie" };

/**
 * Tunnel d'inscription chauffeur.
 *
 * Volontairement dans `/compte`, derrière la même garde que le reste de
 * l'espace : remplir ce dossier suppose d'avoir déjà un compte chauffeur, et
 * les pièces déposées sont des données personnelles sensibles.
 */
export default async function DriverOnboardingPage() {
  await requireUser("/compte/onboarding");

  return (
    <div className="mx-auto max-w-2xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <h1 className="text-2xl font-semibold text-white">Devenir chauffeur</h1>
      <p className="mt-1 mb-8 text-sm text-white/55">
        Trois étapes, puis vérification de votre dossier par notre équipe.
      </p>
      <DriverOnboarding />
    </div>
  );
}
