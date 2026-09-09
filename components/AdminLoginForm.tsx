"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { isSupabaseConfigured } from "@/lib/config";
import { emailError, type FieldErrors } from "@/lib/authValidation";
import { notifyAuthChange } from "@/lib/auth";

/**
 * Entrée dédiée du back-office.
 *
 * Il n'y a qu'un seul système d'authentification : ce formulaire poste sur la
 * même route `/api/auth/login` que la connexion publique. Ce qui change est ce
 * qu'on fait de la réponse — un compte sans le rôle `admin` est refusé ici,
 * avec un message explicite, plutôt que d'être silencieusement renvoyé vers
 * l'accueil comme le faisait `/admin`.
 *
 * Ce refus n'est qu'un confort d'interface : `/admin` et chaque route
 * `/api/admin/*` revérifient le rôle côté serveur avec `requireAdmin()`.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // `?error=forbidden` : la console a rejeté une session déjà ouverte.
  const [error, setError] = useState<string | null>(
    params.get("error") === "forbidden" ? t("admin.notAuthorized") : null
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const invalid: FieldErrors = {};
    const mail = emailError(email);
    if (mail) invalid.email = mail;
    if (!password) invalid.password = "auth.errors.passwordRequired";
    if (Object.keys(invalid).length > 0) {
      setFieldErrors(invalid);
      return;
    }
    setFieldErrors({});

    if (!isSupabaseConfigured) {
      setError(t("auth.errors.unconfigured"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        role?: string;
        error?: string;
        fieldErrors?: FieldErrors;
      };

      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        else setError(t(data.error ?? "auth.errorGeneric"));
        return;
      }

      if (data.role !== "admin") {
        // Les identifiants sont bons, mais pas pour cette porte. On referme la
        // session ouverte à l'instant : entrer ici ne doit pas connecter au
        // site par effet de bord.
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        setError(t("admin.notAuthorized"));
        return;
      }

      notifyAuthChange();
      router.refresh();
      router.push("/admin");
    } catch {
      setError(t("auth.errors.network"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-sm"
    >
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-royal-400/25 bg-royal-400/10">
          <ShieldCheck className="h-5 w-5 text-royal-300" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">
          {t("admin.loginTitle")}
        </h1>
        <p className="mt-2 text-sm text-white/50">{t("admin.loginSubtitle")}</p>
      </div>

      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        <div>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              className="input pl-10"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("auth.email")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors({});
              }}
              aria-invalid={!!fieldErrors.email || undefined}
              required
            />
          </div>
          {fieldErrors.email && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-300">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {t(fieldErrors.email)}
            </p>
          )}
        </div>

        <div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              className="input pl-10"
              type="password"
              autoComplete="current-password"
              placeholder={t("auth.password")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors({});
              }}
              aria-invalid={!!fieldErrors.password || undefined}
              required
            />
          </div>
          {fieldErrors.password && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-red-300">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {t(fieldErrors.password)}
            </p>
          )}
        </div>

        {error && (
          <p className="flex items-start gap-1.5 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("admin.loginSubmit")}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-white/35">
        {t("admin.loginNotice")}
      </p>
      <p className="mt-3 text-center text-sm">
        <Link href="/" className="text-white/45 transition hover:text-white/70">
          {t("admin.backToSite")}
        </Link>
      </p>
    </motion.div>
  );
}
