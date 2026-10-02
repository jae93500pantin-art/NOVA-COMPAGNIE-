import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from "@/lib/contact";
import { whatsappUrl } from "@/lib/whatsapp";
import {
  ADDRESS,
  EDITOR_DENOMINATION,
  EDITOR_LEGAL_FORM,
  HOST_ADDRESS,
  HOST_NAME,
  LEGAL_MENTION_LABELS,
  PUBLICATION_DIRECTOR,
  SIREN,
  SIRET,
  formatIdentifier,
  invalidSiret,
  missingLegalMentions,
} from "@/lib/legalEntity";

export const metadata = { title: "Mentions légales — Nova Compagnie" };

/**
 * ⚠️ Aucune donnée d'identité en dur dans cette page.
 *
 * Tout vient de `lib/legalEntity.ts`. La page affichait auparavant un
 * « prototype de démonstration », une forme de société fausse et une adresse
 * inexistante ; ces mentions sont obligatoires (art. 6-III de la LCEN) et le
 * site référence de vrais professionnels. Les recopier ici les rendrait
 * modifiables à deux endroits — c'est-à-dire modifiables à moitié.
 *
 * ⚠️ Une mention qui manque est AFFICHÉE comme manquante. Afficher une valeur
 * plausible à la place serait indétectable, donc pire.
 */
export default function LegalNoticePage() {
  const missing = missingLegalMentions();
  const siretWrong = invalidSiret();

  return (
    <>
      <h1>Mentions légales</h1>
      <p className="updated">Dernière mise à jour : 2 octobre 2026</p>

      {(missing.length > 0 || siretWrong) && (
        <p className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] p-4 text-sm leading-relaxed text-amber-100">
          <strong>Mentions à compléter.</strong> Les informations suivantes
          doivent être renseignées par l&apos;éditeur&nbsp;:{" "}
          {missing.map((m) => LEGAL_MENTION_LABELS[m]).join(", ")}
          {siretWrong &&
            (missing.length > 0 ? ", et " : "") +
              "le SIRET saisi, dont la clé de contrôle est invalide"}
          .
        </p>
      )}

      <h2>Éditeur du site</h2>
      <ul>
        <li>
          Éditeur&nbsp;: <strong>{EDITOR_DENOMINATION}</strong>
        </li>
        <li>Forme juridique&nbsp;: {EDITOR_LEGAL_FORM}</li>
        <li>
          SIREN&nbsp;:{" "}
          {SIREN.trim() && !missing.includes("siren") ? (
            formatIdentifier(SIREN)
          ) : (
            <em>à compléter</em>
          )}
        </li>
        {SIRET.trim() && !siretWrong && (
          <li>SIRET&nbsp;: {formatIdentifier(SIRET)}</li>
        )}
        <li>
          Siège de l&apos;activité&nbsp;:{" "}
          {ADDRESS.trim() ? ADDRESS : <em>à compléter</em>}
        </li>
        <li>
          Contact&nbsp;: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </li>
        <li>
          WhatsApp&nbsp;:{" "}
          <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer">
            {CONTACT_PHONE_DISPLAY}
          </a>
        </li>
        <li>Directeur de la publication&nbsp;: {PUBLICATION_DIRECTOR}</li>
      </ul>
      {/* ⚠️ Un entrepreneur individuel n'est pas une société : ni capital
          social, ni RCS de personne morale. Ne pas réintroduire ces lignes. */}
      <p>
        Nova Compagnie est un nom commercial exploité par{" "}
        {EDITOR_DENOMINATION}. L&apos;activité étant exercée en entreprise
        individuelle, il n&apos;y a ni capital social, ni immatriculation au
        registre du commerce et des sociétés en tant que personne morale.
      </p>

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

      <h2>Avis des clients</h2>
      {/* La contrepartie de la publication d'avis : dire s'ils sont vérifiés et
          comment (art. L111-7-2 du Code de la consommation). Le même propos que
          `REVIEW_DISCLOSURE`, à l'endroit où un lecteur le cherche. */}
      <p>
        Les avis publiés sur les fiches des chauffeurs sont déposés par des
        titulaires d’un compte Nova Compagnie. Nova Compagnie n’organisant pas
        les courses, elle <strong>ne peut pas vérifier qu’une prestation a
        effectivement eu lieu</strong> : ces avis ne font l’objet d’aucune
        vérification. Aucune contrepartie n’est accordée en échange d’un avis, et
        aucun avis n’est trié ni supprimé en fonction de la note attribuée. Leur
        auteur peut les modifier ou les supprimer à tout moment depuis la fiche
        concernée.
      </p>

      <h2>Hébergement</h2>
      <p>
        Le site est hébergé par <strong>{HOST_NAME}</strong>, {HOST_ADDRESS}.
      </p>

      <h2>Protection des données</h2>
      <p>
        Pour l’exercice de vos droits, consultez notre{" "}
        <a href="/legal/confidentialite">politique de confidentialité</a> ou
        votre <a href="/legal/mes-donnees">centre « Mes données »</a>. Toute
        demande peut être adressée à{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Réclamations</h2>
      {/* ⚠️ La distinction qui protège l'éditeur : Nova répond de son service
          en ligne, le chauffeur de la course. Promettre de traiter les
          réclamations de transport reviendrait à s'en dire responsable. */}
      <p>
        Le service fourni par Nova Compagnie se limite au référencement et à la
        mise en relation. Toute réclamation relative à une course exécutée
        relève du chauffeur, seul contractant du client. Pour une réclamation
        portant sur le site lui-même, écrivez à{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L’ensemble des éléments de la plateforme (marques, logos, textes,
        visuels) est protégé. Toute reproduction non autorisée est interdite.
      </p>
    </>
  );
}
