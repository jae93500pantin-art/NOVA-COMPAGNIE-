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
  "vtc_register",
  "kbis",
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
  /**
   * ⚠️ La carte et le registre ne disent pas la même chose, et c'est pour ça
   * que les deux sont exigés : la carte atteste du **chauffeur**, le registre
   * atteste de l'**exploitant**. Un chauffeur peut détenir une carte valide
   * alors que son entreprise n'est pas (ou plus) inscrite au registre — et
   * l'exploitation est alors irrégulière. Ne pas fusionner ces deux pièces.
   */
  vtc_register: {
    label: "Inscription au registre VTC",
    hint: "Récépissé d'inscription au registre des exploitants VTC (ministère des Transports).",
    required: true,
  },
  kbis: {
    label: "Kbis ou avis SIRENE",
    hint: "Rattache le SIREN déclaré à une entreprise réellement immatriculée. De moins de 3 mois.",
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

/* -------------------------------------------------------------------------- */
/*  Contrôle par un administrateur                                            */
/* -------------------------------------------------------------------------- */

/**
 * Une pièce telle qu'elle est contrôlée. Volontairement minimal : ces règles
 * tournent côté serveur ET dans l'écran d'admin, et n'ont besoin de rien de
 * plus pour trancher.
 */
export interface ReviewedDocument {
  kind: string;
  /** L'administrateur a coché « Conforme » APRÈS avoir regardé le fichier. */
  checkedOk?: boolean;
  /** Échéance saisie par l'administrateur, "YYYY-MM-DD". */
  expiresAt?: string | null;
}

/** Délai d'alerte avant l'échéance d'une pièce. */
export const EXPIRY_WARNING_DAYS = 30;

/** Jours restants avant échéance, ou `null` si la pièce n'en a pas. */
export function daysUntilExpiry(
  doc: ReviewedDocument,
  now: () => number = Date.now
): number | null {
  if (!doc.expiresAt || !/^\d{4}-\d{2}-\d{2}$/.test(doc.expiresAt)) return null;
  // ⚠️ Minuit LOCAL des deux côtés : comparer une date nue à un instant ferait
  // basculer l'échéance un jour trop tôt ou trop tard selon l'heure qu'il est.
  const [y, m, d] = doc.expiresAt.split("-").map(Number);
  const end = new Date(y, m - 1, d).getTime();
  const today = new Date(now());
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** La pièce est-elle périmée ? Le jour de l'échéance compte encore. */
export function isExpired(
  doc: ReviewedDocument,
  now: () => number = Date.now
): boolean {
  const left = daysUntilExpiry(doc, now);
  return left !== null && left < 0;
}

/** Échéance proche, mais pas encore atteinte — le cas qu'on veut signaler. */
export function expiresSoon(
  doc: ReviewedDocument,
  now: () => number = Date.now,
  within: number = EXPIRY_WARNING_DAYS
): boolean {
  const left = daysUntilExpiry(doc, now);
  return left !== null && left >= 0 && left <= within;
}

/**
 * Le dossier peut-il être validé ?
 *
 * ⚠️ Trois conditions, et il faut les trois. Déposer un fichier ne prouve rien :
 * c'est le CONTRÔLE qui fait la validation, d'où `checkedOk`. Et une pièce
 * périmée au moment de l'examen ne vaut pas mieux qu'une pièce absente.
 *
 * Rend la liste des pièces qui bloquent — l'écran doit pouvoir dire *laquelle*,
 * pas seulement « non ».
 */
export function blockingDocuments(
  docs: ReviewedDocument[],
  now: () => number = Date.now
): { kind: DriverDocumentKind; reason: "missing" | "unchecked" | "expired" }[] {
  const byKind = new Map(docs.map((d) => [d.kind, d]));
  const out: {
    kind: DriverDocumentKind;
    reason: "missing" | "unchecked" | "expired";
  }[] = [];
  for (const kind of DOCUMENT_KINDS) {
    if (!DOCUMENT_LABELS[kind].required) continue;
    const doc = byKind.get(kind);
    if (!doc) out.push({ kind, reason: "missing" });
    else if (isExpired(doc, now)) out.push({ kind, reason: "expired" });
    else if (!doc.checkedOk) out.push({ kind, reason: "unchecked" });
  }
  return out;
}

/** Raccourci : le bouton « Valider » est-il ouvert ? */
export function canApproveDossier(
  docs: ReviewedDocument[],
  now: () => number = Date.now
): boolean {
  return blockingDocuments(docs, now).length === 0;
}

/**
 * Une pièce OBLIGATOIRE est-elle périmée ?
 *
 * ⚠️ Sert à retirer automatiquement une fiche de l'annuaire, pas à la refuser :
 * un chauffeur dont l'assurance a expiré hier n'est pas un fraudeur, il est
 * hors des conditions. Il redépose, et il reparaît.
 */
export function hasExpiredRequired(
  docs: ReviewedDocument[],
  now: () => number = Date.now
): boolean {
  return docs.some(
    (d) =>
      DOCUMENT_LABELS[d.kind as DriverDocumentKind]?.required &&
      isExpired(d, now)
  );
}

/* -------------------------------------------------------------------------- */
/*  Refus d'un dossier                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Motifs de refus. Jeu **fermé** : un motif libre pour tout finirait en « non »
 * sans explication, et le chauffeur ne saurait pas quoi redéposer. `other`
 * existe, mais exige alors une précision (voir `rejectionError`).
 */
export const REJECTION_REASONS = [
  "unreadable",
  "expired",
  "name_mismatch",
  "missing",
  "other",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  unreadable: "Document illisible",
  expired: "Document expiré",
  name_mismatch: "Nom différent de celui déclaré",
  missing: "Pièce manquante",
  other: "Autre motif",
};

export function isRejectionReason(v: unknown): v is RejectionReason {
  return (
    typeof v === "string" && (REJECTION_REASONS as readonly string[]).includes(v)
  );
}

/**
 * Message d'erreur du formulaire de refus, ou `null` s'il est recevable.
 *
 * ⚠️ « Autre motif » sans texte est refusé : c'est le seul cas où le chauffeur
 * n'aurait aucun moyen de savoir quoi corriger, et il reviendrait déposer la
 * même chose.
 */
export function rejectionError(
  reason: unknown,
  note: string
): string | null {
  if (!isRejectionReason(reason)) return "Choisissez un motif.";
  const trimmed = note.trim();
  if (reason === "other" && trimmed.length < 10) {
    return "Précisez le motif (10 caractères minimum).";
  }
  if (trimmed.length > 500) return "Motif trop long (500 caractères maximum).";
  return null;
}
