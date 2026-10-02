import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_HREF,
} from "@/lib/contact";

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
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </li>
        <li>
          Téléphone :{" "}
          <a href={CONTACT_PHONE_HREF}>{CONTACT_PHONE_DISPLAY}</a>
        </li>
        <li>Directeur de la publication : l’équipe Nova Compagnie</li>
      </ul>

      <h2>Nature de l’activité</h2>
      <p>
        Nova Compagnie est un <strong>annuaire</strong> de chauffeurs de
        transport avec chauffeur (VTC) indépendants. Le site ne prend aucune
        réservation, n’organise aucun transport et n’encaisse aucune somme au
        titre des courses : la prestation, son prix et sa facturation relèvent du
        chauffeur, seul contractant du client.
      </p>
      <p>
        Nova Compagnie <strong>n’exerce ni ne commercialise aucune activité de
        sécurité privée</strong> au sens du livre VI du Code de la sécurité
        intérieure, et ne dispose pas d’autorisation d’exercer délivrée par le
        CNAPS. Lorsqu’une fiche de chauffeur mentionne une carte
        professionnelle CNAPS, cette mention décrit une{" "}
        <strong>qualification personnelle du chauffeur</strong>, vérifiée sur
        pièce ; elle ne constitue ni une offre, ni la vente, ni l’exécution
        d’une prestation de protection des personnes.
      </p>

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
