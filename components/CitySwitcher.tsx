"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Check, ChevronDown } from "lucide-react";
import { cities } from "@/lib/cities";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "nova_city";

/**
 * City dropdown for the front bar, styled like the LanguageSwitcher.
 * Selecting a city routes to the filtered drivers listing and persists the choice.
 */
export function CitySwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cityId, setCityId] = useState<string>(cities[0]?.id ?? "paris");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && cities.some((c) => c.id === stored)) setCityId(stored);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = cities.find((c) => c.id === cityId) ?? cities[0];

  const select = (id: string) => {
    setCityId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    setOpen(false);
    router.push(`/drivers?city=${id}`);
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
      >
        <MapPin className="h-4 w-4 text-royal-400" />
        <span className="font-medium">{current?.name}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-white/50 transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-2xl glass-strong p-1.5 shadow-card"
        >
          {cities.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={cityId === c.id}
              onClick={() => select(c.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition",
                cityId === c.id
                  ? "bg-white/5 text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <span className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-white/40" />
                {c.name}
              </span>
              {cityId === c.id && <Check className="h-4 w-4 text-royal-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
