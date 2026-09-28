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
      {/* max-w-2xl + leading-relaxed : le sous-titre est devenu un vrai
          paragraphe (engagement de vérification des habilitations), il tombait
          sur cinq lignes serrées dans la largeur d'origine. */}
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/55">
        {t("drivers.subtitle")}
      </p>
    </div>
  );
}
