export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatPrice(value: number, currency = "€") {
  return `${currency}${formatAmount(value)}`;
}

/**
 * Un montant en euros, à la française.
 *
 * Les centimes ne s'affichent que s'il y en a : depuis que le client supporte
 * 5 % de frais, un total tombe couramment sur une demie (535,50 €), alors que
 * les tarifs eux-mêmes restent entiers. Imposer « 510,00 € » partout pour ce
 * seul cas alourdirait toutes les autres lignes ; laisser passer le « 535.5 »
 * brut de JavaScript, lui, ne ressemble tout simplement pas à un prix.
 */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(".", ",");
}

export function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}
