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
] as const;

export type DriverDocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Libellé et rôle de chaque pièce, dans l'ordre où on les demande. */
export const DOCUMENT_LABELS: Record<
  DriverDocumentKind,
  { label: string; hint: string; required: boolean }
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

/** Les pièces obligatoires manquantes, pour savoir si le dossier est complet. */
export function missingRequired(
  provided: { kind: string }[]
): DriverDocumentKind[] {
  const have = new Set(provided.map((d) => d.kind));
  return DOCUMENT_KINDS.filter(
    (k) => DOCUMENT_LABELS[k].required && !have.has(k)
  );
}
