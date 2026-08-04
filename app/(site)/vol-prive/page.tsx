"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowLeft, CheckCircle2, Mail, PlaneTakeoff, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { dur, ease } from "@/lib/motion";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function VolPrivePage() {
  const { t } = useI18n();
  const reduced = useReducedMotion();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError(t("jet.errorEmail"));
      return;
    }
    // Demo mode: no waiting-list backend wired yet — simulate the signup.
    setSendState("sending");
    await new Promise((r) => setTimeout(r, 900));
    setSendState("sent");
  };

  const statusText = t("jet.status");
  const letters = Array.from(statusText);

  const container: Variants = {
    initial: {},
    animate: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
  };
  const item: Variants = {
    initial: { opacity: 0, y: reduced ? 0 : 16 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: dur.base, ease },
    },
  };

  return (
    <section className="relative flex min-h-screen-dvh items-center justify-center overflow-hidden px-5 pb-20 pt-32">
      {/* Ambient champagne glow behind the composition */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-royal-500/10 blur-[120px]"
      />

      <motion.div
        variants={container}
        initial="initial"
        animate="animate"
        className="relative flex w-full max-w-xl flex-col items-center text-center"
      >
        {/* Plane badge with orbiting rings */}
        <motion.div variants={item} className="relative mb-10">
          {!reduced && (
            <>
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full border border-royal-400/25"
                animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full border border-royal-400/25"
                animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
                transition={{
                  duration: 2.6,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: 1.3,
                }}
              />
            </>
          )}
          <motion.div
            className="relative grid h-20 w-20 place-items-center rounded-full glass-strong shadow-glow"
            animate={reduced ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <PlaneTakeoff className="h-8 w-8 text-royal-300" />
          </motion.div>
        </motion.div>

        <motion.span variants={item} className="section-eyebrow">
          {t("jet.eyebrow")}
        </motion.span>

        {/* "EN COURS" — letter-by-letter reveal */}
        <h1 className="mt-6 text-5xl font-semibold tracking-[0.12em] text-gradient-royal sm:text-6xl">
          <span className="sr-only">{statusText}</span>
          <span aria-hidden className="inline-flex flex-wrap justify-center">
            {letters.map((char, i) => (
              <motion.span
                key={`${char}-${i}`}
                initial={{ opacity: 0, y: reduced ? 0 : 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: dur.slow, ease, delay: 0.3 + i * 0.05 }}
                className={char === " " ? "w-4" : undefined}
              >
                {char === " " ? " " : char}
              </motion.span>
            ))}
          </span>
        </h1>

        <motion.p variants={item} className="mt-5 text-lg font-medium text-white">
          {t("jet.title")}
        </motion.p>

        <motion.p
          variants={item}
          className="mt-3 max-w-md text-sm leading-relaxed text-white/55"
        >
          {t("jet.subtitle")}
        </motion.p>

        {/* Indeterminate progress bar */}
        <motion.div variants={item} className="mt-10 w-full max-w-xs">
          <div className="relative h-1 overflow-hidden rounded-full bg-white/10">
            <motion.span
              className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-royal-300 to-transparent"
              animate={reduced ? { x: "100%" } : { x: ["-100%", "300%"] }}
              transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-white/35">
            {t("jet.progress")}
          </p>
        </motion.div>

        {/* Waiting-list email capture */}
        <motion.div
          variants={item}
          className="mt-10 w-full max-w-md rounded-3xl glass p-6 text-left"
        >
          <AnimatePresence mode="wait" initial={false}>
            {sendState === "sent" ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: dur.base, ease }}
                className="flex flex-col items-center py-2 text-center"
              >
                <motion.span
                  initial={{ scale: reduced ? 1 : 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                  className="grid h-14 w-14 place-items-center rounded-full bg-green-500/15 text-green-400"
                >
                  <CheckCircle2 className="h-7 w-7" />
                </motion.span>
                <h2 className="mt-4 text-lg font-semibold text-white">
                  {t("jet.successTitle")}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  {t("jet.successText")}
                </p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: dur.fast }}
                onSubmit={submit}
                noValidate
              >
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
                    <Mail className="h-3 w-3" />
                    {t("jet.formTitle")}
                  </span>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      className="input flex-1"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("jet.emailPlaceholder")}
                      autoComplete="email"
                      aria-invalid={Boolean(error)}
                    />
                    <button
                      type="submit"
                      disabled={sendState === "sending"}
                      className="btn-primary shrink-0 text-sm disabled:opacity-60"
                    >
                      {sendState === "sending" ? (
                        t("jet.sending")
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          {t("jet.notify")}
                        </>
                      )}
                    </button>
                  </div>
                </label>

                {error ? (
                  <p className="mt-2 text-sm text-red-300">{error}</p>
                ) : (
                  <p className="mt-2 text-xs text-white/35">{t("jet.privacy")}</p>
                )}
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div variants={item} className="mt-8">
          <Link href="/" className="btn-ghost text-sm">
            <ArrowLeft className="h-4 w-4" /> {t("jet.back")}
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}
