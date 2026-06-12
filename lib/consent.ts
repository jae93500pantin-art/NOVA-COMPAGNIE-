"use client";

/**
 * Minimal, GDPR-aligned consent management (client-side).
 *
 * - No non-essential cookies/trackers run before explicit opt-in.
 * - Consent is stored locally with a version + timestamp (proof of consent).
 * - Users can change their choice at any time via the data-rights centre.
 */

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export interface ConsentState {
  version: number;
  date: string;
  necessary: true; // always on — required for the service to work
  analytics: boolean;
  marketing: boolean;
}

export const CONSENT_VERSION = 1;
const KEY = "lumecar_consent";

export function getConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConsent(choice: {
  analytics: boolean;
  marketing: boolean;
}): ConsentState {
  const state: ConsentState = {
    version: CONSENT_VERSION,
    date: new Date().toISOString(),
    necessary: true,
    analytics: choice.analytics,
    marketing: choice.marketing,
  };
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("lumecar:consent", { detail: state }));
  return state;
}

export function clearConsent() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("lumecar:consent", { detail: null }));
}
