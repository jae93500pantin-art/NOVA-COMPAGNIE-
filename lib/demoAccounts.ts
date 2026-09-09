/**
 * Demo accounts for the no-Supabase prototype.
 *
 * These let you log in and explore the two roles without any backend.
 * In production (Supabase configured), real authentication is used instead
 * and these accounts are ignored.
 *
 * ⚠️ Demo only — plaintext credentials are acceptable here precisely because
 * there is no real data behind them. Never do this with real accounts.
 */

export type DemoRole = "client" | "driver";

export interface DemoAccount {
  username: string;
  password: string;
  role: DemoRole;
  firstName: string;
  lastName: string;
  /** Linked driver profile id (for driver accounts). */
  driverId?: string;
  /** Optional e-mail — set your own to receive booking emails in demo mode. */
  email?: string;
}

export const demoAccounts: DemoAccount[] = [
  {
    username: "test",
    password: "test",
    role: "client",
    firstName: "Jérémy",
    lastName: "Test",
    // Set this to your own address to receive booking emails in demo mode.
    email: "",
  },
  {
    username: "driver",
    password: "driver",
    role: "driver",
    firstName: "Compte",
    lastName: "Chauffeur",
    // ⚠️ Plus aucune fiche publique rattachée. Ce compte pointait vers
    // `jeremy-driver`, l'un des cinq profils inventés retirés de l'annuaire.
    // Sans fiche, le tableau de bord chauffeur n'a pas de salle de
    // réservations à écouter : c'est la conséquence assumée d'un annuaire qui
    // n'accueille plus que de vrais inscrits.
    driverId: undefined,
  },
];

/** Validate credentials against the demo accounts (case-insensitive username). */
export function matchDemoAccount(
  identifier: string,
  password: string
): DemoAccount | null {
  const id = identifier.trim().toLowerCase();
  return (
    demoAccounts.find(
      (a) => a.username.toLowerCase() === id && a.password === password
    ) ?? null
  );
}
