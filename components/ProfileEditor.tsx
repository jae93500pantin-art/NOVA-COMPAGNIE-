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
  Power,
  FileText,
  ImagePlus,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getDriver } from "@/lib/drivers";
import type { VehicleCategory } from "@/lib/types";
import {
  getDriverOverrides,
  saveDriverOverrides,
} from "@/lib/driverOverrides";

const CATEGORIES: VehicleCategory[] = [
  "Business",
  "Moto",
  "Van",
  "Van Luxury",
  "Luxury",
];

export function ProfileEditor() {
  const { user, loading, updateProfile } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [available, setAvailable] = useState(true);
  const [category, setCategory] = useState<VehicleCategory>("Business");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
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
      setAvailable(o.available ?? driver.available);
      setCategory((o.categories?.[0] ?? driver.categories[0]) as VehicleCategory);
      setPhotos(
        o.carPhotos && o.carPhotos.length > 0 ? o.carPhotos : driver.car.photos
      );
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
      const ok = saveDriverOverrides(driver.id, {
        bio: bio.trim(),
        available,
        categories: [category],
        carPhotos: photos,
      });
      if (!ok) {
        setPhotoError(
          "Stockage plein : réduisez le nombre de photos et réessayez."
        );
      }
    }
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }, 500);
  };

  const MAX_PHOTOS = 8;
  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setPhotoError(null);
    const room = Math.max(0, MAX_PHOTOS - photos.length);
    try {
      const urls = await Promise.all(files.slice(0, room).map((f) => fileToDataUrl(f)));
      setPhotos((p) => [...p, ...urls].slice(0, MAX_PHOTOS));
    } catch {
      setPhotoError("Impossible de charger une image.");
    }
  };
  const removePhoto = (i: number) =>
    setPhotos((p) => p.filter((_, idx) => idx !== i));

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

              <div className="grid gap-4">
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

              <Field label="Catégorie du véhicule">
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        category === c
                          ? "border-royal-400/50 bg-royal-500/20 text-white"
                          : "border-white/10 text-white/60 hover:bg-white/5"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Photos du véhicule">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photos.map((p, i) => (
                    <div
                      key={i}
                      className="group relative aspect-video overflow-hidden rounded-xl border border-white/10"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p}
                        alt={`Photo ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        aria-label="Retirer"
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <label className="grid aspect-video cursor-pointer place-items-center rounded-xl border border-dashed border-white/15 text-white/50 transition hover:border-royal-400/50 hover:text-white">
                      <span className="flex flex-col items-center gap-1 text-[11px]">
                        <ImagePlus className="h-5 w-5" />
                        Ajouter
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={onFiles}
                      />
                    </label>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-white/30">
                  {photos.length}/{MAX_PHOTOS} photos · redimensionnées automatiquement
                </p>
                {photoError && (
                  <p className="mt-1 text-xs text-red-300">{photoError}</p>
                )}
              </Field>

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

/**
 * Read a File and return a downscaled JPEG data URL so photos stay small
 * enough for localStorage (demo persistence). Max 1280px, quality 0.72.
 */
function fileToDataUrl(file: File, maxW = 1280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read error"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("decode error"));
      img.onload = () => {
        const scale = Math.min(1, maxW / (img.width || maxW));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
