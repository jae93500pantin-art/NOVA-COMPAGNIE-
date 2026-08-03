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
  ArrowRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/config";
import { matchDemoAccount } from "@/lib/demoAccounts";
import { setDemoSession } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { GoogleButton } from "./GoogleButton";

type Role = "client" | "driver";
type Mode = "login" | "register";

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
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  // Surfaced when /auth/callback bounces back after a failed OAuth round-trip.
  const [error, setError] = useState<string | null>(params.get("auth_error"));
  const [fields, setFields] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });

  const isRegister = mode === "register";
  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Demo mode: no Supabase keys configured.
    if (!isSupabaseConfigured) {
      setLoading(true);
      // Registration is simulated; login is validated against demo accounts.
      if (isRegister) {
        setTimeout(() => {
          setLoading(false);
          setDone(true);
        }, 600);
        return;
      }
      setTimeout(() => {
        const account = matchDemoAccount(fields.email, fields.password);
        setLoading(false);
        if (!account) {
          setError(t("auth.errorCredentials"));
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
        setDone(true);
        // In the modal we stay on the current page; otherwise land in the account space.
        setTimeout(() => (embedded ? onSuccess?.() : router.push("/compte")), 900);
      }, 600);
      return;
    }

    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    setLoading(true);
    try {
      if (isRegister) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: fields.email,
          password: fields.password,
          options: {
            data: {
              role,
              first_name: fields.firstName,
              last_name: fields.lastName,
              phone: fields.phone,
            },
          },
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: fields.email,
          password: fields.password,
        });
        if (signInError) throw signInError;
      }
      setDone(true);
      if (embedded && !isRegister) setTimeout(() => onSuccess?.(), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
        <h2 className="mt-4 text-2xl font-semibold text-white">
          {isRegister ? t("auth.doneRegister") : t("auth.doneLogin")}
        </h2>
        <p className="mt-2 text-white/60">
          {role === "driver"
            ? t("auth.welcomeDriver")
            : t("auth.welcomeClient")}
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
            {isRegister
              ? t("auth.subtitleRegister")
              : t("auth.subtitleLogin")}
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

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <AnimatePresence mode="popLayout">
          {isRegister && (
            <motion.div
              key="names"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-2 gap-3 overflow-hidden"
            >
              <IconInput
                icon={<UserCircle className="h-4 w-4" />}
                placeholder={t("auth.firstName")}
                value={fields.firstName}
                onChange={set("firstName")}
                autoComplete="given-name"
              />
              <IconInput
                icon={<UserCircle className="h-4 w-4" />}
                placeholder={t("auth.lastName")}
                value={fields.lastName}
                onChange={set("lastName")}
                autoComplete="family-name"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <IconInput
          icon={<Mail className="h-4 w-4" />}
          type={isRegister ? "email" : "text"}
          placeholder={isRegister ? t("auth.email") : t("auth.idOrEmail")}
          value={fields.email}
          onChange={set("email")}
          autoComplete={isRegister ? "email" : "username"}
          inputMode={isRegister ? "email" : "text"}
        />

        {isRegister && (
          <IconInput
            icon={<Phone className="h-4 w-4" />}
            type="tel"
            placeholder={t("auth.phone")}
            value={fields.phone}
            onChange={set("phone")}
            autoComplete="tel"
            inputMode="tel"
          />
        )}

        <IconInput
          icon={<Lock className="h-4 w-4" />}
          type="password"
          placeholder={t("auth.password")}
          value={fields.password}
          onChange={set("password")}
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={isRegister ? 8 : undefined}
        />

        {!isRegister && (
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-white/60">
              <input type="checkbox" className="accent-royal-500" /> {t("auth.remember")}
            </label>
            <a href="#" className="text-royal-300 hover:underline">
              {t("auth.forgot")}
            </a>
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

      <div className="my-6 flex items-center gap-3 text-xs text-white/30">
        <span className="h-px flex-1 bg-white/10" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <GoogleButton onError={setError} disabled={loading} />
        <button type="button" className="btn-ghost text-sm">
          Apple
        </button>
      </div>

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

function IconInput({
  icon,
  ...props
}: { icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">
        {icon}
      </span>
      <input className="input pl-10" required {...props} />
    </div>
  );
}
