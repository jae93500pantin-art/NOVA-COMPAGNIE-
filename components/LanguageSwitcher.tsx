"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Lang; label: string; short: string }[] = [
  { value: "fr", label: "Français", short: "FR" },
  { value: "en", label: "English", short: "EN" },
];

/**
 * Language dropdown for the front bar (FR / EN).
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = OPTIONS.find((o) => o.value === lang) ?? OPTIONS[0];

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
      >
        <Globe className="h-4 w-4 text-royal-400" />
        <span className="font-medium">{current.short}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-white/50 transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-2xl glass-strong p-1.5 shadow-card"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={lang === o.value}
              onClick={() => {
                setLang(o.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition",
                lang === o.value
                  ? "bg-white/5 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white/40">
                  {o.short}
                </span>
                {o.label}
              </span>
              {lang === o.value && <Check className="h-4 w-4 text-royal-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
