"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Check,
  Loader2,
  User,
  Phone,
  Car,
  Power,
  FileText,
  ImagePlus,
  X,
  AlertCircle,
  MessageCircle,
  Lock,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getDriver } from "@/lib/drivers";
import type { VehicleCategory } from "@/lib/types";
import {
  acceptsAirportTransfers,
  transferDestinationsForOptIn,
  sanitizeTransferDestinationIds,
} from "@/lib/transfer";
import { springSnappy } from "@/lib/motion";
import {
  getDriverOverrides,
  saveDriverOverrides,
  mergeCar,
  scheduleOf,
} from "@/lib/driverOverrides";
import {
  PLATFORM_COMMISSION_RATE,
  boundsFor,
  clampRate,
  hasFixedPricing,
  isRateEditable,
  rateError,
  splitRate,
} from "@/lib/pricing";
import { whatsappUrl } from "@/lib/whatsapp";
import {
  DAY_LABELS_FR,
  DEFAULT_SCHEDULE,
  PRESET_WEEKDAYS,
  cloneSchedule,
  sanitizeSchedule,
  type DaySchedule,
  type WeeklySchedule,
} from "@/lib/schedule";

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
  /** Single global opt-in — expanded to the full route list on save. */
  const [transfers, setTransfers] = useState(false);
  const [avatar, setAvatar] = useState("");
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carYear, setCarYear] = useState("");
  const [carColor, setCarColor] = useState("");
  const [schedule, setSchedule] = useState<WeeklySchedule>(() =>
    cloneSchedule(DEFAULT_SCHEDULE)
  );
  // Rates are typed as text so the field can be emptied while editing.
  const [hourRate, setHourRate] = useState("");
  const [dayRate, setDayRate] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rateBlocked, setRateBlocked] = useState(false);

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
      setTransfers(
        acceptsAirportTransfers({
          transferDestinations: sanitizeTransferDestinationIds(
            o.transferDestinations ?? driver.transferDestinations
          ),
        })
      );
      setAvatar(o.avatar ?? "");
      setSchedule(scheduleOf(driver, o));
      setHourRate(String(o.pricePerHour ?? driver.pricePerHour));
      setDayRate(String(o.pricePerDay ?? driver.pricePerDay));
      const car = mergeCar(driver, o);
      setCarMake(car.make);
      setCarModel(car.model);
      setCarYear(String(car.year));
      setCarColor(car.color);
      setPhotos(
        o.carPhotos && o.carPhotos.length > 0 ? o.carPhotos : driver.car.photos
      );
    }
  }, [user, driver]);

  // Switching class switches band: snap the rates into the new one so a fixed
  // class shows its imposed price immediately instead of a stale figure.
  useEffect(() => {
    if (!driver) return;
    setHourRate((v) => String(clampRate(category, "hour", Number.parseFloat(v))));
    setDayRate((v) => String(clampRate(category, "day", Number.parseFloat(v))));
  }, [category, driver]);

  if (loading || !user) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // An out-of-band rate blocks the whole save: a half-saved profile whose
    // price silently reverted is worse than a refusal.
    if (driver && (hourError || dayError)) {
      setRateBlocked(true);
      return;
    }
    setRateBlocked(false);
    setSaving(true);
    // Persist identity on the session.
    updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() });
    // Persist driver-specific public fields.
    if (driver) {
      const year = Number.parseInt(carYear, 10);
      const ok = saveDriverOverrides(driver.id, {
        bio: bio.trim(),
        available,
        avatar,
        // Validated above; clamped again so storage can only ever hold a
        // rate inside the band.
        pricePerHour: clampRate(category, "hour", hourValue),
        pricePerDay: clampRate(category, "day", dayValue),
        schedule: sanitizeSchedule(schedule),
        car: {
          make: carMake.trim(),
          model: carModel.trim(),
          // A blank or nonsense year falls back to the original in mergeCar.
          year: Number.isFinite(year) ? year : 0,
          color: carColor.trim(),
        },
        categories: [category],
        // The switch expands to the full route list — that stays the stored
        // shape, so every existing query and filter keeps working untouched.
        transferDestinations: sanitizeTransferDestinationIds(
          transferDestinationsForOptIn(transfers)
        ),
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

  /* Rates: bounds follow the selected class, so switching class re-validates. */
  const hourBounds = boundsFor(category, "hour");
  const dayBounds = boundsFor(category, "day");
  const hourValue = Number.parseFloat(hourRate);
  const dayValue = Number.parseFloat(dayRate);
  const fixedPricing = hasFixedPricing(category);
  const hourError = rateError(category, "hour", hourValue);
  const dayError = rateError(category, "day", dayValue);
  const hourSplit = splitRate(hourValue);
  const daySplit = splitRate(dayValue);

  const patchDay = (i: number, patch: Partial<DaySchedule>) =>
    setSchedule((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d))
    );

  /** Profile picture — kept small (320px) since it only ever renders at 96px. */
  const onAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    try {
      setAvatar(await fileToDataUrl(file, 320, 0.8));
    } catch {
      setPhotoError("Impossible de charger cette image.");
    }
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
              {carMake} {carModel} · {carYear}
            </p>

            <div className="mt-4 space-y-4">
              <Field label="Photo de profil">
                <div className="flex items-center gap-4">
                  <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatar || driver.avatar}
                      alt="Photo de profil"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <label className="btn-ghost cursor-pointer text-sm">
                      <ImagePlus className="h-4 w-4" />
                      Changer la photo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={onAvatarFile}
                      />
                    </label>
                    {avatar && (
                      <button
                        type="button"
                        onClick={() => setAvatar("")}
                        className="ml-2 text-xs text-white/50 transition hover:text-white"
                      >
                        Rétablir
                      </button>
                    )}
                    <p className="mt-1.5 text-[11px] leading-relaxed text-white/30">
                      C&apos;est la photo que les clients voient en premier.
                      Cadrez votre visage, en tenue professionnelle.
                    </p>
                  </div>
                </div>
              </Field>

              <Field label="Mon véhicule">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="input"
                    value={carMake}
                    maxLength={40}
                    placeholder="Marque (ex : Mercedes-Benz)"
                    aria-label="Marque"
                    onChange={(e) => setCarMake(e.target.value)}
                  />
                  <input
                    className="input"
                    value={carModel}
                    maxLength={40}
                    placeholder="Modèle (ex : Classe S 580)"
                    aria-label="Modèle"
                    onChange={(e) => setCarModel(e.target.value)}
                  />
                  <input
                    className="input"
                    value={carYear}
                    type="number"
                    inputMode="numeric"
                    min={1990}
                    max={new Date().getFullYear() + 1}
                    placeholder="Année"
                    aria-label="Année"
                    onChange={(e) => setCarYear(e.target.value)}
                  />
                  <input
                    className="input"
                    value={carColor}
                    maxLength={40}
                    placeholder="Couleur (ex : Noir Obsidienne)"
                    aria-label="Couleur"
                    onChange={(e) => setCarColor(e.target.value)}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-white/30">
                  Affiché sur votre profil public. Un champ laissé vide reprend
                  la valeur d&apos;origine.
                </p>
              </Field>

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

              <Field label="Mes tarifs (prix client TTC)">
                <p className="mb-3 text-[11px] leading-relaxed text-white/40">
                  {fixedPricing ? (
                    <>
                      Les tarifs de la gamme{" "}
                      <strong className="text-white/60">{category}</strong> sont
                      fixés par la plateforme et identiques pour tous les
                      chauffeurs. Ils ne sont pas modifiables.
                    </>
                  ) : (
                    <>
                      Vous fixez librement vos tarifs dans la fourchette de votre
                      gamme <strong className="text-white/60">{category}</strong>{" "}
                      : {hourBounds.min} – {hourBounds.max} € de l&apos;heure,{" "}
                      {dayBounds.min} – {dayBounds.max} € la journée.
                    </>
                  )}
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <RateInput
                    label="Tarif horaire TTC"
                    suffix="€ / h"
                    value={hourRate}
                    min={hourBounds.min}
                    max={hourBounds.max}
                    error={hourError}
                    readOnly={!isRateEditable(category, "hour")}
                    onChange={setHourRate}
                  />
                  <RateInput
                    label="Tarif journalier TTC"
                    suffix="€ / jour"
                    value={dayRate}
                    min={dayBounds.min}
                    max={dayBounds.max}
                    error={dayError}
                    readOnly={!isRateEditable(category, "day")}
                    onChange={setDayRate}
                  />
                </div>

                {/* Live commission breakdown — the driver sees what lands in
                    their pocket while they type, not after the first ride. */}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <CommissionCard label="Sur une heure" split={hourSplit} />
                  <CommissionCard label="Sur une journée" split={daySplit} />
                </div>

                <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-white">
                    Tarif à la semaine
                    <span className="chip border-royal-400/20 bg-royal-500/10 text-royal-200">
                      Sur devis
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                    Pour un tarif à la semaine, veuillez contacter le service
                    client.
                  </p>
                  <a
                    href={whatsappUrl(
                      "Bonjour, je souhaite obtenir un tarif semaine."
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost mt-3 text-sm"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Contacter le service client
                  </a>
                </div>
              </Field>

              <Field label="Mes horaires habituels">
                <p className="mb-3 text-[11px] leading-relaxed text-white/40">
                  Les clients ne peuvent réserver que dans ces créneaux. C&apos;est
                  indépendant du bouton En ligne : vous recevez des réservations
                  à l&apos;avance même hors ligne.
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSchedule(cloneSchedule(PRESET_WEEKDAYS))}
                    className="chip transition hover:bg-white/10"
                  >
                    Lun–Ven · 07:00–19:00
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedule(cloneSchedule(DEFAULT_SCHEDULE))}
                    className="chip transition hover:bg-white/10"
                  >
                    Tous les jours, sans limite
                  </button>
                </div>
                <div className="space-y-1.5">
                  {schedule.map((day, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 px-3 py-2"
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={day.open}
                        onClick={() => patchDay(i, { open: !day.open })}
                        className="flex min-w-[110px] items-center gap-2 text-left text-sm"
                      >
                        <span
                          aria-hidden
                          className={`h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors ${
                            day.open ? "bg-emerald-500" : "bg-white/15"
                          }`}
                        >
                          <span
                            className={`block h-3 w-3 rounded-full bg-white transition-all ${
                              day.open ? "ml-3" : ""
                            }`}
                          />
                        </span>
                        <span className={day.open ? "text-white" : "text-white/40"}>
                          {DAY_LABELS_FR[i]}
                        </span>
                      </button>
                      {day.open ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={day.start}
                            step={60}
                            aria-label={`${DAY_LABELS_FR[i]} — début`}
                            onChange={(e) => patchDay(i, { start: e.target.value })}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-sm text-white outline-none [color-scheme:dark] focus:border-royal-400/50"
                          />
                          <span className="text-white/30">–</span>
                          <input
                            type="time"
                            value={day.end}
                            step={60}
                            aria-label={`${DAY_LABELS_FR[i]} — fin`}
                            onChange={(e) => patchDay(i, { end: e.target.value })}
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-sm text-white outline-none [color-scheme:dark] focus:border-royal-400/50"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-white/30">Fermé</span>
                      )}
                    </div>
                  ))}
                </div>
                {schedule.every((d) => !d.open) && (
                  <p className="mt-2 text-xs text-amber-300">
                    Aucun jour ouvert : personne ne pourra vous réserver.
                  </p>
                )}
              </Field>

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

              <Field label="Transfert aéroport">
                <button
                  type="button"
                  role="switch"
                  aria-checked={transfers}
                  aria-describedby="transfer-optin-help"
                  onClick={() => setTransfers((v) => !v)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    transfers
                      ? "border-royal-400/50 bg-royal-500/10"
                      : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                      transfers ? "bg-royal-500" : "bg-white/15"
                    }`}
                  >
                    <motion.span
                      layout
                      transition={springSnappy}
                      className={`grid h-5 w-5 place-items-center rounded-full bg-white shadow ${
                        transfers ? "ml-auto" : ""
                      }`}
                    >
                      {transfers && <Check className="h-3 w-3 text-ink-900" />}
                    </motion.span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white">
                      Accepter les transferts aéroport (Paris &amp;
                      Île-de-France)
                    </span>
                    <span
                      id="transfer-optin-help"
                      className="mt-1 block text-[11px] leading-relaxed text-white/40"
                    >
                      En cochant cette case, vous acceptez d&apos;être proposé
                      pour l&apos;ensemble des trajets entre Paris /
                      Île-de-France et les aéroports de Roissy CDG, Orly (ORY)
                      et Le Bourget (LBG), dans les deux sens.
                    </span>
                  </span>
                </button>
                {!transfers && (
                  <p className="mt-2 text-xs text-amber-300">
                    Vous n&apos;apparaîtrez sur aucune recherche de transfert
                    aéroport.
                  </p>
                )}
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

        {rateBlocked && (hourError || dayError) && (
          <p className="flex items-center gap-1.5 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {hourError ?? dayError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Valider
          </button>
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 text-sm text-emerald-400"
            >
              <Check className="h-4 w-4" /> Profil validé
            </motion.span>
          )}
        </div>
      </form>
    </div>
  );
}

/** Rate field with its band as `min`/`max` and an inline error. */
function RateInput({
  label,
  suffix,
  value,
  min,
  max,
  error,
  readOnly,
  onChange,
}: {
  label: string;
  suffix: string;
  value: string;
  min: number;
  max: number;
  error: string | null;
  /** Platform-set rate: shown, never editable. */
  readOnly?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-white/40">{label}</span>
      <div className="relative">
        <input
          className={`input pr-16 ${error ? "border-red-400/50" : ""} ${
            readOnly ? "cursor-not-allowed text-white/60" : ""
          }`}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={5}
          value={value}
          readOnly={readOnly}
          aria-readonly={readOnly}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">
          {suffix}
        </span>
      </div>
      <span className="mt-1 flex items-center gap-1 text-[11px] text-white/30">
        {readOnly ? (
          <>
            <Lock className="h-2.5 w-2.5" /> Tarif plateforme, non modifiable
          </>
        ) : (
          <>
            {min} – {max} € TTC
          </>
        )}
      </span>
      {error && (
        <span className="mt-0.5 block text-[11px] text-red-300">{error}</span>
      )}
    </label>
  );
}

/** Live "what the client pays / what you keep" breakdown. */
function CommissionCard({
  label,
  split,
}: {
  label: string;
  split: { ttc: number; commission: number; net: number };
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-xs">
      <p className="text-[11px] uppercase tracking-wider text-white/35">
        {label}
      </p>
      <dl className="mt-2 space-y-1">
        <div className="flex items-center justify-between">
          <dt className="text-white/50">Prix client TTC</dt>
          <dd className="font-medium text-white">€{split.ttc}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-white/50">
            Commission ({Math.round(PLATFORM_COMMISSION_RATE * 100)} %)
          </dt>
          <dd className="text-white/60">−€{split.commission}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-white/10 pt-1">
          <dt className="font-medium text-white/70">Votre revenu net</dt>
          <dd className="text-sm font-semibold text-emerald-300">
            €{split.net}
          </dd>
        </div>
      </dl>
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
