"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  MessageCircle,
  Phone,
  Clock,
  Send,
  CheckCircle2,
  User,
  MessageSquare,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { WHATSAPP_NUMBER, WHATSAPP_DISPLAY } from "@/lib/whatsapp";

const REQUEST_TYPES = [
  "typeReservation",
  "typeTransfer",
  "typeDriver",
  "typeBusiness",
  "typeOther",
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_EMAIL = "contact@novacompagnie.com";

export function ContactForm() {
  const { t } = useI18n();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    type: "",
    message: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.type ||
      !form.message.trim()
    ) {
      setError(t("contact.errorRequired"));
      return;
    }
    if (!EMAIL_RE.test(form.email)) {
      setError(t("contact.errorEmail"));
      return;
    }

    // Demo mode: no email backend wired yet — simulate a successful send.
    setStatus("sending");
    await new Promise((r) => setTimeout(r, 900));
    setStatus("sent");
  };

  const reset = () => {
    setForm({ firstName: "", lastName: "", email: "", phone: "", type: "", message: "" });
    setStatus("idle");
    setError(null);
  };

  const info = [
    {
      icon: Mail,
      label: t("contact.infoEmailLabel"),
      value: CONTACT_EMAIL,
      href: `mailto:${CONTACT_EMAIL}`,
      accent: "default" as const,
    },
    {
      icon: MessageCircle,
      label: t("contact.infoWhatsappLabel"),
      value: WHATSAPP_DISPLAY,
      href: `https://wa.me/${WHATSAPP_NUMBER}`,
      accent: "whatsapp" as const,
    },
    {
      icon: Clock,
      label: t("contact.infoHoursLabel"),
      value: t("contact.infoHours"),
      accent: "default" as const,
    },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
      {/* Info panel */}
      <motion.aside
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl glass-strong p-8"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-royal-500/20 blur-[90px]" />
        <h2 className="relative text-xl font-semibold text-white">
          {t("contact.infoTitle")}
        </h2>
        <ul className="relative mt-6 space-y-5">
          {info.map((i) => {
            const isWa = i.accent === "whatsapp";
            const inner = (
              <>
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                    isWa
                      ? "bg-green-500/15 text-green-400"
                      : "bg-white/5 text-royal-300"
                  }`}
                >
                  <i.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-white/40">
                    {i.label}
                  </p>
                  <p className="text-sm font-medium text-white">{i.value}</p>
                </div>
              </>
            );
            return (
              <li key={i.label}>
                {i.href ? (
                  <a
                    href={i.href}
                    target={isWa ? "_blank" : undefined}
                    rel={isWa ? "noopener noreferrer" : undefined}
                    className="flex items-start gap-4 rounded-2xl -m-2 p-2 transition hover:bg-white/[0.04]"
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="flex items-start gap-4">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </motion.aside>

      {/* Form / success */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-3xl glass p-6 sm:p-8"
      >
        <AnimatePresence mode="wait">
          {status === "sent" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="flex min-h-[420px] flex-col items-center justify-center text-center"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                className="grid h-16 w-16 place-items-center rounded-full bg-green-500/15 text-green-400"
              >
                <CheckCircle2 className="h-8 w-8" />
              </motion.span>
              <h3 className="mt-6 text-2xl font-semibold text-white">
                {t("contact.successTitle")}
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/55">
                {t("contact.successText")}
              </p>
              <button onClick={reset} className="btn-ghost mt-8 text-sm">
                {t("contact.successAgain")}
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={submit}
              className="space-y-4"
            >
              <h2 className="text-xl font-semibold text-white">
                {t("contact.formTitle")}
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldLabel icon={User} label={t("contact.firstName")}>
                  <input
                    className="input"
                    value={form.firstName}
                    onChange={set("firstName")}
                    autoComplete="given-name"
                  />
                </FieldLabel>
                <FieldLabel label={t("contact.lastName")}>
                  <input
                    className="input"
                    value={form.lastName}
                    onChange={set("lastName")}
                    autoComplete="family-name"
                  />
                </FieldLabel>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldLabel icon={Mail} label={t("contact.email")}>
                  <input
                    type="email"
                    className="input"
                    value={form.email}
                    onChange={set("email")}
                    autoComplete="email"
                  />
                </FieldLabel>
                <FieldLabel icon={Phone} label={t("contact.phone")}>
                  <input
                    type="tel"
                    className="input"
                    value={form.phone}
                    onChange={set("phone")}
                    autoComplete="tel"
                  />
                </FieldLabel>
              </div>

              <FieldLabel label={t("contact.type")}>
                <select
                  className="input [&>option]:text-ink-900"
                  value={form.type}
                  onChange={set("type")}
                >
                  <option value="">{t("contact.typePlaceholder")}</option>
                  {REQUEST_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {t(`contact.${rt}`)}
                    </option>
                  ))}
                </select>
              </FieldLabel>

              <FieldLabel icon={MessageSquare} label={t("contact.message")}>
                <textarea
                  className="input min-h-[130px] resize-y"
                  value={form.message}
                  onChange={set("message")}
                  placeholder={t("contact.messagePlaceholder")}
                />
              </FieldLabel>

              {error && (
                <p className="text-sm text-red-300">{error}</p>
              )}

              <button
                type="submit"
                disabled={status === "sending"}
                className="btn-primary w-full disabled:opacity-60"
              >
                {status === "sending" ? (
                  t("contact.sending")
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {t("contact.submit")}
                  </>
                )}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function FieldLabel({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      {children}
    </label>
  );
}
