"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { dictionaries, type Lang } from "./dictionaries";

const STORAGE_KEY = "lumecar_lang";
const EVENT = "lumecar:lang";

type I18nValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a dot-separated key (e.g. "nav.login"). Falls back to FR, then the key. */
  t: (key: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function detectBrowserLang(): Lang {
  if (typeof navigator === "undefined") return "fr";
  const langs = [navigator.language, ...(navigator.languages || [])];
  for (const l of langs) {
    if (l?.toLowerCase().startsWith("en")) return "en";
    if (l?.toLowerCase().startsWith("fr")) return "fr";
  }
  return "fr";
}

function lookup(lang: Lang, key: string): string {
  const fromLang = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as object)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dictionaries[lang]);
  if (typeof fromLang === "string") return fromLang;

  // Fallback to French.
  const fromFr = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as object)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dictionaries.fr);
  if (typeof fromFr === "string") return fromFr;

  return key;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Start with FR for deterministic SSR; correct on mount from storage/browser.
  const [lang, setLangState] = useState<Lang>("fr");

  useEffect(() => {
    let initial: Lang | null = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "fr" || stored === "en") initial = stored;
    } catch {
      /* ignore */
    }
    const next = initial ?? detectBrowserLang();
    setLangState(next);
    document.documentElement.lang = next;

    const onLang = (e: Event) => {
      const detail = (e as CustomEvent<Lang>).detail;
      if (detail === "fr" || detail === "en") {
        setLangState(detail);
        document.documentElement.lang = detail;
      }
    };
    window.addEventListener(EVENT, onLang);
    return () => window.removeEventListener(EVENT, onLang);
  }, []);

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
    setLangState(l);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: l }));
  }, []);

  const t = useCallback((key: string) => lookup(lang, key), [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback if used outside the provider (e.g. isolated tests).
    return {
      lang: "fr",
      setLang: () => {},
      t: (key: string) => lookup("fr", key),
    };
  }
  return ctx;
}

export type { Lang };
