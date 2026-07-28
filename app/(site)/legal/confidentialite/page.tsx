export const metadata = { title: "Politique de confidentialité — Nova Compagnie" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p className="updated">Dernière mise à jour : 11 juin 2026</p>
      <p className="lead">
        Nova Compagnie accorde la plus grande importance à la protection de vos données
        personnelles. Cette politique explique quelles données nous collectons,
        pourquoi, et comment vous gardez le contrôle, conformément au Règlement
        général sur la protection des données (RGPD, UE 2016/679).
      </p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement est Nova Compagnie (prototype de démonstration).
        Pour toute question relative à vos données, contactez notre délégué à la
        protection des données :{" "}
        <a href="mailto:contact@novacompagnie.com">contact@novacompagnie.com</a>.
      </p>

      <h2>2. Données que nous collectons</h2>
      <ul>
        <li>
          <strong>Compte&nbsp;:</strong> prénom, nom, e-mail, téléphone, rôle
          (client ou chauffeur).
        </li>
        <li>
          <strong>Profil chauffeur&nbsp;:</strong> informations véhicule,
          langues, tarifs, biographie, photos.
        </li>
        <li>
          <strong>Communications&nbsp;:</strong> messages échangés via la
          messagerie.
        </li>
        <li>
          <strong>Techniques&nbsp;:</strong> données de connexion strictement
          nécessaires (session, sécurité). Mesure d’audience uniquement avec
          votre consentement.
        </li>
      </ul>

      <h2>3. Bases légales</h2>
      <ul>
        <li>
          <strong>Exécution du contrat</strong> — gestion de votre compte et des
          réservations.
        </li>
        <li>
          <strong>Consentement</strong> — cookies de mesure d’audience,
          communications marketing.
        </li>
        <li>
          <strong>Intérêt légitime</strong> — sécurité, prévention de la fraude.
        </li>
        <li>
          <strong>Obligation légale</strong> — conservation de certaines données
          de facturation.
        </li>
      </ul>

      <h2>4. Durées de conservation</h2>
      <p>
        Les données de compte sont conservées tant que votre compte est actif,
        puis supprimées ou anonymisées sous 30 jours après clôture. Les messages
        du salon live sont éphémères et ne sont jamais enregistrés.
      </p>

      <h2>5. Vos droits</h2>
      <p>
        Vous disposez d’un droit d’accès, de rectification, d’effacement, de
        limitation, d’opposition et de portabilité de vos données. Vous pouvez
        les exercer directement depuis votre{" "}
        <a href="/legal/mes-donnees">centre « Mes données »</a>, ou en nous
        contactant. Vous avez également le droit d’introduire une réclamation
        auprès de la CNIL.
      </p>

      <h2>6. Sécurité</h2>
      <p>
        Les échanges sont chiffrés en transit. L’accès aux données est protégé
        par une authentification et des règles d’autorisation au niveau des
        lignes (Row Level Security). Aucune donnée n’est partagée à des tiers
        sans base légale.
      </p>
    </>
  );
}
