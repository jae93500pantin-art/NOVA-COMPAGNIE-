/** Shared input validation & sanitisation for the live-chat API. */

export const ROOM_RE = /^[a-zA-Z0-9_-]{1,40}$/;
export const MAX_MESSAGE_LEN = 2000;
export const MAX_NAME_LEN = 40;
/** Hard cap on the raw request body to mitigate DoS via huge payloads. */
export const MAX_BODY_BYTES = 8 * 1024; // 8 KB

export function isValidRoom(room: string): boolean {
  return ROOM_RE.test(room);
}

/** Collapse whitespace, strip control chars, clamp length. */
export function sanitizeText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

/** Where a password-recovery link lands once its code has been exchanged. */
export const RECOVERY_PATH = "/auth/nouveau-mot-de-passe";

/**
 * Sanitise a post-login return path (OAuth `?next=`).
 * Only same-origin relative paths are allowed — anything else (absolute URL,
 * protocol-relative `//host`, backslash trick) falls back to `/compte`.
 * Auth pages redirect to `/compte` too, so nobody lands back on the login form.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) return "/compte";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/compte";
  // Sole exception to the "never return to /auth/*" rule: the password-recovery
  // link legitimately has to land on the form that sets the new password, and
  // it can only be reached with a valid recovery session.
  if (raw === RECOVERY_PATH) return raw;
  if (raw.startsWith("/auth/")) return "/compte";
  return raw;
}

/**
 * Lightweight in-memory sliding-window rate limiter (per process).
 * Good enough to blunt floods on a single-node demo; for multi-node prod,
 * back this with Redis / a managed gateway.
 */
interface Bucket {
  count: number;
  resetAt: number;
}
const globalForRL = globalThis as unknown as { __rl?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = globalForRL.__rl ?? new Map();
if (!globalForRL.__rl) globalForRL.__rl = buckets;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, retryAfter: 0 };
}

