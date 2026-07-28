"use client";

import { useI18n } from "@/lib/i18n";

export function DriversIntro() {
  const { t } = useI18n();
  return (
    <div className="mb-10">
      <span className="section-eyebrow mb-4">{t("drivers.eyebrow")}</span>
      <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        {t("drivers.title")}
      </h1>
      <p className="mt-3 max-w-xl text-white/55">{t("drivers.subtitle")}</p>
    </div>
  );
}
