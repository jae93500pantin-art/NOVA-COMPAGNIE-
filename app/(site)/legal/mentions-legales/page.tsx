export const metadata = { title: "Mentions légales — Nova Compagnie" };

export default function LegalNoticePage() {
  return (
    <>
      <h1>Mentions légales</h1>
      <p className="updated">Dernière mise à jour : 11 juin 2026</p>

      <h2>Éditeur</h2>
      <p>
        Nova Compagnie — prototype de démonstration. Les informations ci-dessous sont
        fictives et fournies à titre d’exemple dans le cadre d’une maquette
        produit.
      </p>
      <ul>
        <li>Forme : société par actions simplifiée (exemple)</li>
        <li>Siège social : 12 rue de l’Élégance, 75008 Paris, France</li>
        <li>
          Contact :{" "}
          <a href="mailto:contact@novacompagnie.com">contact@novacompagnie.com</a>
        </li>
        <li>Directeur de la publication : l’équipe Nova Compagnie</li>
      </ul>

      <h2>Hébergement</h2>
      <p>
        En production, l’application est destinée à être hébergée sur une
        infrastructure conforme au RGPD, au sein de l’Union européenne.
      </p>

      <h2>Protection des données</h2>
      <p>
        Pour l’exercice de vos droits, consultez notre{" "}
        <a href="/legal/confidentialite">politique de confidentialité</a> ou
        votre <a href="/legal/mes-donnees">centre « Mes données »</a>.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L’ensemble des éléments de la plateforme (marques, logos, textes,
        visuels) est protégé. Toute reproduction non autorisée est interdite.
      </p>
    </>
  );
}
