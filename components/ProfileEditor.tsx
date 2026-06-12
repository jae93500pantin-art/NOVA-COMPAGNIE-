"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Save,
  Check,
  Loader2,
  User,
  Phone,
  Car,
  Wallet,
  Power,
  FileText,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getDriver } from "@/lib/drivers";
import {
  getDriverOverrides,
  saveDriverOverrides,
} from "@/lib/driverOverrides";

export function ProfileEditor() {
  const { user, loading, updateProfile } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [price, setPrice] = useState(0);
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const driver = user?.driverId ? getDriver(user.driverId) : undefined;

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setPhone(user.phone ?? "");
    if (driver) {
      const o = getDriverOverrides(driver.id);
      setBio(o.bio ?? driver.bio);
      setPrice(o.pricePerHour ?? driver.pricePerHour);
      setAvailable(o.available ?? driver.available);
    }
  }, [user, driver]);

  if (loading || !user) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Persist identity on the session.
    updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() });
    // Persist driver-specific public fields.
    if (driver) {
      saveDriverOverrides(driver.id, {
        bio: bio.trim(),
        pricePerHour: Number(price) || driver.pricePerHour,
        available,
      });
    }
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }, 500);
  };

  return (
    <div>
      <Link
        href="/compte"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" /> Mon espace
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-white">
        Éditer mon profil
      </h1>
      <p className="mt-1 text-sm text-white/55">
        {driver
          ? "Mettez à jour vos informations et votre profil public chauffeur."
          : "Mettez à jour vos informations personnelles."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-8">
        {/* Identity */}
        <section className="rounded-3xl glass p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <User className="h-4 w-4 text-royal-400" /> Informations personnelles
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Prénom">
              <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </Field>
            <Field label="Nom">
              <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </Field>
            <Field label="Téléphone" full>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  className="input pl-10"
                  type="tel"
                  inputMode="tel"
                  placeholder="+33 6 12 34 56 78"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </Field>
          </div>
        </section>

        {/* Driver-only public profile */}
        {driver && (
          <section className="rounded-3xl glass p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Car className="h-4 w-4 text-royal-400" /> Profil chauffeur public
            </h2>
            <p className="mt-1 text-xs text-white/45">
              {driver.car.make} {driver.car.model} · {driver.car.year}
            </p>

            <div className="mt-4 space-y-4">
              <Field label="Description">
                <div className="relative">
                  <FileText className="absolute left-3.5 top-3 h-4 w-4 text-white/40" />
                  <textarea
                    className="input min-h-[110px] resize-y pl-10"
                    value={bio}
                    maxLength={600}
                    onChange={(e) => setBio(e.target.value)}
                  />
                </div>
                <p className="mt-1 text-right text-[11px] text-white/30">
                  {bio.length}/600
                </p>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tarif horaire (€)">
                  <div className="relative">
                    <Wallet className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                      className="input pl-10"
                      type="number"
                      min={10}
                      max={500}
                      value={price}
                      onChange={(e) => setPrice(Number(e.target.value))}
                    />
                  </div>
                </Field>

                <Field label="Disponibilité">
                  <button
                    type="button"
                    onClick={() => setAvailable((a) => !a)}
                    className={`flex h-[46px] w-full items-center justify-between rounded-xl border px-4 transition ${
                      available
                        ? "border-emerald-400/30 bg-emerald-400/10"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm text-white">
                      <Power className={`h-4 w-4 ${available ? "text-emerald-400" : "text-white/40"}`} />
                      {available ? "En ligne" : "Hors ligne"}
                    </span>
                    <span
                      className={`relative h-6 w-11 rounded-full transition ${
                        available ? "bg-emerald-500" : "bg-white/15"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                          available ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </span>
                  </button>
                </Field>
              </div>

              <Link
                href={`/drivers/${driver.id}`}
                className="inline-block text-xs text-royal-300 hover:underline"
              >
                Voir mon profil public →
              </Link>
            </div>
          </section>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 text-sm text-emerald-400"
            >
              <Check className="h-4 w-4" /> Profil enregistré
            </motion.span>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-xs text-white/40">{label}</span>
      {children}
    </label>
  );
}
