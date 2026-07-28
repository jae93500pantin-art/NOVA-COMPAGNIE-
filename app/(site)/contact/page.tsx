"use client";

import { SectionHeader } from "@/components/SectionHeader";
import { ContactForm } from "@/components/ContactForm";
import { useI18n } from "@/lib/i18n";

export default function ContactPage() {
  const { t } = useI18n();

  return (
    <section className="mx-auto max-w-6xl px-5 pb-24 pt-32 lg:px-8">
      <SectionHeader
        eyebrow={t("contact.eyebrow")}
        title={t("contact.title")}
        subtitle={t("contact.subtitle")}
      />
      <div className="mt-14">
        <ContactForm />
      </div>
    </section>
  );
}
