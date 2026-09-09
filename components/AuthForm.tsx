"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  CarFront,
  Mail,
  Lock,
  UserCircle,
  Phone,
  CheckCircle2,
  MailCheck,
  ArrowRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/config";
import { matchDemoAccount } from "@/lib/demoAccounts";
import { notifyAuthChange, setDemoSession } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  emailError,
  nameError,
  passwordError,
  phoneError,
  type AuthField,
  type FieldErrors,
} from "@/lib/authValidation";

type Role = "client" | "driver";
type Mode = "login" | "register";
/** What the success screen should say once the form has been submitted. */
type Outcome = "login" | "register" | "confirm";

export function AuthForm({
  mode,
  embedded = false,
  onSuccess,
  onSwitchMode,
}: {
  mode: Mode;
  /** Rendered inside the auth modal: no page title, no redirect on success. */
  embedded?: boolean;
  onSuccess?: () => void;
  onSwitchMode?: (mode: Mode) => void;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const { t } = useI18n();
  const initialRole = (params.get("role") as Role) === "driver" ? "driver" : "client";
  const [role, setRole] = useState<Role>(initialRole);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [loading, setLoading] = useState(false);
  // Affiché quand /auth/callback renvoie ici après un lien de récupération
  // invalide ou expiré (les fournisseurs externes ont été retirés).
  const [error, setError] = useState<string | null>(params.get("auth_error"));
  /** Per-field messages, rendered under the input they belong to. */
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [fields, setFields] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });

  const isRegister = mode === "register";

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((f) => ({ ...f, [key]: e.target.value }));
    // Clear the error as soon as the visitor starts fixing the field; nagging
    // while someone types is the fastest way to make a form feel hostile.
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  /**
   * Same rules as the server (`lib/authValidation`), run locally so mistakes
   * are caught before a round-trip. The server re-checks regardless.
   */
  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (isRegister) {
      const first = nameError(fields.firstName, "firstName");
      if (first) next.firstName = first;
      const last = nameError(fields.lastName, "lastName");
      if (last) next.lastName = last;
      const tel = phoneError(fields.phone);
      if (tel) next.phone = tel;
      const pwd = passwordError(fields.password);
      if (pwd) next.password = pwd;
    } else if (!fields.password) {
      next.password = "auth.errors.passwordRequired";
    }
    // In demo mode the login field accepts a username ("test"), so only the
    // real-auth path requires a well-formed address.
    if (isRegister || isSupabaseConfigured) {
      const mail = emailError(fields.email);
      if (mail) next.email = mail;
    } else if (!fields.email) {
      next.email = "auth.errors.emailRequired";
    }
    return next;
  };

  /** Validate one field when it loses focus. */
  const blur = (key: AuthField) => () => {
    // Don't scold a field the visitor merely tabbed through.
    if (!fields[key as keyof typeof fields]) return;
    const next = validate();
    setFieldErrors((prev) => ({ ...prev, [key]: next[key] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const invalid = validate();
    if (Object.keys(invalid).length > 0) {
      setFieldErrors(invalid);
      return;
    }
    setFieldErrors({});

    // ── Demo mode: no Supabase keys, session lives in localStorage ──────────
    if (!isSupabaseConfigured) {
      setLoading(true);
      if (isRegister) {
        // Registration is simulated — there is no database to write to.
        setTimeout(() => {
          setLoading(false);
          setOutcome("register");
        }, 600);
        return;
      }
      setTimeout(() => {
        const account = matchDemoAccount(fields.email, fields.password);
        setLoading(false);
        if (!account) {
          setError(t("auth.errors.badCredentials"));
          return;
        }
        setDemoSession({
          username: account.username,
          role: account.role,
          firstName: account.firstName,
          lastName: account.lastName,
          driverId: account.driverId ?? null,
          email: account.email || undefined,
        });
        setRole(account.role);
        setOutcome("login");
        // In the modal we stay on the current page; otherwise land in the account space.
        setTimeout(() => (embedded ? onSuccess?.() : router.push("/compte")), 900);
      }, 600);
      return;
    }

    // ── Real auth: our API routes validate, rate-limit and set the cookie ───
    setLoading(true);
    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister
            ? { ...fields, role }
            : {
                email: fields.email,
                password: fields.password,
                next: params.get("next"),
              }
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        fieldErrors?: FieldErrors;
        needsEmailConfirmation?: boolean;
        redirectTo?: string;
      };

      if (!res.ok) {
        // The API answers with i18n keys, never with raw Supabase sentences.
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        else setError(t(data.error ?? "auth.errorGeneric"));
        return;
      }

      if (isRegister) {
        // With e-mail confirmation enabled, signUp opens no session: telling the
        // visitor they are logged in would be a lie.
        setOutcome(data.needsEmailConfirmation ? "confirm" : "register");
        if (!data.needsEmailConfirmation) {
          notifyAuthChange(); // navbar swaps to the account dropdown
          router.refresh(); // let Server Components see the new cookie
        }
        return;
      }

      setOutcome("login");
      notifyAuthChange();
      router.refresh();
      setTimeout(
        () => (embedded ? onSuccess?.() : router.push(data.redirectTo ?? "/compte")),
        900
      );
    } catch {
      setError(t("auth.errors.network"));
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------------------------------------------------------- */

  if (outcome === "confirm") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <MailCheck className="mx-auto h-14 w-14 text-royal-300" />
        <h2 className="mt-4 text-2xl font-semibold text-white">
          {t("auth.checkInbox")}
        </h2>
        <p className="mt-2 text-white/60">
          {t("auth.checkInboxBody").replace("{email}", fields.email)}
        </p>
      </motion.div>
    );
  }

  if (outcome) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
        <h2 className="mt-4 text-2xl font-semibold text-white">
          {outcome === "register" ? t("auth.doneRegister") : t("auth.doneLogin")}
        </h2>
        <p className="mt-2 text-white/60">
          {role === "driver" ? t("auth.welcomeDriver") : t("auth.welcomeClient")}
        </p>
        <Link href="/compte" className="btn-primary mt-6">
          {t("auth.goToAccount")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.div>
    );
  }

  return (
    <div>
      {/* The modal renders its own header. */}
      {!embedded && (
        <>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {isRegister ? t("auth.titleRegister") : t("auth.titleLogin")}
          </h1>
          <p className="mt-2 text-white/55">
            {isRegister ? t("auth.subtitleRegister") : t("auth.subtitleLogin")}
          </p>
        </>
      )}

      {!isSupabaseConfigured && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-300">
          <AlertCircle className="h-3 w-3" />
          {t("auth.demoBadge")}
        </p>
      )}

      {!isSupabaseConfigured && !isRegister && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/55">
          <p className="font-medium text-white/70">{t("auth.demoAccounts")}</p>
          <p className="mt-1">
            {t("auth.demoClient")} — <span className="font-mono text-royal-300">test</span> /{" "}
            <span className="font-mono text-royal-300">test</span>
          </p>
          <p>
            {t("auth.demoDriver")} — <span className="font-mono text-royal-300">driver</span> /{" "}
            <span className="font-mono text-royal-300">driver</span>
          </p>
        </div>
      )}

      {/* Role switch */}
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.03] p-1.5">
        <RoleTab
          active={role === "client"}
          onClick={() => setRole("client")}
          icon={<User className="h-4 w-4" />}
          label={t("auth.roleClient")}
        />
        <RoleTab
          active={role === "driver"}
          onClick={() => setRole("driver")}
          icon={<CarFront className="h-4 w-4" />}
          label={t("auth.roleDriver")}
        />
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <AnimatePresence mode="popLayout">
          {isRegister && (
            <motion.div
              key="names"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-2 gap-3 overflow-hidden"
            >
              <Field error={fieldErrors.firstName} t={t}>
                <IconInput
                  icon={<UserCircle className="h-4 w-4" />}
                  placeholder={t("auth.firstName")}
                  value={fields.firstName}
                  onChange={set("firstName")}
                  onBlur={blur("firstName")}
                  invalid={!!fieldErrors.firstName}
                  autoComplete="given-name"
                />
              </Field>
              <Field error={fieldErrors.lastName} t={t}>
                <IconInput
                  icon={<UserCircle className="h-4 w-4" />}
                  placeholder={t("auth.lastName")}
                  value={fields.lastName}
                  onChange={set("lastName")}
                  onBlur={blur("lastName")}
                  invalid={!!fieldErrors.lastName}
                  autoComplete="family-name"
                />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>

        <Field error={fieldErrors.email} t={t}>
          <IconInput
            icon={<Mail className="h-4 w-4" />}
            // Demo mode signs in with a username; real auth needs an address.
            type={isRegister || isSupabaseConfigured ? "email" : "text"}
            placeholder={
              isRegister || isSupabaseConfigured ? t("auth.email") : t("auth.idOrEmail")
            }
            value={fields.email}
            onChange={set("email")}
            onBlur={blur("email")}
            invalid={!!fieldErrors.email}
            autoComplete={isRegister ? "email" : "username"}
            inputMode={isRegister || isSupabaseConfigured ? "email" : "text"}
          />
        </Field>

        {isRegister && (
          <Field error={fieldErrors.phone} t={t}>
            <IconInput
              icon={<Phone className="h-4 w-4" />}
              type="tel"
              placeholder={t("auth.phone")}
              value={fields.phone}
              onChange={set("phone")}
              onBlur={blur("phone")}
              invalid={!!fieldErrors.phone}
              autoComplete="tel"
              inputMode="tel"
              required={false}
            />
          </Field>
        )}

        <Field
          error={fieldErrors.password}
          hint={isRegister ? t("auth.passwordHint") : undefined}
          t={t}
        >
          <IconInput
            icon={<Lock className="h-4 w-4" />}
            type="password"
            placeholder={t("auth.password")}
            value={fields.password}
            onChange={set("password")}
            onBlur={blur("password")}
            invalid={!!fieldErrors.password}
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </Field>

        {!isRegister && (
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-white/60">
              <input type="checkbox" className="accent-royal-500" /> {t("auth.remember")}
            </label>
            <Link
              href="/auth/mot-de-passe-oublie"
              className="text-royal-300 hover:underline"
            >
              {t("auth.forgot")}
            </Link>
          </div>
        )}

        {error && (
          <p className="flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isRegister
            ? role === "driver"
              ? t("auth.submitDriver")
              : t("auth.submitRegister")
            : t("auth.submitLogin")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        {isRegister ? t("auth.alreadyAccount") : t("auth.noAccount")}{" "}
        {embedded && onSwitchMode ? (
          // Inside the modal, switch form instead of navigating away.
          <button
            type="button"
            onClick={() => onSwitchMode(isRegister ? "login" : "register")}
            className="font-medium text-royal-300 hover:underline"
          >
            {isRegister ? t("auth.login") : t("auth.register")}
          </button>
        ) : (
          <Link
            href={isRegister ? "/auth/login" : "/auth/register"}
            className="font-medium text-royal-300 hover:underline"
          >
            {isRegister ? t("auth.login") : t("auth.register")}
          </Link>
        )}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Wraps an input with its error message (or its hint when there is none). */
function Field({
  error,
  hint,
  t,
  children,
}: {
  error?: string;
  hint?: string;
  t: (key: string) => string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-red-300">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {t(error)}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-white/40">{hint}</p>
      ) : null}
    </div>
  );
}

function RoleTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition",
        active ? "text-white" : "text-white/50 hover:text-white/80"
      )}
    >
      {active && (
        <motion.span
          layoutId="role-pill"
          className="absolute inset-0 rounded-xl bg-royal-500 shadow-glow"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <span className="relative flex items-center gap-2">
        {icon}
        {label}
      </span>
    </button>
  );
}

export function IconInput({
  icon,
  invalid,
  ...props
}: {
  icon: React.ReactNode;
  invalid?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">
        {icon}
      </span>
      <input
        className={cn("input pl-10", invalid && "border-red-400/40 focus:border-red-400/60")}
        aria-invalid={invalid || undefined}
        required
        {...props}
      />
    </div>
  );
}
