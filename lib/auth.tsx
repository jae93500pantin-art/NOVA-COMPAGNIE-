"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getSupabaseBrowser } from "./supabase/client";
import { isSupabaseConfigured } from "./config";
import { avatarFromMetadata, nameFromMetadata } from "./identity";

export type SessionRole = "client" | "driver";

export interface SessionUser {
  /**
   * Id du compte Supabase. C'est cette valeur que le serveur écrit dans
   * `booking.clientId` : sans elle, le navigateur filtrerait ses réservations
   * sur l'id local de `clientBookings` et n'en verrait plus aucune.
   * Absent en mode démo, où ce compte n'existe pas.
   */
  id?: string;
  username: string;
  role: SessionRole;
  firstName: string;
  lastName: string;
  /** Linked public driver profile id (driver accounts only). */
  driverId: string | null;
  email?: string;
  phone?: string;
  /** Provider profile picture (Google), when available. */
  avatarUrl?: string;
}

const STORAGE_KEY = "lumecar_demo_session";
const EVENT = "lumecar:auth";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<SessionUser>) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
  updateProfile: () => {},
});

/** Read the demo session from localStorage (client only). */
function readDemoSession(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

/** Persist a demo session and notify the app. */
export function setDemoSession(user: SessionUser) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearDemoSession() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Tell the app to re-read the session.
 *
 * Needed after `/api/auth/login` or `/api/auth/register`: the route handler
 * sets the cookie server-side, so the provider has no way of noticing on its
 * own and the navbar would keep showing "Connexion" until a full reload.
 */
export function notifyAuthChange() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Demo mode: source of truth is localStorage.
    if (!isSupabaseConfigured) {
      setUser(readDemoSession());
      setLoading(false);
      return;
    }
    // Supabase mode: derive the session from the auth user + metadata.
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setUser(readDemoSession());
      setLoading(false);
      return;
    }
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser) {
      const meta = authUser.user_metadata ?? {};
      // Google returns given_name/family_name/name + picture instead of our own keys.
      const { firstName, lastName } = nameFromMetadata(meta);
      setUser({
        id: authUser.id,
        username: authUser.email ?? "",
        email: authUser.email ?? undefined,
        // Rôle marketplace uniquement. Le privilège `admin` vit dans
        // `profiles.role` et n'est lu que côté serveur (requireAdmin) : le
        // navigateur n'a aucune raison de le connaître, il n'autorise rien.
        role: (meta.role as SessionRole) ?? "client",
        firstName,
        lastName,
        driverId: (meta.driver_id as string) ?? null,
        avatarUrl: avatarFromMetadata(meta),
      });
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseBrowser();
      await supabase?.auth.signOut();
      // The browser client clears its own cookies, but the refresh token also
      // has to be revoked server-side — otherwise a cookie captured earlier
      // could still be redeemed for a fresh session.
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {
        /* best effort: the local session is already gone */
      });
    }
    clearDemoSession();
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    (patch: Partial<SessionUser>) => {
      setUser((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        // Persist the demo session so the change survives reloads.
        if (!isSupabaseConfigured) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            /* storage unavailable */
          }
        }
        return next;
      });
    },
    []
  );

  return (
    <AuthContext.Provider value={{ user, loading, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
