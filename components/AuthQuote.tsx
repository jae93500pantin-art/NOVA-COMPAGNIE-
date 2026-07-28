"use client";

import { useI18n } from "@/lib/i18n";

export function AuthQuote() {
  const { t } = useI18n();
  return (
    <p className="mt-4 text-2xl font-medium leading-snug text-white">
      {t("authSide.quote")}
    </p>
  );
}

export function AuthRole() {
  const { t } = useI18n();
  return <p className="text-xs text-white/50">{t("authSide.role")}</p>;
}
