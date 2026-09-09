"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Loader2, AlertCircle, MailCheck } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/config";
import { useI18n } from "@/lib/i18n";
import { emailError, type FieldErrors } from "@/lib/authValidation";
import { IconInput } from "./AuthForm";

/**
 * Step 1 of password recovery: ask for the address.
 *
 * The screen never reveals whether the account exists — it always ends on the
 * same "if an account exists, you'll get an e-mail" confirmation.
 */
export function PasswordResetForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const invalid = emailError(email);
    if (invalid) {
      setFieldErrors({ email: invalid });
      return;
    }
    setFieldErrors({});

    if (!isSupabaseConfigured) {
      setError(t("auth.errors.unconfigured"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
      setSent(true);
    } catch {
      setError(t("auth.errors.network"));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <MailCheck className="mx-auto h-14 w-14 text-royal-300" />
        <h1 className="mt-4 text-2xl font-semibold text-white">{t("auth.resetSent")}</h1>
        <p className="mt-2 text-white/60">{t("auth.resetSentBody")}</p>
        <Link href="/auth/login" className="mt-6 inline-block text-sm text-royal-300 hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </motion.div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-white">
        {t("auth.resetTitle")}
      </h1>
      <p className="mt-2 text-white/55">{t("auth.resetSubtitle")}</p>

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div>
          <IconInput
            icon={<Mail className="h-4 w-4" />}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t("auth.email")}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors({});
            }}
            invalid={!!fieldErrors.email}
          />
          {fieldErrors.email && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-300">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {t(fieldErrors.email)}
            </p>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("auth.resetSubmit")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/auth/login" className="text-royal-300 hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
