/**
 * Shared, pure validation for the authentication forms.
 *
 * The exact same module runs in the browser (live field errors) and in the
 * `/api/auth/*` route handlers (the authoritative check). The client can
 * therefore never be more permissive than the server — and the server never
 * trusts what the form claims to have validated.
 *
 * Errors are returned as **i18n keys** (`auth.errors.*`), not sentences, so a
 * server response stays language-agnostic and the UI renders it in the
 * visitor's language.
 */

export type AuthField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "password";

export type FieldErrors = Partial<Record<AuthField, string>>;

export const MAX_NAME_LEN = 60;
export const MIN_PASSWORD_LEN = 8;
/**
 * bcrypt only hashes the first 72 bytes; anything longer is silently truncated,
 * which would make two different passwords equivalent. Refuse instead.
 */
export const MAX_PASSWORD_LEN = 72;
export const MAX_EMAIL_LEN = 254; // RFC 5321

/** Pragmatic address check: one @, a dotted domain, no whitespace. */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
/**
 * Digits with the usual separators, optionally opening on `+` (international)
 * or `(` (parenthesised area code).
 */
const PHONE_RE = /^\+?[0-9(][0-9 ().-]{5,19}$/;

export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** Trim and collapse inner whitespace ("  Jean   Paul " → "Jean Paul"). */
export function normalizeName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
}

export function normalizePhone(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
}

/* -------------------------------------------------------------------------- */
/* Field rules                                                                 */
/* -------------------------------------------------------------------------- */

export function emailError(raw: unknown): string | null {
  const email = normalizeEmail(raw);
  if (!email) return "auth.errors.emailRequired";
  if (email.length > MAX_EMAIL_LEN) return "auth.errors.emailInvalid";
  if (!EMAIL_RE.test(email)) return "auth.errors.emailInvalid";
  return null;
}

/**
 * Registration password policy: length plus at least one letter and one digit.
 * Deliberately modest — an over-strict policy pushes people to reuse passwords.
 */
export function passwordError(raw: unknown): string | null {
  const password = typeof raw === "string" ? raw : "";
  if (!password) return "auth.errors.passwordRequired";
  if (password.length < MIN_PASSWORD_LEN) return "auth.errors.passwordTooShort";
  // Byte length, not character count: bcrypt's cap is on bytes, and an accented
  // or emoji password reaches 72 bytes well before 72 characters.
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LEN)
    return "auth.errors.passwordTooLong";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    return "auth.errors.passwordTooWeak";
  return null;
}

export function nameError(raw: unknown, field: "firstName" | "lastName"): string | null {
  const name = normalizeName(raw);
  if (!name) return `auth.errors.${field}Required`;
  if (name.length > MAX_NAME_LEN) return "auth.errors.nameTooLong";
  return null;
}

/** Phone is optional; when filled it must look like a phone number. */
export function phoneError(raw: unknown): string | null {
  const phone = normalizePhone(raw);
  if (!phone) return null;
  if (!PHONE_RE.test(phone)) return "auth.errors.phoneInvalid";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Form-level validation                                                       */
/* -------------------------------------------------------------------------- */

export interface RegistrationInput {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  password?: unknown;
  role?: unknown;
}

export interface RegistrationValue {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  role: "client" | "driver";
}

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors };

export function validateRegistration(
  input: RegistrationInput
): Validated<RegistrationValue> {
  const errors: FieldErrors = {};
  const firstName = nameError(input.firstName, "firstName");
  if (firstName) errors.firstName = firstName;
  const lastName = nameError(input.lastName, "lastName");
  if (lastName) errors.lastName = lastName;
  const email = emailError(input.email);
  if (email) errors.email = email;
  const phone = phoneError(input.phone);
  if (phone) errors.phone = phone;
  const password = passwordError(input.password);
  if (password) errors.password = password;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      firstName: normalizeName(input.firstName),
      lastName: normalizeName(input.lastName),
      email: normalizeEmail(input.email),
      phone: normalizePhone(input.phone),
      password: input.password as string,
      // Only the two public roles can be self-assigned; `admin` is granted in
      // the database, never by a signup payload.
      role: input.role === "driver" ? "driver" : "client",
    },
  };
}

export interface LoginValue {
  email: string;
  password: string;
}

/**
 * Login is checked more loosely than registration on purpose: an account
 * created under an older policy must still be able to sign in, so we only
 * require a well-formed address and a non-empty password.
 */
export function validateLogin(input: {
  email?: unknown;
  password?: unknown;
}): Validated<LoginValue> {
  const errors: FieldErrors = {};
  const email = emailError(input.email);
  if (email) errors.email = email;
  if (typeof input.password !== "string" || input.password.length === 0)
    errors.password = "auth.errors.passwordRequired";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      email: normalizeEmail(input.email),
      password: input.password as string,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Supabase error mapping                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Turn a raw Supabase Auth error into one of our i18n keys.
 *
 * Two reasons never to surface the raw message: it is English-only, and it
 * leaks implementation detail. Anything unrecognised collapses to a generic
 * key rather than being echoed back.
 */
export function mapAuthError(raw: string | null | undefined): string {
  const message = (raw ?? "").toLowerCase();
  if (!message) return "auth.errorGeneric";
  if (message.includes("invalid login credentials"))
    return "auth.errors.badCredentials";
  if (message.includes("email not confirmed"))
    return "auth.errors.emailNotConfirmed";
  if (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already exists")
  )
    return "auth.errors.emailTaken";
  if (message.includes("password should be at least"))
    return "auth.errors.passwordTooShort";
  if (message.includes("weak password")) return "auth.errors.passwordTooWeak";
  if (message.includes("rate limit") || message.includes("too many"))
    return "auth.errors.rateLimited";
  if (message.includes("email address") && message.includes("invalid"))
    return "auth.errors.emailInvalid";
  if (message.includes("otp") || message.includes("token has expired"))
    return "auth.errors.linkExpired";
  return "auth.errorGeneric";
}
