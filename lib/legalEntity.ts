import { isValidSiren } from "@/lib/siren";

/**
 * L'identité légale de l'éditeur du site, en un seul endroit.
 *
 * ## ⚠️ Ce fichier porte des données qui ENGAGENT
 *
 * Les mentions légales sont obligatoires (art. 6-III de la LCEN du 21 juin
 * 2004) et leur absence est sanctionnée pénalement. Jusqu'au 2026-10-02, la
 * page affichait **des informations inventées** : « prototype de
 * démonstration », une forme de société fausse et une adresse qui n'existe pas
 * (« 12 rue de l'Élégance »). Sur un site qui référence de vrais
 * professionnels et met en relation de vrais clients, c'était le pire des deux
 * mondes : illisible pour un contrôle, et faux pour un client qui cherche à
 * qui s'adresser.
 *
 * ## ⚠️ Un champ vide est ASSUMÉ, une valeur inventée ne l'est pas
 *
 * Trois mentions ne peuvent venir que de l'éditeur : SIREN, SIRET et adresse
 * postale. Elles sont volontairement **vides** plutôt que remplies d'un
 * numéro plausible. Une mention manquante est un manquement qu'on voit et
 * qu'on corrige en une ligne ; un SIREN inventé est une **fausse déclaration
 * d'identité d'entreprise**, qui passe tous les contrôles automatiques et ne
 * se découvre qu'au litige. `missingLegalMentions()` les liste, et la page
 * l'affiche au lieu de faire semblant.
 *
 * Pour compléter : remplir `SIREN`, `SIRET` et `ADDRESS` ci-dessous. Rien
 * d'autre à toucher — la page, le pied de page et les autres pages légales
 * lisent ce module.
 */

/* -------------------------------------------------------------------------- */
/*  Éditeur                                                                   */
/* -------------------------------------------------------------------------- */

export const EDITOR_NAME = "Jérémie Yang";

/**
 * ⚠️ « Entrepreneur individuel » n'est pas une société : il n'y a ni capital
 * social, ni RCS au sens d'une personne morale, et la page ne doit donc pas
 * en afficher. Depuis le 15 mai 2022 (loi en faveur de l'activité
 * professionnelle indépendante), la dénomination doit comporter le nom de
 * l'entrepreneur précédé ou suivi de « entrepreneur individuel » ou « EI ».
 */
export const EDITOR_LEGAL_FORM = "Entrepreneur individuel (EI) — micro-entreprise";

/** La dénomination complète, telle qu'elle doit apparaître. */
export const EDITOR_DENOMINATION = `${EDITOR_NAME}, entrepreneur individuel (EI)`;

export const PUBLICATION_DIRECTOR = EDITOR_NAME;

/** ⚠️ À RENSEIGNER — 9 chiffres. Vide = la page signale la mention manquante. */
export const SIREN = "";

/** ⚠️ À RENSEIGNER — 14 chiffres (SIREN + NIC de l'établissement). Facultatif. */
export const SIRET = "";

/** ⚠️ À RENSEIGNER — l'adresse de l'établissement déclaré au répertoire SIRENE. */
export const ADDRESS = "";

/* -------------------------------------------------------------------------- */
/*  Hébergeur                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * ⚠️ L'hébergeur réel est **Microsoft Azure**, pas Vercel ni Cloudflare.
 *
 * `deploy.sh` déploie sur une machine virtuelle Azure (`az vm`, groupe de
 * ressources `rg-nova`, machine `vm-nova`) jointe en SSH. Nommer un hébergeur
 * qui n'héberge pas prive la mention de son seul usage : permettre à un tiers
 * de s'adresser à qui détient réellement les contenus.
 *
 * Microsoft Ireland Operations Limited est l'entité contractante de Microsoft
 * pour les services en ligne dans l'Espace économique européen.
 */
export const HOST_NAME = "Microsoft Azure — Microsoft Ireland Operations Limited";
export const HOST_ADDRESS =
  "One Microsoft Place, South County Business Park, Leopardstown, Dublin 18, D18 P521, Irlande";

/* -------------------------------------------------------------------------- */
/*  Contrôle                                                                  */
/* -------------------------------------------------------------------------- */

export type LegalMention = "siren" | "address";

export const LEGAL_MENTION_LABELS: Record<LegalMention, string> = {
  siren: "le numéro SIREN (9 chiffres)",
  address: "l'adresse de l'établissement",
};

/**
 * Les mentions obligatoires qui manquent — ou qui sont **invalides**.
 *
 * ⚠️ Un SIREN mal recopié est inclus : il a l'apparence de la conformité et
 * désigne une autre entreprise, ou aucune. La clé de Luhn
 * (`isValidSiren`) attrape l'immense majorité des fautes de frappe, et c'est
 * précisément le contrôle qu'un lecteur humain ne fait pas.
 *
 * ⚠️ Le SIRET n'y figure pas : il est **recommandé, pas obligatoire** pour un
 * entrepreneur individuel dont le SIREN est publié. En revanche, s'il est
 * renseigné, il doit être valide — d'où `invalidSiret()`.
 */
export function missingLegalMentions(): LegalMention[] {
  const missing: LegalMention[] = [];
  if (!SIREN.trim() || !isValidSiren(SIREN)) missing.push("siren");
  if (!ADDRESS.trim()) missing.push("address");
  return missing;
}

/** Le SIRET est renseigné mais ne passe pas sa clé de contrôle. */
export function invalidSiret(): boolean {
  return SIRET.trim().length > 0 && !isValidSiren(SIRET);
}

/** La page peut-elle s'afficher comme complète ? */
export function legalMentionsComplete(): boolean {
  return missingLegalMentions().length === 0 && !invalidSiret();
}

/**
 * Met en forme un SIREN / SIRET par groupes, comme sur un extrait SIRENE.
 * ⚠️ Rend la chaîne telle quelle si elle ne fait pas la bonne longueur : mieux
 * vaut afficher un numéro brut que le découper au mauvais endroit.
 */
export function formatIdentifier(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  if (digits.length === 14) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, "$1 $2 $3 $4");
  }
  return raw.trim();
}
