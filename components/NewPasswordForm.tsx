"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Loader2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { passwordError, type FieldErrors } from "@/lib/authValidation";
import { IconInput } from "./AuthForm";

/**
 * Step 2 of password recovery: set the new password.
 *
 * Reached from the e-mail link, which /auth/callback has already exchanged for
 * a session cookie — so this form needs no token of its own. The server route
 * re-checks that the session exists and re-applies the password policy.
 */
export function NewPasswordForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const invalid = passwordError(password);
    if (invalid) {
      setFieldErrors({ password: invalid });
      return;
    }
    if (password !== confirm) {
      setFieldErrors({ password: "auth.errors.passwordMismatch" });
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fieldErrors?: FieldErrors;
      };
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        else setError(t(data.error ?? "auth.errorGeneric"));
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError(t("auth.errors.network"));
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
        <h1 className="mt-4 text-2xl font-semibold text-white">
          {t("auth.newPasswordDone")}
        </h1>
        <p className="mt-2 text-white/60">{t("auth.newPasswordDoneBody")}</p>
        <Link href="/compte" className="btn-primary mt-6">
          {t("auth.goToAccount")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-white">
        {t("auth.newPasswordTitle")}
      </h1>
      <p className="mt-2 text-white/55">{t("auth.newPasswordSubtitle")}</p>

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div>
          <IconInput
            icon={<Lock className="h-4 w-4" />}
            type="password"
            autoComplete="new-password"
            placeholder={t("auth.newPasswordField")}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors({});
            }}
            invalid={!!fieldErrors.password}
          />
          {fieldErrors.password ? (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-300">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {t(fieldErrors.password)}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-white/40">{t("auth.passwordHint")}</p>
          )}
        </div>

        <IconInput
          icon={<Lock className="h-4 w-4" />}
          type="password"
          autoComplete="new-password"
          placeholder={t("auth.newPasswordConfirm")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error && (
          <p className="flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("auth.newPasswordSubmit")}
        </button>
      </form>
    </div>
  );
}
