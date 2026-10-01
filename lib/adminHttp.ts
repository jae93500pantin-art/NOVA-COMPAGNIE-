/**
 * Traduction d'un refus de `requireAdmin()` en réponse HTTP.
 *
 * ## ⚠️ Pourquoi un seul endroit
 *
 * Cette table était recopiée dans chaque route d'administration. Quatre copies
 * d'une règle d'autorisation finissent par diverger, et celle qui se trompe ne
 * produit pas une erreur visible : elle produit un **403 là où il fallait un
 * 401**, ou pire, un code de succès. C'est le genre d'écart qu'on ne découvre
 * qu'en le cherchant.
 *
 * Module **pur** : pas de `server-only`, pas d'import Supabase. Il ne fait que
 * mapper un état sur un code, ce qui le rend testable sans base ni session.
 */

/** Les états de refus de `requireAdmin()`. L'état « ok » n'est pas un refus. */
export type AdminRefusal =
  | "unconfigured"
  | "no-service-role"
  | "anonymous"
  | "forbidden";

export const ADMIN_REFUSALS: Record<
  AdminRefusal,
  { status: number; error: string }
> = {
  /**
   * 503 et non 500 : l'instance n'est pas cassée, elle n'est pas configurée.
   * Un 500 enverrait chercher un bug là où il manque une variable.
   */
  unconfigured: {
    status: 503,
    error: "Back-office indisponible : Supabase n'est pas configuré",
  },
  "no-service-role": {
    status: 503,
    error: "Back-office indisponible : SUPABASE_SERVICE_ROLE_KEY manquante",
  },
  /**
   * ⚠️ 401 et 403 disent deux choses différentes, et les confondre trompe
   * l'appelant : 401 = « identifiez-vous » (se connecter peut aider), 403 =
   * « c'est identifié, mais ce compte n'a pas le droit » (se reconnecter n'y
   * changera rien).
   */
  anonymous: { status: 401, error: "Non autorisé : session manquante" },
  forbidden: {
    status: 403,
    error: "Accès refusé : privilèges administrateur requis",
  },
};

export function adminRefusal(state: AdminRefusal): {
  status: number;
  error: string;
} {
  return ADMIN_REFUSALS[state];
}
