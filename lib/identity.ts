/**
 * Identity helpers — normalise the user metadata returned by auth providers.
 *
 * E-mail/password sign-ups store `first_name` / `last_name` themselves, while
 * Google (OpenID Connect) returns `given_name` / `family_name` / `name` /
 * `full_name` and the avatar under `avatar_url` or `picture`.
 */

export interface ProviderMetadata {
  [key: string]: unknown;
}

const str = (meta: ProviderMetadata, key: string): string =>
  typeof meta[key] === "string" ? (meta[key] as string).trim() : "";

/** Split a display name into first/last, keeping compound family names intact. */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** First/last name from provider metadata, whichever convention it uses. */
export function nameFromMetadata(meta: ProviderMetadata | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const m = meta ?? {};
  const firstName = str(m, "first_name") || str(m, "given_name");
  const lastName = str(m, "last_name") || str(m, "family_name");
  if (firstName || lastName) return { firstName, lastName };
  return splitFullName(str(m, "full_name") || str(m, "name"));
}

/** Profile picture URL from provider metadata (Google sends both keys). */
export function avatarFromMetadata(
  meta: ProviderMetadata | null | undefined
): string | undefined {
  const m = meta ?? {};
  const url = str(m, "avatar_url") || str(m, "picture");
  return url.startsWith("https://") ? url : undefined;
}
