/**
 * Pièces justificatives d'un chauffeur : types, limites, chemins.
 *
 * Module **pur** : il est importé aussi bien par la route de dépôt que par le
 * formulaire, pour que le navigateur refuse tout de suite ce que le serveur
 * refuserait de toute façon — et jamais l'inverse.
 */

export const DOCUMENT_KINDS = [
  "licence",
  "vtc_card",
  "insurance",
  "registration",
  "identity",
  "cnaps_card",
] as const;

export type DriverDocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * Libellé et rôle de chaque pièce, dans l'ordre où on les demande.
 *
 * `required` = exigée de tout chauffeur pour que le dossier soit complet. Les
 * autres pièces valorisent le profil sans conditionner la validation.
 */
export const DOCUMENT_LABELS: Record<
  DriverDocumentKind,
  {
    label: string;
    hint: string;
    required: boolean;
  }
> = {
  licence: {
    label: "Permis de conduire",
    hint: "Recto-verso, en cours de validité.",
    required: true,
  },
  vtc_card: {
    label: "Carte professionnelle VTC",
    hint: "Délivrée par la préfecture. Sans elle, l'exercice est illégal.",
    required: true,
  },
  insurance: {
    label: "Attestation d'assurance",
    hint: "Responsabilité civile professionnelle transport de personnes.",
    required: true,
  },
  registration: {
    label: "Carte grise",
    hint: "Du véhicule déclaré à l'étape précédente.",
    required: true,
  },
  identity: {
    label: "Pièce d'identité",
    hint: "Carte nationale d'identité ou passeport.",
    required: false,
  },
  cnaps_card: {
    label: "Carte professionnelle CNAPS",
    hint: "Facultative. Une fois vérifiée, elle affiche un badge de qualification sur votre fiche.",
    /**
     * ⚠️ Facultative, et elle doit le rester.
     *
     * Elle ne déclenche aucune prestation de sécurité : Nova Compagnie n'a pas
     * d'autorisation d'exercer CNAPS et ne peut donc pas en commercialiser
     * (art. L612-2 CSI). Cette pièce ne sert qu'à qualifier le profil du
     * chauffeur, comme son expérience ou ses langues. Voir `lib/cnaps.ts`.
     */
    required: false,
  },
};

/** 8 Mo : un scan de carte grise tient largement dedans. */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export const ALLOWED_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * Chemin de stockage d'une pièce.
 *
 * ⚠️ Dérivé du compte et du type, **jamais du nom de fichier envoyé**. Un nom
 * contrôlé par l'appelant permet de remonter dans l'arborescence (« ../ ») ou
 * d'écraser la pièce d'un autre chauffeur. Ici, un chauffeur ne peut écrire
 * que sous son propre identifiant, et seulement cinq chemins possibles.
 */
export function documentPath(
  driverAccountId: string,
  kind: DriverDocumentKind,
  mimeType: string
): string {
  const ext = EXTENSIONS[mimeType] ?? "bin";
  return `${driverAccountId}/${kind}.${ext}`;
}

/** Message d'erreur côté formulaire, ou `null` si le fichier est acceptable. */
export function documentError(file: {
  size: number;
  type: string;
}): string | null {
  if (file.size === 0) return "Ce fichier est vide.";
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `Fichier trop lourd (${Math.round(
      MAX_DOCUMENT_BYTES / 1024 / 1024
    )} Mo maximum).`;
  }
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return "Formats acceptés : JPEG, PNG, WebP ou PDF.";
  }
  return null;
}

/**
 * Les pièces obligatoires manquantes, pour savoir si le dossier est complet.
 *
 * ⚠️ Il n'y a **qu'un seul dossier**, celui du VTC. Cette fonction prenait
 * autrefois un drapeau `security` qui ajoutait la carte CNAPS aux pièces
 * exigées : il a été retiré avec l'axe « prestation de sécurité », que la
 * plateforme ne peut pas commercialiser (voir `lib/cnaps.ts`). Ne pas le
 * réintroduire pour rendre une pièce conditionnellement obligatoire — c'est
 * la trace qu'une seconde prestation est en train de réapparaître.
 */
export function missingRequired(
  provided: { kind: string }[]
): DriverDocumentKind[] {
  const have = new Set(provided.map((d) => d.kind));
  return DOCUMENT_KINDS.filter(
    (k) => DOCUMENT_LABELS[k].required && !have.has(k)
  );
}

/** Les pièces présentées dans le formulaire : toutes, obligatoires ou non. */
export function documentsToCollect(): DriverDocumentKind[] {
  return [...DOCUMENT_KINDS];
}
