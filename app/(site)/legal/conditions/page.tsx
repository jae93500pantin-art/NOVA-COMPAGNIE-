export const metadata = { title: "Conditions d’utilisation — Nova Compagnie" };

export default function TermsPage() {
  return (
    <>
      <h1>Conditions générales d’utilisation</h1>
      <p className="updated">Dernière mise à jour : 11 juin 2026</p>
      <p className="lead">
        Les présentes conditions régissent l’utilisation de la plateforme
        Nova Compagnie, annuaire de chauffeurs privés indépendants.
      </p>

      <h2>1. Objet</h2>
      <p>
        Nova Compagnie fournit un <strong>annuaire</strong> de chauffeurs
        indépendants. La plateforme ne prend aucune réservation, n’organise
        aucun transport et n’encaisse aucune somme au titre des courses. Le
        contrat de transport est conclu, exécuté et facturé directement entre le
        client et le chauffeur.
      </p>

      <h2>2. Compte</h2>
      <p>
        Vous êtes responsable de l’exactitude des informations fournies et de la
        confidentialité de vos identifiants. Tout usage frauduleux peut entraîner
        la suspension du compte.
      </p>

      <h2>3. Engagements des chauffeurs</h2>
      <ul>
        <li>Disposer des licences, assurances et autorisations requises.</li>
        <li>Fournir des informations véridiques sur le véhicule et les tarifs.</li>
        <li>Respecter la réglementation applicable au transport de personnes.</li>
      </ul>

      <h2>4. Engagements des clients</h2>
      <ul>
        <li>
          Fournir des informations exactes lors de la prise de contact avec un
          chauffeur.
        </li>
        <li>Respecter le chauffeur, le véhicule et les présentes conditions.</li>
      </ul>

      <h2>5. Tarifs et paiement</h2>
      <p>
        Les tarifs affichés sont ceux que <strong>chaque chauffeur annonce
        lui-même</strong>. Nova Compagnie ne les fixe pas, ne les impose pas et
        ne prélève aucune commission sur les courses.
      </p>
      <p>
        <strong>Aucun paiement ne transite par la plateforme.</strong> Le prix
        définitif, les modalités de règlement, l’annulation et la facturation
        relèvent de l’accord conclu entre le client et le chauffeur.
      </p>

      <h2>6. Responsabilité</h2>
      <p>
        Nova Compagnie agit comme intermédiaire technique et vérifie, sur pièces,
        les habilitations administratives déclarées par les chauffeurs
        référencés. Elle n’est pas partie au contrat de transport et ne saurait
        être tenue responsable de son exécution.
      </p>

      <h2>7. Droit applicable</h2>
      <p>
        Les présentes conditions sont régies par le droit français et européen.
      </p>
    </>
  );
}
