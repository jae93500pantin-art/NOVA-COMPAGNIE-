/**
 * Bon de réservation préalable — le domaine, pur et testable.
 *
 * Ce module ne dessine rien : il assemble les données d'un bon, en numérote un
 * de façon **stable**, et dit ce qui manque pour qu'il soit présentable. Le
 * rendu PDF vit dans `lib/pdf/bookingVoucher.tsx`, la route dans
 * `app/api/booking/[id]/pdf`.
 *
 * ## Pourquoi un module qui sait REFUSER
 *
 * Un bon de réservation est présenté à un contrôle. Un document au bon format,
 * au bon en-tête, mais dont l'itinéraire dit « Adresse de départ » ou dont le
 * numéro SIRET est vide, est **pire qu'un document absent** : il a l'apparence
 * de la conformité. Le générateur ne complète donc jamais un champ manquant
 * par un tiret, un « N/A » ou une chaîne vide — il refuse d'émettre et nomme ce
 * qui manque, pour que l'appelant le corrige au lieu de l'ignorer.
 *
 * ⚠️ La liste des mentions suivie ici est celle fournie par le produit
 * (identité et habilitation du chauffeur, identité du client, trajet, prix).
 * Les textes réglementaires évoluent : `REQUIRED_FIELDS` est le seul endroit à
 * modifier, et les tests cassent si une mention disparaît en silence.
 */

import { DEFAULT_DROPOFF, DEFAULT_PICKUP } from "./bookings";

/** Préfixe des numéros de bon. Change ⇒ les anciens bons restent lisibles. */
export const VOUCHER_PREFIX = "NOVA";

export interface VoucherDriver {
  firstName: string;
  lastName: string;
  /** SIREN (9 chiffres) ou SIRET (14) de l'exploitant. */
  siret: string;
  /** Numéro de carte professionnelle VTC (REVTC). */
  vtcCardNumber: string;
  /** Immatriculation du véhicule effectivement affecté à la course. */
  plate: string;
}

export interface VoucherClient {
  name: string;
  phone: string;
}

export interface VoucherTrip {
  /** Prise en charge, **locale et sans fuseau** : `YYYY-MM-DDTHH:mm`. */
  when: string;
  pickup: string;
  dropoff: string;
}

export interface VoucherPayment {
  /** Prix TTC convenu, en euros. */
  totalTTC: number;
}

export interface BookingVoucher {
  /** `NOVA-2026-A3F9K`, stable pour une réservation donnée. */
  number: string;
  /** Date d'émission, en millisecondes. */
  issuedAt: number;
  driver: VoucherDriver;
  client: VoucherClient;
  trip: VoucherTrip;
  payment: VoucherPayment;
}

/* -------------------------------------------------------------------------- */
/*  Numérotation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Le numéro de bon, dérivé de l'identifiant de la réservation.
 *
 * ⚠️ **Déterministe, jamais aléatoire ni séquentiel.** Un bon se regénère :
 * le client le reperd, le chauffeur le réimprime, un e-mail le renvoie. Deux
 * numéros différents pour une même course seraient impossibles à défendre lors
 * d'un contrôle, et un compteur partagé exigerait un verrou en base pour ne pas
 * distribuer deux fois le même. Le même identifiant de course donne toujours le
 * même numéro, sans état.
 *
 * L'année vient de la **réservation**, pas de l'horloge : réimprimer en janvier
 * un bon émis en décembre ne doit pas le renuméroter.
 */
export function voucherNumber(bookingId: string, bookedAt: number): string {
  const year = new Date(bookedAt).getFullYear();
  return `${VOUCHER_PREFIX}-${year}-${shortCode(bookingId)}`;
}

/**
 * 5 caractères lisibles tirés de l'identifiant (FNV-1a 32 bits).
 *
 * L'alphabet exclut I, O, 0 et 1 : ce numéro est lu à voix haute et recopié à
 * la main lors d'un contrôle, où « 0 » et « O » ne se distinguent pas.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function shortCode(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    // FNV-1a : multiplication par 16777619, en restant sur 32 bits non signés.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += ALPHABET[hash % ALPHABET.length];
    hash = Math.floor(hash / ALPHABET.length) + 7;
  }
  return code;
}

/* -------------------------------------------------------------------------- */
/*  Champs obligatoires                                                       */
/* -------------------------------------------------------------------------- */

export type VoucherField =
  | "driverName"
  | "driverSiret"
  | "driverVtcCard"
  | "vehiclePlate"
  | "clientName"
  | "clientPhone"
  | "pickupAt"
  | "pickupAddress"
  | "dropoffAddress"
  | "price";

/** Intitulés français, destinés au message d'erreur comme au journal. */
export const VOUCHER_FIELD_LABELS: Record<VoucherField, string> = {
  driverName: "nom du chauffeur",
  driverSiret: "SIREN/SIRET de l'exploitant",
  driverVtcCard: "numéro de carte professionnelle VTC",
  vehiclePlate: "immatriculation du véhicule",
  clientName: "nom du client",
  clientPhone: "téléphone du client",
  pickupAt: "date et heure de prise en charge",
  pickupAddress: "adresse de départ",
  dropoffAddress: "adresse de destination",
  price: "prix TTC convenu",
};

