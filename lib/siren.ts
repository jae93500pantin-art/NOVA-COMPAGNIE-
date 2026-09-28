/**
 * Validation d'un numéro SIREN / SIRET.
 *
 * Extrait de `lib/bookingVoucher.ts` au passage au **statut d'annuaire** : le
 * bon de réservation a disparu avec la réservation, mais le numéro reste une
 * pièce du dossier d'un professionnel référencé — c'est même ce qui distingue
 * un annuaire de professionnels d'une liste de particuliers.
 */

/**
 * SIREN (9 chiffres) ou SIRET (14), clé de Luhn comprise.
 *
 * La longueur seule ne suffit pas : neuf chiffres au hasard la satisfont, et un
 * numéro inventé sur une fiche publique est exactement ce qu'on cherche à
 * éviter. La clé ne prouve pas que l'entreprise existe, mais elle écarte les
 * fautes de frappe et les valeurs de remplissage.
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
