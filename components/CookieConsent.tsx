"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, ShieldCheck } from "lucide-react";
import { getConsent, saveConsent } from "@/lib/consent";
import { useI18n } from "@/lib/i18n";

export function CookieConsent() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [details, setDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    // Show only after mount (avoids hydration mismatch) and if no choice yet.
    if (!getConsent()) setVisible(true);
  }, []);

  const acceptAll = () => {
    saveConsent({ analytics: true, marketing: true });
    setVisible(false);
  };
  const rejectAll = () => {
    saveConsent({ analytics: false, marketing: false });
    setVisible(false);
  };
  const savePrefs = () => {
    saveConsent({ analytics, marketing });
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-2xl pb-safe sm:inset-x-4"
          role="dialog"
          aria-label={t("cookie.dialogLabel")}
        >
          <div className="rounded-3xl glass-strong p-5 shadow-card sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-royal-300">
                <Cookie className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-white">
                  {t("cookie.title")}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-white/55">
                  {t("cookie.body")}{" "}
                  <Link
                    href="/legal/cookies"
                    className="text-royal-300 underline-offset-2 hover:underline"
                  >
                    {t("cookie.more")}
                  </Link>
                </p>

                <AnimatePresence>
                  {details && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 space-y-2 overflow-hidden"
                    >
                      <ConsentRow
                        title={t("cookie.necessaryTitle")}
                        desc={t("cookie.necessaryDesc")}
                        checked
                        disabled
                      />
                      <ConsentRow
                        title={t("cookie.analyticsTitle")}
                        desc={t("cookie.analyticsDesc")}
                        checked={analytics}
                        onChange={setAnalytics}
                      />
                      <ConsentRow
                        title={t("cookie.marketingTitle")}
                        desc={t("cookie.marketingDesc")}
                        checked={marketing}
                        onChange={setMarketing}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setDetails((d) => !d)}
                className="btn-ghost text-xs sm:order-1"
              >
                {t("cookie.customize")}
              </button>
              {details ? (
                <button onClick={savePrefs} className="btn-ghost text-xs sm:order-2">
                  {t("cookie.save")}
                </button>
              ) : (
                <button onClick={rejectAll} className="btn-ghost text-xs sm:order-2">
                  {t("cookie.reject")}
                </button>
              )}
              <button onClick={acceptAll} className="btn-primary text-xs sm:order-3">
                <ShieldCheck className="h-4 w-4" />
                {t("cookie.acceptAll")}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ConsentRow({
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-4 py-3 ${
        disabled ? "opacity-70" : "cursor-pointer"
      }`}
    >
      <span>
        <span className="block text-xs font-medium text-white">{title}</span>
        <span className="block text-[11px] text-white/45">{desc}</span>
      </span>
      <span
        onClick={() => !disabled && onChange?.(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-royal-500" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </label>
  );
}