/** Format `YYYY-MM-DDTHH:mm` — la forme locale sans fuseau du domaine. */
const WHEN_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Ce qui manque pour que ce bon soit présentable. Tableau vide = complet.
 *
 * ⚠️ Les adresses par défaut de `buildBooking` (`DEFAULT_PICKUP` /
 * `DEFAULT_DROPOFF`) comptent comme **manquantes**, et c'est le contrôle le
 * moins évident du lot : ce sont des chaînes non vides, qui passeraient tous
 * les tests de présence habituels et s'imprimeraient telles quelles. Un bon
 * affichant « Adresse de départ → Destination » serait un faux document.
 */
export function missingVoucherFields(v: BookingVoucher): VoucherField[] {
  const missing: VoucherField[] = [];
  const blank = (s: string) => !s || !s.trim();

  if (blank(v.driver.firstName) && blank(v.driver.lastName)) {
    missing.push("driverName");
  }
  if (!isValidSiren(v.driver.siret)) missing.push("driverSiret");
  if (blank(v.driver.vtcCardNumber)) missing.push("driverVtcCard");
  if (blank(v.driver.plate)) missing.push("vehiclePlate");

  if (blank(v.client.name)) missing.push("clientName");
  if (blank(v.client.phone)) missing.push("clientPhone");

  if (!WHEN_RE.test(v.trip.when)) missing.push("pickupAt");
  if (blank(v.trip.pickup) || v.trip.pickup.trim() === DEFAULT_PICKUP) {
    missing.push("pickupAddress");
  }
  if (blank(v.trip.dropoff) || v.trip.dropoff.trim() === DEFAULT_DROPOFF) {
    missing.push("dropoffAddress");
  }

  if (!Number.isFinite(v.payment.totalTTC) || v.payment.totalTTC <= 0) {
    missing.push("price");
  }
  return missing;
}

/**
 * SIREN (9 chiffres) ou SIRET (14), clé de Luhn comprise.
 *
 * La longueur seule ne suffit pas : neuf chiffres au hasard la satisfont, et
 * un numéro inventé sur un document présenté à un contrôle est exactement ce
 * qu'on cherche à éviter. La clé ne prouve pas que l'entreprise existe, mais
 * elle écarte les fautes de frappe et les valeurs de remplissage.
 *
 * ⚠️ Exception connue : La Poste (356000000) ne respecte pas la clé de Luhn.
 * Aucun chauffeur VTC ne s'inscrira sous ce SIREN ; le cas est écarté ici
 * plutôt que traité, pour ne pas ouvrir une liste d'exceptions à maintenir.
 */
export function isValidSiren(raw: string): boolean {
  const digits = (raw ?? "").replace(/\s/g, "");
  if (!/^\d{9}$|^\d{14}$/.test(digits)) return false;

  let sum = 0;
  // Luhn se lit de droite à gauche : un chiffre sur deux est doublé.
  for (let i = 0; i < digits.length; i++) {
    const fromRight = digits.length - 1 - i;
    let n = digits.charCodeAt(i) - 48;
    if (fromRight % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/* -------------------------------------------------------------------------- */
/*  Mise en forme                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `2026-01-12T14:30` → `12/01/2026 à 14:30`.
 *
 * ⚠️ La chaîne est découpée, jamais passée à `new Date()` : l'heure de prise en
 * charge est **locale et sans fuseau** (voir `lib/dbRows.ts`). La faire
 * transiter par un `Date` la rattacherait au fuseau du serveur, et un bon émis
 * depuis une machine en UTC annoncerait une prise en charge décalée d'une heure
 * — sur le seul document que le chauffeur présentera.
 */
export function formatVoucherWhen(when: string): string {
  if (!WHEN_RE.test(when)) return "";
  const [date, time] = when.split("T");
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y} à ${time}`;
}

/** Date d'émission : `12/01/2026 à 14:30`, dans le fuseau du serveur. */
export function formatIssuedAt(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `à ${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Nom affichable du chauffeur, sans double espace si l'un des deux manque. */
export function driverFullName(d: VoucherDriver): string {
  return `${d.firstName} ${d.lastName}`.trim();
}

/**
 * `12345678901234` → `123 456 789 01234`. Un SIRET se lit par groupes ;
 * quatorze chiffres d'affilée se recopient mal.
 */
export function formatSiren(raw: string): string {
  const digits = (raw ?? "").replace(/\s/g, "");
  if (digits.length === 9) return digits.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  if (digits.length === 14) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, "$1 $2 $3 $4");
  }
  return raw ?? "";
}

/* -------------------------------------------------------------------------- */
/*  Mentions légales du document                                              */
/* -------------------------------------------------------------------------- */

/**
 * Les mentions du pied de page.
 *
 * Elles vivent ici, avec le domaine, et non dans le composant de rendu : ce
 * sont des énoncés juridiques, pas de la mise en page, et les retrouver à côté
 * des règles de complétude évite qu'un ajustement de style les réécrive.
 */
export const VOUCHER_INTERMEDIATION_NOTICE =
  "Nova Compagnie agit en qualité d'intermédiaire de mise en relation entre le " +
  "client et le chauffeur, exploitant indépendant titulaire de sa propre carte " +
  "professionnelle VTC. La prestation de transport est exécutée sous la seule " +
  "responsabilité du chauffeur désigné sur le présent bon.";

export const VOUCHER_CONTROL_NOTICE =
  "Ce bon de réservation préalable doit pouvoir être présenté immédiatement à " +
  "toute réquisition des agents de contrôle. Il atteste que la course a fait " +
  "l'objet d'une réservation préalable et ne constitue ni un titre de transport " +
  "ni une facture.";

export const VOUCHER_PAYMENT_NOTICE =
  "Payé à l'avance via la plateforme NOVA Compagnie";
