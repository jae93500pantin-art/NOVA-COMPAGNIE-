"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { AuthForm } from "./AuthForm";
import { useI18n } from "@/lib/i18n";
import { dur, ease, springSoft } from "@/lib/motion";

type Mode = "login" | "register";

/**
 * Login/registration dialog. Opens over the current page — no navigation —
 * and stays below the navbar (z-40 vs z-50) so the top bar remains usable.
 */
export function AuthModal({
  open,
  onClose,
  initialMode = "login",
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Each opening starts from the mode the trigger asked for.
  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Freeze the page behind the dialog (keeps it visible, prevents scroll bleed).
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
    };
  }, [open]);

  // Move focus into the dialog, then hand it back to the trigger on close.
  useEffect(() => {
    if (open) {
      restoreFocus.current = document.activeElement as HTMLElement | null;
      const id = requestAnimationFrame(() => {
        const field = panelRef.current?.querySelector<HTMLElement>(
          "input, button, [href]"
        );
        field?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    restoreFocus.current?.focus?.();
  }, [open]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!mounted) return null;

  const isRegister = mode === "register";

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto px-0 pb-0 pt-24 sm:items-center sm:px-4 sm:py-10"
          onMouseDown={handleBackdrop}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.base, ease }}
            className="pointer-events-none fixed inset-0 -z-10 bg-ink-950/70 backdrop-blur-sm"
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            transition={springSoft}
            className="glass-strong relative w-full max-w-md rounded-t-3xl p-6 pb-safe shadow-card sm:rounded-3xl sm:p-8 sm:pb-8"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label={t("auth.close")}
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-[0.94] sm:right-5 sm:top-5"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

            <h2
              id="auth-modal-title"
              className="pr-12 text-2xl font-semibold tracking-tight text-white"
            >
              {isRegister ? t("auth.titleRegister") : t("auth.titleLogin")}
            </h2>
            <p className="mt-1.5 pr-12 text-sm text-white/55">
              {isRegister ? t("auth.subtitleRegister") : t("auth.subtitleLogin")}
            </p>

            <div className="mt-5 max-h-[65dvh] overflow-y-auto pr-0.5 sm:max-h-[70vh]">
              <Suspense fallback={null}>
                <AuthForm
                  key={mode}
                  mode={mode}
                  embedded
                  onSuccess={onClose}
                  onSwitchMode={setMode}
                />
              </Suspense>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
