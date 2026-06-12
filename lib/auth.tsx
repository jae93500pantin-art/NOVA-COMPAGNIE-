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

export type SessionRole = "client" | "driver";

export interface SessionUser {
  username: string;
  role: SessionRole;
  firstName: string;
  lastName: string;
  /** Linked public driver profile id (driver accounts only). */
  driverId: string | null;
  email?: string;
  phone?: string;
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
      setUser({
        username: authUser.email ?? "",
        email: authUser.email ?? undefined,
        role: (meta.role as SessionRole) ?? "client",
        firstName: (meta.first_name as string) ?? "",
        lastName: (meta.last_name as string) ?? "",
        driverId: (meta.driver_id as string) ?? null,
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
