# CLAUDE.md — Nova Compagnie

> Context file for AI agents working on this codebase. Read this first.
> Keep it updated when architecture, commands, or conventions change.

## What this is

**Nova Compagnie** (domain www.novacompagnie.com) is a premium private-chauffeur marketplace (think Uber Black ×
Airbnb), built as a credible, investor-grade prototype. Clients browse verified
drivers across cities, view detailed profiles, chat, and book. Dark, premium UI
with glassmorphism and Framer Motion animations.

It runs **fully in demo mode with zero setup** (mock data, stylised map,
simulated auth) and **upgrades gracefully** to real infrastructure (Supabase
auth/DB/realtime, Mapbox) the moment the relevant env keys are present.

## Tech stack

- **Next.js 14.2.35** (App Router, RSC) · **React 18** · **TypeScript** (strict)
- **TailwindCSS** 3 (custom theme) · **Framer Motion** · **lucide-react** icons
- **Supabase** (`@supabase/ssr`, `@supabase/supabase-js`) — auth, Postgres, realtime
- **Mapbox** (`mapbox-gl`, `react-map-gl`) — live map
- `server-only` guards privileged server modules
- Node installed via Homebrew. Package manager: **npm**.

## Commands

```bash
npm run dev      # next dev -H 0.0.0.0 → http://localhost:3000 (also LAN)
npm run build    # production build; MUST pass. ~24 routes + middleware
npm start        # next start -H 0.0.0.0
npm run lint
npm run check:auth  # diagnose why real auth is off: keys → connectivity → schema
./deploy.sh      # build locally, start VM if off, ship + build + restart on Azure, verify HTTPS
```

### Appliquer le schéma Supabase

⚠️ **`supabase/schema.sql` ne s'exécute pas tel quel** — son ordre de lecture
n'est pas un ordre d'exécution valide, et il ne l'a jamais été (le projet a
vécu en mode démo, donc personne ne l'avait lancé sur une base vierge) :

1. `reviews.booking_id` référence `public.bookings`, déclaré **plus bas** ;
2. `booking_chat_is_open()` emploie la valeur d'enum `'paid'` ajoutée dans le
   même fichier — Postgres refuse d'utiliser une valeur d'enum dans la
   transaction qui l'ajoute ;
3. les `create policy` et `alter publication` ne sont pas rejouables.

`scripts/compose-schema.ps1` régénère donc `supabase/setup/` en trois blocs
ordonnés — `1-tables.sql`, `2-enums.sql` (**seul dans sa transaction**),
`3-policies-rgpd.sql` (idempotent) — en repérant les sections par leurs
commentaires-marqueurs, pas par numéro de ligne. `scripts/apply-schema.ps1` les
envoie dans l'ordre à l'API Management (`POST /v1/projects/{ref}/database/query`,
une transaction par appel, jeton lu depuis `SUPABASE_ACCESS_TOKEN`, jamais
affiché). **`schema.sql` reste la source de vérité du contenu** : on l'édite,
puis on relance `compose-schema.ps1`.

`npm run check:auth` vérifie dans l'ordre fichier → clés → connexion → schéma,
et n'affiche jamais une clé en entier.

### Créer un administrateur

`scripts/promote-admin.ps1 -Email <adresse>` promeut un compte **existant**
(inscrivez-vous d'abord sur `/auth/register`). La promotion ne peut pas venir du
site : `profiles_update_own` laisse un utilisateur écrire sur sa propre ligne, et
le trigger `profiles_protect_privileged` verrouille donc `role`/`status` dès que
`auth.uid() = profiles.id` — personne ne s'auto-promeut. Le script passe par
l'API Management, qui s'exécute sans `auth.uid()`. Effet immédiat :
`requireAdmin()` relit `profiles.role` à chaque requête, aucune reconnexion.
`-Role client` rétrograde.

**Le back-office a sa propre porte : `/admin/login`.** Écran dédié (hors du
groupe `(site)` : ni navbar ni footer), atteint par un bouton discret dans la
barre légale du footer. Il poste sur la même route `/api/auth/login` que la
connexion publique — il n'y a qu'un système d'authentification — mais refuse un
compte sans le rôle `admin` **et referme la session ouverte à l'instant** :
franchir cette porte ne doit pas connecter au site par effet de bord. Le
middleware envoie `/admin/*` anonyme vers `/admin/login` (jamais vers la
connexion publique), `/admin/login` étant explicitement exclu de la protection
pour ne pas boucler sur lui-même. Une session valide sans le rôle est renvoyée
vers `/admin/login?error=forbidden`, qui l'explique, au lieu du retour muet à
l'accueil d'avant. Un admin déjà identifié qui ouvre `/admin/login` repart
sur `/admin`.

⚠️ **`useAuth()` ne connaît pas le rôle `admin`** — il ne lit que le rôle
marketplace dans `user_metadata`. Le privilège vit dans `profiles.role` et n'est
lu que côté serveur (`requireAdmin`). C'est délibéré : le navigateur n'autorise
rien, et un `isAdmin` côté client n'aurait servi qu'à afficher un lien.

- Dev binds `0.0.0.0` so other devices on the LAN can connect.
  iPhone Safari on the same Wi-Fi: **http://192.168.1.192:3000** (Mac LAN IP).
- ⚠️ **Do not run `npm run build` while `npm run dev` is running** — they share
  `.next/` and corrupt each other (causes `Cannot find module './vendor-chunks/*'`
  and 500s). Kill dev first, or `rm -rf .next` then restart dev.
- Free a stuck port: `lsof -ti :3000 | xargs kill -9`.
- Workflow: code locally with `npm run dev` → when OK, `./deploy.sh` pushes to the VM.

## Directory map

```
app/
  layout.tsx                  Root: <html>/<body>, Inter font, PWA/Safari meta, viewportFit cover
  globals.css                 Design system: glass, btn-*, chip, input, iOS fixes, prose-legal, mapbox overrides
  not-found.tsx               404
  (site)/                     Route group WITH Navbar + Footer + CookieConsent
    layout.tsx
    page.tsx                  Homepage: Hero (booking card + globe + testimonials), cities, how-it-works, features, CTA
    drivers/page.tsx          Listing + filters (Suspense → DriversExplorer)
    drivers/[id]/page.tsx     Driver profile (SSG via generateStaticParams): gallery, facts, reviews, booking
    transfert-aeroport/page.tsx  Airport-transfer / private-chauffeur landing: hero + trust badges, features, instant price estimate, pickup-zones map
    vol-prive/page.tsx      Vol privé : page « bientôt disponible » + liste d'attente (clé i18n `jet.*`). ⚠️ **Plus aucun lien n'y mène** — retirée de la Navbar, elle ne répond qu'à l'URL directe. Le fichier et les clés `nav.privateJet` sont conservés (restaurer = une ligne dans `links`). ⚠️ L'inscription est SIMULÉE — aucun backend ne recueille l'adresse, elle est perdue à la soumission.
    contact/page.tsx          Contact page (SectionHeader + ContactForm): info panel + professional contact form
    compte/page.tsx           Personal dashboard (AccountDashboard) — client & driver views; redirects to login if no session
    legal/layout.tsx          Legal shell with sidebar nav
    legal/confidentialite     Privacy policy (RGPD)
    legal/conditions          Terms of use
    legal/cookies             Cookie policy
    legal/mentions-legales    Legal notice (FR/EU required)
    legal/mes-donnees         Data-rights centre (DataRights): consent, export, delete
  auth/                       Full-screen, NO navbar (centered form only, no photo/marketing panel; Nova Compagnie logo on top)
    layout.tsx
    login/page.tsx            Suspense → AuthForm mode="login"
    register/page.tsx         Suspense → AuthForm mode="register"
    callback/route.ts         Lien Supabase à usage unique : exchangeCodeForSession + sync `profiles`. Ne sert plus à OAuth, mais reste requis par le mot de passe oublié.
  api/
    account/route.ts          DELETE → RGPD account erasure (service role)
    account/export/route.ts   GET → RGPD data export (JSON)
    checkout/route.ts         POST → Stripe Checkout session (test/live) or {mode:"demo"} fallback. Amount computed server-side.
    bookings/[driverId]/route.ts  SSE (GET) live course requests + POST create + PATCH accept/refuse/complete/cancel
    chat/[bookingId]/route.ts     SSE (GET) per-booking chat + POST send. Participants only, open only while paid.
    booking/[id]/pdf/route.ts     GET → bon de réservation préalable en PDF. Parties seules, courses payées, refuse (409) si une mention obligatoire manque.

components/                   All client components unless noted
  Navbar                      Front bar = logo (Nova Compagnie) + "Annuaire" (→ /drivers, clé `nav.booking`) + "Transfert Aéroport" + "Contact" links + CitySwitcher + LanguageSwitcher + account dropdown/login. Account dropdown has a **WhatsApp contact** link (messaging feature removed).
  CitySwitcher                City dropdown (front bar, next to LanguageSwitcher) — cities from lib/cities.ts (Paris only for now); selecting routes to /drivers?city=<id>, persisted in localStorage `nova_city`.
  LanguageSwitcher            FR/EN dropdown (globe icon). Persists choice; default = browser language.
  Footer, SectionHeader, Reveal (anim wrapper)
  Hero                        Uber-inspired homepage hero: tagline ("Trouvez votre chauffeur" / "Find your driver") + Uber-style booking card on the left, Globe focal point on the right. Left scrim keeps text legible. Below: 3 FICTIONAL client testimonials (about the SITE/reliability, not drivers). No big title/subtitle, no stats row.
  SearchBar                   Uber-style vertical booking card (Ville + premium DatePicker + full-width CTA → /drivers). Chosen date saved to sessionStorage `jw_booking_date` to prefill the BookingWidget. NO vehicle category field.
  DatePicker                  Premium custom date+time picker (glass popover via portal). Quick-chips (Today/Tomorrow/This weekend), Monday-first calendar, time chips, keyboard nav (arrows/Esc), flips up when low on screen, reduced-motion-safe, i18n. `variant="search"|"booking"`. Calendar logic in lib/calendar.ts. **Never yields a past slot**: an hour already gone today rolls the booking to tomorrow (`rollPastTimeToNextDay`), and picking a day whose selected hour has passed drops the hour — both explained by an inline notice.
  Globe                       Animated WebGL globe (cobe) — Google-Earth "blue marble" hero backdrop, slow auto-rotation. NOTE: pin cobe to 0.6.3; v2 has a WebGL regression that renders only markers (no sphere).
  AccountDashboard            /compte client & driver dashboards
  InteractiveMap              Stylised fallback map (no token needed)
  MapboxMap                   Real Mapbox map (token required)
  LiveMap                     Picks Mapbox vs InteractiveMap based on token
  DriverCard, DriversExplorer, Gallery, Reviews, StarRating
  BookingWidget               Booking summary on a driver profile. Header shows the hourly + daily
                              rate (TTC) and a **"Devis semaine WhatsApp"** block above the actions —
                              week bookings are never priced online, they go to support via
                              `whatsappUrl()` with the driver's name prefilled. Re-merges the driver
                              through `applyDriverOverrides` after mount: the page is SSG, so without
                              it a driver-set premium rate would be both displayed and charged stale.
                              3-way unit toggle **À l'heure /
                              À la journée / Aéroport**. In transfer mode the hourly line
                              (€170 × 3 h) and the duration slider are replaced by a flat-fare block
                              ("Forfait" + the route, e.g. "Orly (ORY) → Paris · Île-de-France" → €100)
                              and a route select limited to the ones the driver ticked. Prefilled from
                              the transfer page via sessionStorage `jw_booking_transfer`.
  BookingChat                 Per-booking chat thread (SSE), rendered inline under a booking card in
                              ClientBookings + DriverRequests. Locked before payment, read-only once archived.
  ContactForm                 Professional contact form (nom/prénom, e-mail, téléphone, type de demande, message) with client-side validation + animated success confirmation. Demo mode: simulated send (no email backend yet).
  TransferEstimate            Instant airport-transfer price estimate (departure airport + destination zone + vehicle → live €). Pure math in lib/transfer.ts. The **vehicle class is a strict filter**: one card per class showing how many drivers of that class serve the chosen destination, and the driver count + fare update on click. `driverHasTransferVehicle` uses the same class that prices the ride (`transferVehicleForCategories`), so the estimate is what those drivers actually charge. Refusals name their cause (destination unserved vs class empty). CTA routes to /drivers?city=<city>&transfer=<dest>&vehicle=<class>, also carried in sessionStorage `jw_booking_transfer` / `jw_booking_vehicle`.
  TransferPickupMap           Stylised pickup-zones map (airport pins + animated rings), same aesthetic as InteractiveMap.
  CityShowcase
  AuthForm                    Client/driver toggle, Supabase auth + demo fallback. Props `embedded`/`onSuccess`/`onSwitchMode` when rendered inside AuthModal.
  AuthModal                   Login/register dialog opened from the Navbar (portal, z-40 under the navbar): X, outside click, Escape, body scroll lock, mobile bottom-sheet. No redirect.
  CookieConsent               GDPR consent banner (mounted in (site)/layout)
  DataRights                  RGPD self-service (export/delete/consent)

lib/
  types.ts                    Domain types: Driver, City, Review
  identity.ts                 Pure helpers normalising provider metadata (Google given_name/family_name/name/picture → firstName/lastName/avatarUrl). Unit-tested.
  i18n.tsx                    I18nProvider + useI18n() — bilingual FR/EN. Default = browser lang, persisted in localStorage `lumecar_lang`. t("a.b") with FR fallback.
  dictionaries.ts             FR + EN translation dictionaries (typed; EN must match FR shape).
  calendar.ts                 Pure calendar helpers (monthGrid, shiftMonth, isBefore, addDays, nextWeekendISO…). Unit-tested. Powers DatePicker.
  motion.ts                   Shared Apple-grade motion tokens (ease [0.22,1,0.36,1], springSoft/Snappy, reveal, popover, stagger).
  schedule.ts                 Weekly availability planning (pure): DaySchedule/WeeklySchedule (7 entries, Monday-first), DEFAULT_SCHEDULE (= no constraint, so an unconfigured driver behaves as before), PRESET_WEEKDAYS (Mon–Fri 07:00–19:00), isWithinSchedule/isDayOpen/dayScheduleFor, sanitizeSchedule (repairs bad times and an end before its start). Unit-tested.
  bookings.ts                 Booking domain types + pure helpers: canTransition, statusLabel, buildBooking, scheduling helpers (todayISODate, composeWhen, isFutureBooking, formatWhen) AND auto-close (bookingStartsAt, shouldAutoComplete, AUTO_COMPLETE_AFTER_MS). Unit-tested.
  chat.ts                     Chat domain: ChatMessage, chatStateFor/chatStateForBooking (locked|open|grace|archived), chatClosesAt/graceMinutesLeft (30 min après la clôture), canSendMessage, participantRole, buildMessage (c'est lui qui masque), messageStatus, formatMessageTime. Pure, unit-tested.
  chatBroker.ts               In-memory per-booking chat rooms + SSE pub/sub (postMessage, subscribeChat, closeChat, dropChat). Mirrors bookingBroker.
  chatMasking.ts              Masquage des coordonnées (anti-désintermédiation) : maskContacts/hasContactDetails. Pur, rejoué par le trigger SQL mask_contact_details. ⚠️ Appliqué avant la DIFFUSION, pas seulement avant l'insertion.
  chatQuickReplies.ts         Jeu fermé de réponses rapides par rôle (chat.quick.*) — sécurité routière, pas confort. Le serveur n'accorde aucune confiance au drapeau isQuickReply.
  useBookingChat.ts           Hook navigateur de la messagerie (SSE, accusés, délai de grâce). ⚠️ Prend la réservation résolue, jamais un simple bookingId.
  transfer.ts                 Airport-transfer domain data (Paris airports, Île-de-France zone, vehicle classes) + pure estimateTransfer() pricing helper (flat fare per vehicle: Berline 100 € / Van 150 € / Première classe 200 €). `transferVehicleForCategories` / `transferFareForDriver` derive a driver's flat transfer fare from their declared categories — the server recomputes it, the client never sends a price. `transferDestinations` are **directional routes** (`{id, from, to}`, label = "from → to"): 3 Paris→airport, 3 airport→Paris, plus the legacy catch-all `paris` ("Aéroport → Paris · Île-de-France") kept so existing driver opt-ins stay valid. Drivers opt in with **one global switch** in `ProfileEditor` ("Accepter les transferts aéroport"), so a profile holds either every route or none — `acceptsAirportTransfers` / `transferDestinationsForOptIn` / `ALL_TRANSFER_DESTINATION_IDS` do the expansion. Kept as a `text[]` (no extra boolean column) so `transfer_destinations @> array['cdg']` and its GIN index still answer "who serves CDG?" with no migration. Reading is lenient (≥1 route = opted in) so legacy partial lists don't silently drop drivers; the next save normalises them.
  cities.ts, drivers.ts       Mock data + accessors (getDriver, driversByCity…)
  drivers.ts                  Includes `jeremy-driver` (Jérémy Dubois, Mercedes-AMG E63 S)
  utils.ts                    cn(), formatPrice(), initials()
  config.ts                   env, serverEnv, feature flags (isSupabaseConfigured, isMapboxConfigured, isSupabaseAdminConfigured)
  auth.tsx                    AuthProvider + useAuth() — global session (demo localStorage or Supabase). setDemoSession/clearDemoSession
  demoAccounts.ts             Demo login accounts (test/test client, driver/driver → jeremy-driver)
  contacts.ts                 Client's contacted drivers + roomForDriver(id)="dm-<id>" (client↔driver chat room)
  driverOverrides.ts          Driver self-edits (demo): bio, available, **avatar** + **car** (make/model/year/colour, typed by the driver) + **carPhotos** (uploaded, compressed to data-URLs). `applyDriverOverrides` merges, `mergeCar` handles the car (a blank field falls back to the original — never a nameless car). ⚠️ Le tarif est fixé par le CHAUFFEUR (voir § Payments) : un 0 y reste un 0 — « non communiqué » — et ne repart pas sur le tarif d'origine de la fiche. The public profile is SSG, so `Gallery`, `DriverAvatar` and `DriverVehicle` re-read the overrides client-side to reflect edits without a rebuild.
  bookingVoucher.ts           Bon de réservation : numérotation stable, mentions obligatoires (missingVoucherFields), validation SIREN/SIRET (Luhn), mise en forme. Pur, testé.
  pdf/bookingVoucher.tsx      Rendu PDF du bon (@react-pdf/renderer, server-only). Refuse d'émettre un bon incomplet.
  voucherSource.ts            server-only — réunit SIREN/carte VTC/plaque/téléphone depuis 3 tables (service role). Ne contrôle AUCUNE identité : l'appelant doit l'avoir fait.
  whatsapp.ts                 WHATSAPP_NUMBER + whatsappUrl() — central WhatsApp contact link (messaging feature removed)
  geo.ts                      City coords + driverCoords() for Mapbox
  consent.ts                  Consent get/save/clear (localStorage, versioned)
  validation.ts               Room/text validation + sanitisation for the booking API
  supabase/client.ts          Browser client (null if unconfigured)
  supabase/server.ts          Server client bound to cookies
  supabase/admin.ts           server-only service-role client (privileged)

middleware.ts                 Refreshes Supabase session (no-op in demo mode)
next.config.js                Security headers, image hosts, poweredByHeader:false, allowedDevOrigins
deploy.sh                     One-command deploy to the Azure VM (build → ship → restart → verify)
supabase/schema.sql           Full schema: tables, enums, RLS, triggers, realtime, RGPD (consents/audit/delete_my_account RPC)
.env.local / .env.local.example   Env placeholders
```

## Auth & accounts (current = demo mode)

- Global session via `lib/auth.tsx` (`AuthProvider` in root layout, `useAuth()`).
- Demo accounts (`lib/demoAccounts.ts`): **client `test`/`test`**, **driver `driver`/`driver`**
  (linked to driver profile `jeremy-driver`). Login accepts username OR email.
- On login → session saved to localStorage `lumecar_demo_session`, `lumecar:auth`
  event fires → Navbar swaps to the account dropdown, user redirected to `/compte`.
- `/compte` renders a client dashboard or a driver dashboard based on the role.
- When Supabase is configured, `useAuth` derives the session from the real auth user
  instead, and login/registration go through Supabase.
- **Login is a modal, not a page**: the Navbar "Connexion"/"S'inscrire" buttons open
  `AuthModal` over the current page (no navigation). `/auth/login` and
  `/auth/register` still work as standalone pages (deep links, OAuth error returns).

### Real authentication (with Supabase keys)

- **Sign-up and sign-in go through our own API routes, not the browser client.**
  `POST /api/auth/register` / `/api/auth/login` / `/api/auth/logout` /
  `/api/auth/reset` / `/api/auth/password`. The browser *could* call
  `supabase.auth.*` directly, but then our business rules would live only in the
  form — one `fetch` away from being skipped. Signing up server-side makes the
  validation authoritative, allows rate limiting, and keeps raw English Supabase
  messages off the screen. `@supabase/ssr` writes the session cookie on the
  response, so the caller is signed in as soon as the JSON lands.
- **`lib/authValidation.ts` is the single rule set** (pure, unit-tested in
  `tests/authValidation.test.ts`, 26 tests). The exact same module runs in the
  form (live per-field errors) and in the route handlers (the real check), so the
  client can never be more permissive than the server. Password policy: ≥ 8 chars,
  one letter + one digit, ≤ 72 **bytes** (bcrypt truncates past that, which would
  silently make two passwords equivalent). Errors are returned as **i18n keys**
  (`auth.errors.*`), never sentences, so responses stay language-agnostic.
  `mapAuthError` collapses anything unrecognised to `auth.errorGeneric` rather
  than echoing internals back.
- **Rate limits** (`rateLimit`, in-memory): register 5/min/IP; login 10/min/IP
  **and** 8/5 min per address — one bucket alone stops neither a single host
  hammering many accounts nor a botnet hammering one; reset 3/10 min; password
  5/10 min.
- **Cloisonnement des rôles** (`middleware.ts`) : `/compte/courses` est réservé
  aux chauffeurs, `/compte/reservations` et `/compte/reservation` aux clients ;
  chacun est **renvoyé chez lui**, pas vers une erreur — se tromper d'onglet
  n'est pas une faute. ⚠️ Le rôle est lu dans `profiles`, **jamais dans
  `user_metadata`** : un utilisateur peut réécrire ses propres métadonnées avec
  `supabase.auth.updateUser({ data: { role: "driver" } })`, alors que la
  colonne est verrouillée par `profiles_protect_privileged`. Coût assumé : une
  requête de plus, et seulement sur ces trois chemins.
- **Route protection is server-side** (`middleware.ts`): `/compte/*` and `/admin`
  require a session, anonymous visitors are sent to
  `/auth/login?next=<path>`; a signed-in visitor bounced off `/auth/login`
  `/auth/register`. Redirects re-attach the refreshed auth cookies — a bare
  `NextResponse.redirect` would drop them and log the user out exactly when their
  token was renewed. `lib/session.ts` (`getServerUser` / `requireUser`) is the
  same guard for Server Components, and every `/compte/*` page calls it as a
  second lock so a matcher change cannot quietly expose a page.
  ⚠️ **Both are no-ops in demo mode** — the demo session lives in localStorage,
  invisible to the server; guarding would lock the no-keys demo out of its own
  account space, so `AccountDashboard`'s client-side redirect stays in charge.
- **E-mail confirmation is handled explicitly.** When the Supabase project
  requires it, `signUp` returns no session; the form then shows "vérifiez votre
  boîte mail" instead of claiming the visitor is logged in. An address that
  already exists gets that *same* answer (Supabase returns a decoy user with an
  empty `identities` array) — keeping the endpoint from becoming an
  account-enumeration oracle. `/api/auth/reset` answers identically for known and
  unknown addresses for the same reason.
- **Password recovery**: `/auth/mot-de-passe-oublie` (ask) →
  Supabase e-mail → `/auth/callback` exchanges the code →
  `/auth/nouveau-mot-de-passe` (set). `RECOVERY_PATH` in `lib/validation.ts` is
  the sole exception to `safeReturnPath`'s "never return to `/auth/*`" rule.
- **Sign-out** clears the browser copy *and* `POST`s to `/api/auth/logout` so the
  refresh token is revoked server-side; otherwise a cookie captured earlier could
  still be redeemed. POST-only, so a prefetched link can never log anyone out.
- Roles come from `profiles.role` **read on the server**, never from the signup
  payload: `validateRegistration` forces anything that is not `driver` to
  `client`, and the `profiles_protect_privileged` trigger blocks self-promotion.

## Fournisseurs externes : retirés (Google, Apple)

**Il n'y a plus qu'une seule façon de créer un compte et de se connecter :
l'adresse e-mail et le mot de passe, via nos routes `/api/auth/*`.** Les boutons
Google et Apple ont été retirés du formulaire (connexion **et** inscription :
c'est le même composant), et `components/GoogleButton.tsx` supprimé.

Ce qui reste en place, volontairement :

- **`/auth/callback` est conservé.** Il ne sert plus à OAuth mais il reste
  indispensable au **mot de passe oublié** : c'est là que le code de
  récupération est échangé contre une session avant `/auth/nouveau-mot-de-passe`
  (`RECOVERY_PATH`). ⚠️ Le supprimer casserait la réinitialisation en silence.
- **`lib/identity.ts` est conservé** : il normalise les métadonnées d'un compte
  (prénom/nom/avatar) quelle qu'en soit l'origine, y compris nos propres
  inscriptions. Ses tests couvrent encore les formes Google.
- **`*.googleusercontent.com` reste autorisé** dans la CSP `img-src` et les
  hôtes d'images : des comptes créés avant ce retrait portent encore un
  `avatar_url` Google, et le retirer afficherait une image cassée sur leur
  profil.
- Le provider Google peut rester activé côté Supabase — plus rien ne l'appelle.
  Le désactiver dans le dashboard est propre mais facultatif.

Pour le réactiver un jour : recréer un bouton appelant
`supabase.auth.signInWithOAuth({ provider })`, le callback fait déjà le reste.

## Contact (WhatsApp)

- The **general-purpose** messaging feature (and the `/live` cross-device chat
  demo) was removed. Generic "contact" actions open the WhatsApp Business line via
  `lib/whatsapp.ts` (`whatsappUrl(message?)`, `WHATSAPP_NUMBER`, `WHATSAPP_DISPLAY`).
  It was later replaced — for paid rides only — by the booking-scoped chat above
  ("Messagerie de course"); WhatsApp remains the pre-booking / support channel.
- Entry points: account dropdown (Navbar), `BookingWidget` "Contacter",
  `ClientBookings` row action, the booking-confirmation page, and the `ContactForm`
  info panel (`/contact`).
- Deleted: `app/(site)/messages`, `app/(site)/live`, `app/api/live`,
  `RealMessages`, `LiveChat`, `ChatInterface`, `lib/liveBroker.ts`,
  `lib/realtime.ts`, `lib/conversations.ts`, `lib/contacts.ts` + its test, and the
  `conversations` table in `supabase/schema.sql`. (A booking-scoped `messages`
  table was reintroduced later for the course chat.)
- Update `WHATSAPP_NUMBER` in `lib/whatsapp.ts` to change the number everywhere.

## Driver status: planning + derived "En course"

- **Two separate things.** `available` (the online/offline switch) is only ever
  about *right now*; the **weekly planning** (`lib/schedule.ts`, edited in
  `ProfileEditor`) is what gates bookings made in advance — and since every
  booking in Nova is scheduled, the planning is what actually matters.
- The planning is stored per driver (`driverOverrides.schedule`, `Driver.schedule`);
  `scheduleOf(driver)` resolves override → record → `DEFAULT_SCHEDULE` (no
  constraint). Mock drivers define none, so the demo is unchanged until a driver
  sets theirs.
- `DatePicker` takes a `schedule` prop: closed days are disabled (calendar +
  keyboard nav), the time field is bounded by the day's window and shows it, and
  an out-of-hours time raises the `outsideHours` notice. `BookingWidget`
  re-checks with `isWithinSchedule` on submit — a slot prefilled from the home
  search bar or the transfer estimate can bypass the picker entirely.
- **"En course" is derived, never stored** (`driverPresence` /
  `isRideInProgress` in `lib/bookings.ts`): a paid booking whose window contains
  now. A manually-toggled busy flag is one the driver forgets to switch off, and
  they then silently vanish from the platform. It outranks the manual switch and
  disables it in `AccountDashboard`, which reads the bookings from the SSE stream
  `DriverRequests` already opens (`onBookingsChange`) — no second connection, and
  the pill can never disagree with the ride list.

## Real-time bookings (course requests, client ↔ driver)

- **Flux : le client demande ET AUTORISE le paiement → le chauffeur accepte
  (capture) ou refuse (autorisation relâchée).** La carte est bloquée dès la
  demande (`capture_method: "manual"`), rien n'est débité tant que personne
  n'a pris la course.
  - `pending` ne veut plus dire « rien n'a bougé » : les fonds sont **déjà
    bloqués**. D'où le libellé « En attente — montant bloqué ».
  - Accepter mène **directement à `paid`** : `lib/paymentIntents.ts` capture,
    puis le statut change. ⚠️ Jamais l'inverse — marquer « payée » puis échouer
    à capturer laisserait une course réputée réglée que personne n'a payée, et
    un chauffeur qui roule pour rien. Un échec de capture répond 402 et laisse
    la course en `pending`.
  - Refus / annulation → `releaseBookingPayment`. ⚠️ **Ne jamais laisser une
    autorisation orpheline** : le client verrait une somme indisponible
    pendant des jours, sans transaction à contester — pire qu'un débit suivi
    d'un remboursement, parce que rien ne l'explique. (Stripe expire de
    lui-même une autorisation non capturée au bout de 7 jours : c'est le
    filet, pas la règle.)
  - `canActOn(actor, next, from)` prend l'état de **départ** : `pending → paid`
    est au chauffeur (il accepte), `confirmed → paid` au client. Sans ce
    `from`, un chauffeur pourrait marquer « payée » une course non réglée.
  - `confirmed` est **hérité** : il ne sert plus qu'aux réservations créées
    avant ce changement, qui attendent encore un paiement client. Le supprimer
    les aurait figées dans un état sans issue.
  Status machine in `lib/bookings.ts`: pending → paid|confirmed|refused|cancelled,
  confirmed → paid|cancelled, paid → completed|cancelled. `refused`/`completed`/
  `cancelled` are terminal. The driver closes a ride with "Course terminée";
  either side can "Annuler". Safety net: a paid ride auto-completes 24 h after its
  date (`shouldAutoComplete`), swept on every read of a driver room.
- Client clicks **Demander cette course** (`BookingWidget`, must be logged in) →
  `POST /api/bookings/[driverId]` creates a **pending** request (NO payment yet).
- **Client picks the exact date + time** in `BookingWidget` via the premium
  `DatePicker` (quick-chips + calendar + time chips; date defaults to today,
  prefilled from the home SearchBar via sessionStorage `jw_booking_date`).
  Validated client-side with `isFutureBooking` (no past dates); sent as `when`
  (ISO `YYYY-MM-DDTHH:mm`). Shown localised via `formatWhen` in `DriverRequests`
  + `ClientBookings`.
- Driver sees requests **live** on **`/compte/courses`** (dedicated page, `DriverCourses`
  → `DriverRequests`) and on the dashboard; Accept/Refuse via `PATCH`.
- Client follows status live on **`/compte/reservations`** (`ClientBookings`). When
  **confirmed**, a **Payer €X** button appears → `POST /api/checkout` (Stripe Checkout
  if `STRIPE_SECRET_KEY` set, else demo) → on success the booking is marked **paid**
  (`PATCH status:paid`, via `MarkPaid` on the Stripe return page, or directly in demo).
- Nav: drivers get "Mes courses", clients get "Mes réservations" in the account menu.
- Broker `lib/bookingBroker.ts` (salles par chauffeur, SSE) = copie vive ;
  durabilité dans `public.bookings` via `lib/persistence.ts` (§ Persistance).
  Logique pure + types dans `lib/bookings.ts`. Identité client :
  `clientIdOf()` dans `lib/clientBookings.ts` — il doit choisir **exactement**
  comme le serveur, sinon le filtre d'affichage ne correspond plus à ce que la
  session a écrit et la page se vide sans erreur.
- Unit-tested in `tests/bookings.test.ts` (23) + `tests/calendar.test.ts` (18). Verified live end-to-end:
  request → driver receives → accept → client pays → both see "Payée" without reload.


### Autorisation des réservations (identité serveur)

⚠️ **`PATCH /api/bookings/[driverId]` n'avait aucune autorisation** : il validait
le statut demandé puis l'appliquait, sans jamais vérifier *qui* demandait. Avec
un id de réservation, n'importe qui pouvait passer une course en `paid` sans
payer ou annuler celle d'un autre. Sans conséquence tant que tout était anonyme
et en mémoire ; inacceptable depuis que les comptes sont réels.

Deux règles distinctes, toutes deux nécessaires (`lib/bookings.ts`, pures et
testées dans `tests/bookingAuthz.test.ts`) :

- `canTransition(from, to)` — le changement est-il **cohérent** ?
- `bookingActor()` + `canActOn()` — est-il **légitime** ?

Accepter sa propre course ou la marquer payée sans payer sont des transitions
parfaitement valides pour la machine à états : seule la seconde règle les
arrête.

| Action | Qui |
|---|---|
| accepter / refuser / terminer | le chauffeur seul |
| payer | le client seul |
| annuler | les deux parties |

L'identité vient de `getServerUser()` (cookie de session), jamais du corps de la
requête — POST y prend aussi le nom et l'e-mail, qu'un client pouvait sinon
usurper dans les e-mails de confirmation. Un tiers et une partie qui outrepasse
son rôle reçoivent le **même** 403 : distinguer les deux révélerait l'existence
de la réservation.

**`profiles.driver_slug`** est le pont entre un compte chauffeur et sa fiche
publique de `lib/drivers.ts` — l'annuaire est encore constitué de données fixes,
sans compte associé. Il est posé par un administrateur : la garde
`profiles_protect_privileged` le verrouille comme `role` et `status`, sinon un
chauffeur s'attribuerait la salle de réservations d'un autre.

⚠️ **Mode démo préservé** : sans clés Supabase le serveur ne voit aucune session,
et ces contrôles se désactivent plutôt que de bloquer la démonstration.

## Persistance (réservations, messages, avis)

- **Les brokers ne sont plus la seule copie.** `lib/persistence.ts`
  (`server-only`) écrit et relit `bookings` / `messages` / `reviews` ; les
  brokers gardent la copie vive et le pub/sub SSE. Chaque salle est **relue au
  premier accès** puis tenue à jour **en écriture immédiate**. Un redémarrage
  n'efface plus l'historique d'un client, ses fils et ses avis.
- **Le temps réel ne traverse pas le process** : deux serveurs ne se verraient
  pas l'un l'autre. Assumé tant que le déploiement est une VM à un process ; le
  jour venu c'est Supabase Realtime qui remplacera le pub/sub, pas ce module.
- **Service role assumé.** Les routes vérifient déjà identité + légitimité et
  font autorité, donc elles écrivent avec le service role (comme `/admin`). La
  RLS ne saurait de toute façon pas exprimer la règle : un chauffeur y est
  désigné par un **slug d'annuaire en dur**, pas par une ligne qu'il possède.
  Les policies d'écriture destinées à un jeton utilisateur ont été retirées —
  elles ne protégeaient rien de plus et laissaient une seconde porte,
  directement sur PostgREST, contournant ces règles. La lecture reste ouverte
  aux parties.
- **`lib/dbRows.ts` est le mapping pur** (testé, `tests/dbRows.test.ts`, 17).
  Les trois pièges qu'il neutralise : `numeric` revient de PostgREST en
  **chaîne** (un total recopié tel quel casse toute comparaison) ; `Number("")`
  vaut **0**, donc une colonne vide passerait pour une course de zéro heure ;
  l'heure de prise en charge est **locale et sans fuseau** — elle est conservée
  telle quelle dans `when_local`, `start_at` ne servant qu'au tri.
- **Les identifiants viennent de Postgres.** Deux générateurs concurrents
  finiraient par désigner la même course sous deux ids, or le chat et les avis
  s'y rattachent. Les uuid passent `ROOM_RE` (36 car. ≤ 40), donc rien à changer
  côté validation. En démo, les ids `bk-…` d'origine sont conservés.
- **Migration** : bloc 4 de `supabase/schema.sql` (additif et rejouable), à
  appliquer avec `scripts/apply-schema.ps1`. Il ajoute `driver_slug` sur
  `bookings`/`reviews` — l'annuaire étant encore en dur, aucune clé étrangère
  vers `drivers` ne peut tenir — plus les colonnes que le domaine porte déjà
  (nom/e-mail client, unité, transfert, adresses).
- ⚠️ **Sans `SUPABASE_SERVICE_ROLE_KEY`, rien de tout cela ne s'active** :
  `isPersistenceEnabled` est faux et le comportement éphémère d'origine est
  conservé. Une écriture ratée est journalisée sans faire échouer la requête —
  perdre la course d'un client parce que la base a hoqueté serait pire que
  perdre sa durabilité.

## Véhicules, barème et paiements (bloc 5 du schéma)

- Tables `vehicles`, `pricing_rules`, `payments` + enum `payment_status`.
  ⚠️ **Ne pas recréer `driver_profiles` / `booking_messages`** : ce sont
  `drivers` et `messages`. Les enums `user_role`, `booking_status`,
  `vehicle_category` et le trigger `on_auth_user_created` existent déjà.
- **`pricing_rules` reflète `PRICE_BANDS`, il ne le remplace pas.** Le montant
  facturé reste calculé en TypeScript (`computeAmount` + `clampRate`, testés) :
  deux implémentations d'un même calcul divergent toujours, et c'est le montant
  facturé qui tranche. `tests/pricingParity.test.ts` lit `schema.sql` et échoue
  si le barème SQL et les constantes TS s'écartent — bornes, taux de
  commission, plafonds 1..24 h / 1..30 j.
- `calculate_booking_price()` reflète le même algorithme côté base (clamp dans
  la bande, forfait pour un transfert, frais client **ajoutés** au tarif course
  et commission **déduite** de ce même tarif, net du chauffeur par
  **soustraction**). Elle rend désormais `ride_fare` et `service_fee` en plus
  du total. Elle sert au chemin base de données ;
  `lib/actions/booking.ts` l'appelle en **contre-mesure** et journalise tout
  écart avec le calcul TypeScript au lieu de l'absorber.
- **`payments` ne stocke jamais le `client_secret`** — il autorise à lui seul
  la confirmation depuis le navigateur. `stripe_payment_intent_id` est `unique`
  (idempotence : Stripe fait autorité sur l'existence d'un paiement).
- **`vehicles` n'est pas en lecture publique** : la table porte la plaque
  d'immatriculation et Postgres n'a pas de RLS par colonne. La fiche publique
  est servie par l'API, qui choisit les colonnes.

## Server Action `createBooking` (`lib/actions/booking.ts`)

- Seule Server Action du dépôt ; tout le reste passe par des route handlers.
- **Elle n'insère pas dans `bookings` en direct** : elle appelle
  `bookingBroker.createBooking`, qui persiste **et** diffuse sur le SSE du
  chauffeur. Une insertion directe serait durable mais invisible — le chauffeur
  ne verrait la demande qu'au rechargement.
- Paiement en **autorisation/capture** : `capture_method: "manual"`, fonds
  bloqués à la demande, capturés à l'acceptation, relâchés sur un refus. C'est
  ce qui rend acceptable de demander la carte avant d'avoir une réponse.
  Coexiste avec `/api/checkout` (Checkout Session), qui reste le chemin câblé
  dans l'interface.
- Clé d'idempotence `booking:<id>` : une double soumission ne crée pas deux
  autorisations sur la carte.
- Le planning est lu depuis `driver.schedule` + `sanitizeSchedule`, **pas**
  `scheduleOf` — celui-ci lit le localStorage et ferait entrer un module de
  navigateur dans une action serveur.
- Sans clés Stripe ou sans service role : la course est créée, `mode: "demo"`,
  `clientSecret: null`.

## Messagerie de course (chat client ↔ chauffeur)

- **Scope: one thread per booking.** There is no free-form inbox — a conversation
  exists only because a ride exists, and it dies with it.
- **Lifecycle** (`chatStateFor` in `lib/chat.ts`):
  - `pending` / `confirmed` / `refused` → **locked** (a "chat opens once the ride
    is paid" notice; no stream is opened).
  - `paid` → **open** (both parties write).
  - `completed` / `cancelled` → **grace** : le fil reste **inscriptible 30 min**
    après la clôture (`CHAT_GRACE_AFTER_CLOSE_MS`), puis **archived** (historique
    lisible, envoi refusé en 409). L'archivage est aussi atteint 24 h après la
    date de la course.
- **UI**: a "Discuter" toggle on the booking card expands `BookingChat` inline —
  in `ClientBookings` (`/compte/reservations`) and `DriverRequests`
  (`/compte/courses` + dashboard). Bubbles grouped per sender, timestamps via
  `formatMessageTime`, Enter sends / Shift+Enter newlines, auto-scroll.
- **Transport**: SSE, `GET /api/chat/[bookingId]?as=<senderId>` → `snapshot` /
  `message` / `closed` events, 15 s heartbeat. `POST` to send (rate-limited
  30/min/IP, 1000 chars max, history capped at 200 messages/room).
- **Authorisation**: l'identité vient de `getServerUser()` (cookie de session),
  puis de `bookingActor()` — la **même** définition de « qui est cette personne
  pour cette réservation » que celle qui autorise les changements de statut, un
  chauffeur y étant reconnu par `profiles.driver_slug`. Le `?as=` de l'URL et le
  `senderId` du corps ne sont plus qu'un repli de démo : un id capturé ne donne
  plus accès au fil de quelqu'un d'autre. L'id écrit sur le message vient de la
  réservation (`clientId`/`driverId`), donc il ne peut pas diverger de celui que
  `BookingChat` compare pour distinguer ses propres bulles ; le nom affiché suit
  la session, sinon un participant légitime pourrait signer « Support Nova ».
  ⚠️ Sans clés Supabase, `participantRole()` reprend la main sur l'id fourni.
- **Closing**: `updateBookingStatus` and the auto-complete sweep both call
  `closeChat(bookingId)`, which pushes a `closed` event so open UIs flip to
  read-only without a reload.
- **Persistance** : `lib/chatBroker.ts` garde la copie vive et le pub/sub,
  `public.messages` la durabilité — historique relu au premier accès, écriture
  immédiate (voir § Persistance). Le broker reçoit les deux ids de la
  réservation : en base un message porte le **compte** de son auteur, alors que
  l'interface raisonne sur les parties de la course, et `rowToMessage` fait la
  traduction. Éphémère sans clé de service, comme avant.
- **Délai de grâce de 30 min** (`chatStateForBooking`, `chatClosesAt`,
  `graceMinutesLeft`) : l'essentiel de ce qui se dit entre un client et son
  chauffeur se dit **juste après la descente du véhicule** — objet oublié,
  facture, porte du hall. Couper le fil à la seconde où le chauffeur clôture
  renvoyait ces échanges vers WhatsApp, donc hors de la plateforme.
  ⚠️ L'échéance se calcule depuis `Booking.closedAt` (colonne
  `bookings.closed_at`, bloc 9) : sans elle on sait qu'une course est close,
  pas **depuis quand**. ⚠️ Une réservation close **avant** cette règle n'a pas
  de `closedAt` et retombe sur l'archivage immédiat d'origine — un
  `coalesce(closed_at, now())` rouvrirait des fils que leurs participants
  croient clos depuis des semaines.
- **Masquage des coordonnées** (`lib/chatMasking.ts`, pur, 15 tests) —
  anti-désintermédiation. Téléphones et e-mails (y compris `nom (at) domaine.fr`)
  sont remplacés par `***`.
  - ⚠️ **Le masquage a lieu avant la DIFFUSION, pas seulement avant
    l'insertion.** Posé uniquement en trigger `BEFORE INSERT`, la copie en base
    serait propre alors que le destinataire a **déjà reçu le numéro en clair**
    par le flux SSE : la règle ne protégerait plus rien, elle en donnerait
    seulement l'apparence. D'où l'appel dans `buildMessage()`, passage obligé du
    broker comme de la base. Le trigger SQL `mask_contact_details` (bloc 9) est
    le **filet** pour ce qui entrerait par une autre porte ; la version
    TypeScript fait foi pour ce qui est affiché, les deux doivent rester
    d'accord.
  - ⚠️ **Le `/` est exclu des séparateurs** : avec lui, « le 12/09/2026 14h »
    compte dix chiffres et se ferait masquer. Les parenthèses sont admises, avec
    **jusqu'à deux séparateurs d'affilée**, pour « +33 (0)6 12 34 56 78 » — avec
    un seul on affichait « +33 (*** », c'est-à-dire aucun masquage.
  - ⚠️ **Aucun lookbehind** (`(?<!…)`) : Safari ne l'admet qu'à partir de 16.4 et
    le refuse **à l'analyse**, ce qui casserait le bundle entier sur un iPhone un
    peu ancien. La borne gauche passe par un groupe capturé réinjecté.
  - Parti pris : **ne jamais masquer un faux positif** (prix, date, heure, numéro
    de vol, adresse), quitte à laisser passer les chiffres en toutes lettres et
    les pseudos. Un message mutilé pendant une course est un incident immédiat ;
    un numéro qui fuit est un risque commercial différé.
- **Réponses rapides** (`lib/chatQuickReplies.ts`, 5 tests) : jeu **fermé** de 4
  libellés chauffeur / 3 client (`chat.quick.*`), envoyés dans la langue de
  l'expéditeur. C'est une mesure de **sécurité routière** avant un confort — un
  chauffeur qui tape au volant lit son écran plusieurs secondes.
  ⚠️ Le serveur ne fait pas confiance au drapeau `isQuickReply` du navigateur
  pour composer le texte : le texte reste celui reçu, le drapeau n'est qu'une
  statistique d'usage. Sinon n'importe quel contenu passerait pour un libellé de
  la plateforme.
- **Accusés de réception** : `delivered_at` / `read_at` sur `messages`,
  `messageStatus()` → `sent` / `delivered` / `read` (une coche, deux, deux
  colorées). Poussés hors bande par un événement SSE `receipts`, donc sans
  réécrire l'historique ; `markRead` est appelé par le `GET` du participant
  d'en face et persisté.
- **`lib/useBookingChat.ts`** porte toute la logique navigateur. ⚠️ Il prend la
  **réservation résolue**, pas un `bookingId` : le cycle de vie du fil se déduit
  de la course, et la relire ici donnerait deux sources de vérité qui divergent
  le temps d'un aller-retour réseau (bandeau « course terminée » avec un champ
  de saisie encore actif). La réservation arrive du flux SSE que
  `ClientBookings` et `DriverRequests` tiennent déjà ouvert.
- i18n under `chat.*`. Tested in `tests/chat.test.ts` (17),
  `tests/chatGrace.test.ts` (15), `tests/chatMasking.test.ts` (15),
  `tests/chatQuickReplies.test.ts` (5).

## Certified reviews (avis certifiés)

- **A review exists only because a ride happened.** `canReviewBooking`
  (`lib/reviews.ts`) is the single rule: the booking must be **`completed`**,
  belong to the author (`booking.clientId`), and not already be reviewed —
  **one ride, one review**. The API and the form both call it, so the client can
  never be more permissive than the server.
- Entry point: a **"Laisser un avis"** button on a completed booking in
  `ClientBookings` (`/compte/reservations`) opening `ReviewForm` inline —
  1–5 stars + a 10–500 character comment.
- **The trip is derived from the booking, never typed**: a transfer names its
  route, anything else uses pickup → dropoff. ⚠️ The booking flow does not
  collect addresses, so `buildBooking` fills `DEFAULT_PICKUP`/`DEFAULT_DROPOFF`;
  `tripLabelFromBooking` returns `""` for those rather than publishing
  "Adresse de départ → Destination" as certified. Non-transfer reviews
  therefore carry no trip until addresses are captured.
- Display in `Reviews`: average + total, a "N avis certifiés" line, a
  `BadgeCheck` on certified rows, and **a real distribution** computed from the
  listed reviews (the previous bars were synthesised from the average).
  `ratingSummary` folds the driver record's history in by weight, so one review
  cannot swing an established reputation.
- API `app/api/reviews/[driverId]` (GET public list, POST publish, 5/min/IP),
  store `lib/reviewBroker.ts` (copie vive, `server-only`, 200/chauffeur),
  persisté dans `public.reviews` (voir § Persistance). La durabilité compte plus
  ici qu'ailleurs : un avis est le seul contenu que son auteur ne peut pas
  reproduire — il faudrait recommencer une course.
  L'auteur vient de la **session** (`getServerUser`), jamais du corps : « avis
  certifié » ne veut dire quelque chose que si seule la personne qui a
  réellement commandé ce chauffeur peut publier. Le nom signé suit l'auteur.
  ⚠️ Repli de démo sans clés Supabase, comme le chat.
  The production path is in `supabase/schema.sql` — `reviews.booking_id`
  is `unique`, RLS re-checks the completed-ride rule, there is no update/delete
  policy, and `refresh_driver_rating()` recomputes `rating`/`reviews_count` on
  every write so they cannot drift.
- Tested in `tests/reviews.test.ts` (25). Verified live: refusals on
  pending/other-client/too-short/duplicate, publication on a completed ride.

## Payments (Stripe — branch `stripe-test`)

### ⚠️ Chaque chauffeur fixe SES tarifs — statut d'annuaire

**Règle absolue, posée par le propriétaire le 2026-09-28** : le site ne doit
jamais imposer un prix commun aux chauffeurs. Imposer un tarif ferait de Nova
celle qui vend la course, pas celle qui référence des professionnels.

Ce qui a donc été **retiré** de `lib/pricing.ts`, et qu'il ne faut pas
réintroduire : `PRICE_BANDS`, `bandFor`, `PriceBand`, `isRateEditable`,
`hasFixedPricing`, `isRateInBand`. Les classes standard (Business/Moto/Van)
étaient figées à **120 €/h et 1 000 €/j** (bande de largeur nulle, champ en
lecture seule) et les premium encadrées entre 150–250 € et 1 500–3 000 €.

- `RATE_LIMITS` / `boundsFor(unit)` — garde-fous de saisie **identiques pour
  tous** (1–1 000 €/h, 1–10 000 €/j). Ce ne sont pas des tarifs conseillés :
  ils n'arrêtent qu'un zéro de trop. ⚠️ Les plafonds recopient les `check` de
  `public.drivers` ; les élargir ici seulement ferait passer le formulaire puis
  **échouer l'insertion**, ce qui se lit comme une panne.
- `isRateAcceptable(unit, value)` valide, `rateError(unit, value)` parle au
  formulaire (« Indiquez un tarif. », jamais « imposé » ni « votre gamme »).
- ⚠️ **`clampRate(unit, value)` n'invente jamais un prix** : un tarif absent,
  nul ou illisible rend **0**, qui se lit « non communiqué ». L'ancienne version
  remontait un 0 au plancher de la bande — un chauffeur validé sans avoir rempli
  son dossier était donc publié à 120 €/h, un prix que personne n'avait choisi
  et qu'un client pouvait réserver.
- **Corollaire : un tarif est obligatoire pour paraître.** `isListable`
  (`lib/driverDirectory.ts`) écarte une fiche sans tarif — de la liste **et** de
  sa page, qui répond 404 — exactement comme un profil non validé. Sinon elle
  s'afficherait à « 0 € ». La validation par un administrateur ne suffit pas à
  publier une fiche vide.
- ⚠️ **Changer de gamme ne touche plus aux tarifs** dans `ProfileEditor` :
  l'effet qui les recalait dans la bande de la nouvelle classe écrasait
  silencieusement le prix du chauffeur.
- Côté SQL, `pricing_rules` porte les **mêmes** garde-fous pour les cinq gammes,
  et `calculate_booking_price()` ne substitue plus `band.min_*` à un tarif
  manquant : elle lève. `tests/pricingParity.test.ts` échoue si une gamme
  redevient un prix unique (min = max) des deux côtés.
- ⚠️ **Reste à traiter** : `lib/transfer.ts` impose encore un forfait par classe
  (Berline 100 € / Van 150 € / Première 200 €), donc un prix plateforme. Voir la
  § Airport transfer.

Rates are **client prices TTC**. Week rates have no field: the profile shows a
WhatsApp CTA to support.

### Le barème : deux taux, deux bases (⚠️ ne pas les additionner)

Le **tarif course** (prix du chauffeur × quantité, ou le forfait de transfert)
est la base de tout. Deux prélèvements distincts s'y appliquent :

| | Taux | Base | Effet |
|---|---|---|---|
| Frais de service (`CLIENT_SERVICE_FEE_RATE`) | **+5 %** | tarif course | **ajoutés** — payés par le client |
| Commission (`PLATFORM_COMMISSION_RATE`) | **−15 %** | tarif course | **déduits** — supportés par le chauffeur |

`margePlateforme = frais client + commission`, jamais un troisième pourcentage.
⚠️ **Les deux taux ne font pas « 20 % »** : ils ne portent pas sur le même
montant et ne se lisent pas au même endroit. Une commission calculée sur le
*total client* prélèverait le chauffeur sur des frais qu'il n'encaisse pas —
c'est l'erreur que `tests/pricing.test.ts` et `tests/pricingParity.test.ts`
verrouillent explicitement des deux côtés (TS et SQL).

- `priceBreakdown(prixChauffeur)` (pur, testé) rend les six montants d'un coup.
  `clientTotal` est obtenu **par addition** et `driverNet` **par soustraction** :
  une facture doit valoir la somme de ses lignes, et le décompte du chauffeur
  retomber exactement sur son prix.
- **Tout est arrondi au centime** (`round2`), plus à l'euro : 5 % d'un tarif
  impair tombe sur une demie (170 € → 8,50 €). `buildBooking` et
  `bookings.total` (numeric(10,2)) suivent, et `formatPrice`/`formatAmount`
  (`lib/utils.ts`) n'affichent les centimes que lorsqu'il y en a.
- ⚠️ **Le détail n'est pas stocké** : une réservation ne garde que son total
  client, et `breakdownFromClientTotal` le redécompose à l'affichage. Des
  colonnes figées afficheraient l'ancien barème après un changement de taux.
- **Affichage** : le client voit *Tarif course* + *Frais de service plateforme
  (5 %)* + *Total* (`BookingWidget`, `ClientBookings`) ; le chauffeur voit
  *Prix proposé* + *Commission plateforme (15 %)* + *Votre revenu net*
  (`DriverRequests`, `ProfileEditor`). Chacun ne voit que ce qui le concerne :
  la commission n'apparaît pas au client (il ne la paie pas), les frais
  n'apparaissent pas dans le revenu du chauffeur (il ne les supporte pas).
- Stripe Checkout reçoit **deux lignes** (course + frais) : des frais fondus
  dans un montant unique se découvrent au relevé bancaire.

- Pure amount logic in `lib/payments.ts` (`computeBookingAmount`, `computeAmount`, `clampHours`, `clampDays`, euros→cents). Le barème est appliqué en **un seul endroit** (`billed()`), pour les trois unités : le transfert et la journée étaient restés à zéro frais quand l'heure en portait. `BookingAmount` rend `subtotal` (tarif course), `serviceFee`, `total` (client), `commission` et `driverNet`. Fully unit-tested (`tests/payments.test.ts`).
- `lib/stripe.ts` = server-only Stripe client (null if no key). `lib/config.ts`
  flags: `isStripeConfigured`, `isStripeLiveMode`.
- `POST /api/checkout` creates a Checkout Session. **Amount is computed
  server-side from the trusted driver price** — a client-supplied `amount` is
  ignored (anti price-tampering). Rate-limited (10/min/IP). Apple Pay & Google
  Pay appear automatically in Stripe Checkout.
- No key → returns `{ mode: "demo", amount }` and `BookingWidget` shows the
  simulated confirmation. With `sk_test_…` → real test Checkout (test cards),
  redirect to `/compte/reservation?status=success`.
- **Payment methods** (`components/PaymentDialog.tsx`): the client "Payer €X"
  button in `ClientBookings` opens a sheet to pick **Carte (Stripe) ·
  Crypto · Espèces**. Card → `/api/checkout` (Stripe or demo). Crypto/Cash
  have no backend keys → simulated in demo, then the booking is marked **paid**
  (cash = settled directly with the driver). i18n under `pay.*`.
- To enable: put `STRIPE_SECRET_KEY=sk_test_…` in `.env.local`, restart.

### ⚠️ Pas de règlement sans dispositif d'encaissement

`captureBookingPayment` répond **`true` quand il n'y a rien à capturer** — c'est
voulu, pour que l'absence de Stripe ne bloque pas la démo. Conséquence sur des
comptes réels : une course passait `paid` **sans qu'un centime ne circule**,
aussi bien à l'acceptation du chauffeur (`pending → paid`) qu'au clic « Payer »
du client (espèces, crypto, ou carte sans clé), et l'e-mail « paiement reçu »
partait. Une course gratuite à la demande.

`isSettlementAllowed` (`lib/payments.ts`, pur, testé) tranche :

| Stripe | Comptes réels | Règlement |
|---|---|---|
| clé `sk_…` | oui | **autorisé** |
| aucune | non (démo) | **autorisé** — c'est ce que la démo démontre |
| aucune | **oui** | **refusé** |

⚠️ Le critère est « Stripe absent **alors que** les comptes sont réels », pas
« mode démo » : la démo sans clés a besoin du paiement simulé, et deux vraies
personnes ont besoin du contraire.

- **Le dernier mot est au serveur** : `PATCH /api/bookings/[driverId]` refuse
  toute transition vers `paid` en **503** (rien n'est reproché à l'appelant,
  c'est la plateforme qui n'est pas en état d'encaisser). Le contrôle est placé
  **après** l'autorisation, pour ne pas révéler l'existence d'une réservation à
  un tiers.
- **`isSettlementOperative` (`lib/config.ts`) applique la règle en un seul
  endroit**, et les trois pages serveur de `/compte` la descendent en prop
  (`settlementAllowed`) vers `ClientBookings`, `DriverCourses` et
  `AccountDashboard`. ⚠️ Prop **obligatoire**, jamais un défaut permissif : un
  appelant qui l'oublie ne produirait pas d'erreur, il rouvrirait le règlement
  gratuit. ⚠️ Et jamais lue dans un composant client : `isStripeConfigured`
  dépend d'une variable sans `NEXT_PUBLIC`, donc le navigateur la verrait
  toujours fausse et bloquerait le paiement sans raison.
- Côté interface, « Accepter » se désactive avec sa raison et « Payer » cède la
  place à un signalement ambre — **signalé, pas masqué** : une course qui
  attend son règlement doit rester lisible comme telle.
- ⚠️ **Ce que ça ne corrige pas** : le parcours câblé ne prend **aucun**
  paiement avant `paid`. `BookingWidget` poste sur `/api/bookings/[driverId]`,
  qui crée une course `pending` **sans intention de paiement** ; l'autorisation
  à la demande n'existe que dans la Server Action `createBooking`, qui n'est
  branchée sur aucun bouton. Le bouton « Payer » de `ClientBookings`, lui, ne
  s'affiche que pour un statut `confirmed` — que plus rien ne produit. Poser
  une clé Stripe rend donc le règlement *permis*, pas *effectif* : il reste à
  brancher l'un des deux chemins sur l'interface.

## Airport transfer & Contact

- **Airport transfer / private chauffeur** (`/transfert-aeroport`): marketing +
  conversion landing. Hero with premium image + trust badges (24/7, pros,
  secure payment, instant booking, flexible cancellation), 6 service features
  (book before arrival, terminal pickup, real-time flight tracking, name-sign
  welcome, luggage assistance, e-mail/SMS confirmation),
  an **instant price estimate** (`TransferEstimate`) and a stylised
  **pickup-zones map** (`TransferPickupMap`). Homepage shows a
  teaser section + a "Réserver un transfert" CTA in the hero.
- Estimate logic is pure in `lib/transfer.ts` (`estimateTransfer`, airports,
  zones, vehicles) — no backend; the "Réserver" CTAs route to `/drivers`.
- **Contact** (`/contact`): `ContactForm` with nom/prénom, e-mail, téléphone,
  type de demande, message. Client-side validation (required fields + email
  regex) and an animated success confirmation. **Demo mode**: the send is
  simulated (no e-mail backend wired). Both pages are fully bilingual
  (`contact.*` / `transfer.*` in `lib/dictionaries.ts`).

## Adresses : autocomplétion (départ / arrivée)

`lib/places.ts` (pur, testé), `app/api/places/route.ts` (proxy),
`components/AddressAutocomplete.tsx` (combobox accessible).

- **Le navigateur n'appelle jamais le fournisseur**, il appelle `/api/places`.
  Trois raisons : la CSP n'a **rien à ouvrir** (`connect-src 'self'` suffit —
  ajouter `maps.googleapis.com` l'élargirait pour tout le site) ; la clé reste
  serveur ; le fournisseur devient interchangeable.
- **Google si `GOOGLE_MAPS_API_KEY` est posée, sinon Mapbox** (déjà configuré
  pour la carte). ⚠️ Sans aucune clé, la route répond `configured: false` et le
  champ redevient une **saisie libre** — on ne bloque pas une réservation parce
  qu'une API tierce manque. Une adresse tapée à la main reste valide.
- ⚠️ **Les réponses arrivent dans le désordre.** Chaque requête porte un numéro
  de séquence ; une réponse plus ancienne que la dernière affichée est jetée.
  Sans ça, taper vite fait remonter les suggestions d'un préfixe précédent.
- ⚠️ `onMouseDown` et non `onClick` sur une suggestion : le blur du champ
  fermerait la liste avant que le clic n'arrive.
- **Où les adresses se saisissent** : dans `BookingWidget` uniquement, sur la
  fiche du chauffeur, au moment de réserver. C'est ce qui permet au **bon de
  réservation** d'être émis — sans elles, `buildBooking` retombe sur ses
  libellés par défaut, que `missingVoucherFields` compte comme manquants (voir
  § Bon de réservation).
  ⚠️ **`SearchBar` ne les demande plus** (retirées de la carte d'accueil à la
  demande du propriétaire). Elle n'écrit donc plus `jw_booking_pickup` /
  `jw_booking_dropoff` mais les **efface** à la soumission : un onglet ouvert
  avant ce changement en garde une valeur en `sessionStorage`, qui
  préremplirait la course d'une adresse que le client n'a jamais tapée.
  Plus rien ne les écrit désormais : la lecture que `BookingWidget` en fait est
  un préremplissage devenu sans source, gardé pour le jour où un formulaire
  amont les reposera.

## Une seule prestation : la course VTC (et la qualification CNAPS)

⚠️ **Nova Compagnie ne vend, et ne peut vendre, qu'une prestation de transport.**
La société n'a pas d'autorisation d'exercer délivrée par le CNAPS, et l'article
**L612-2 du Code de la sécurité intérieure** interdit d'exercer **comme de
commercialiser** une activité de sécurité privée sans elle. La plateforme
encaissant la totalité du montant et éditant la facture (modèle centrale de
réservation), vendre un trajet « avec protection » y serait un exercice
illégal — quelle que soit la qualification du chauffeur qui l'exécute.

Ce qui reste licite, et ce que fait le code : **qualifier un profil**. « Ce
chauffeur est titulaire d'une carte professionnelle CNAPS, que nous avons
vérifiée » décrit une personne, comme ses années d'expérience ou ses langues.

`lib/cnaps.ts` (pur, testé) porte la règle. Une seule colonne :
`drivers.cnaps_verified` — bloc 8 de `schema.sql`.

### Ce qui a été retiré, et qu'il ne faut pas réintroduire

Un axe « second métier » a existé dans ce dépôt (`lib/serviceType.ts`, colonnes
`is_vtc`/`is_security`, bascule `[VTC | Protection Rapprochée]` dans
`SearchBar` et `DriversExplorer`, section d'accueil `CloseProtection`, opt-in
« proposer des prestations de protection » dans le tunnel et `ProfileEditor`,
clés i18n `service.*`). Tout cela **commercialisait** l'activité : retiré.

- ⚠️ Pas de sélecteur de prestation, pas de filtre « sécurité », pas de forfait
  ni de ligne de facture « protection ». Le bloc 8 n'ayant **jamais été
  appliqué**, il a été réécrit plutôt que corrigé par une migration : le schéma
  ne porte plus la trace de l'offre.
- ⚠️ `missingRequired(docs)` ne prend **plus** de drapeau `security`. Aucune
  pièce n'est conditionnellement obligatoire ; `tests/cnaps.test.ts` échoue si
  un tel drapeau réapparaît dans `DOCUMENT_LABELS` — c'est le signal qu'une
  seconde prestation est en train de revenir.
- Le rouvrir suppose soit l'autorisation d'exercer CNAPS (dossier société,
  dirigeant déclaré), soit un contrat de sous-traitance avec une société agréée
  qui **facture elle-même** la prestation. C'est une décision juridique, pas un
  booléen de plus.

### Ce qui reste : le badge

- **`cnaps_verified` n'est jamais écrit par le chauffeur.** Deux verrous, comme
  pour `role`/`driver_slug` : le trigger `drivers_protect_cnaps` annule toute
  écriture faite sous `auth.uid()`, et `refresh_cnaps_verified` **recalcule** la
  colonne depuis le statut de la carte déposée (même parti pris que
  `refresh_driver_rating` : une seule source de vérité). Redéposer une carte la
  remet en attente, donc retire aussitôt le badge de la fiche publique.
  `/api/driver/profile` n'accepte **aucune** déclaration de prestation.
- **La carte passe par `driver_documents`** (`kind` `cnaps_card`), pas par une
  colonne `cnaps_card_url` : le bucket `driver-docs` est privé et **aucune URL
  publique n'est jamais produite** pour une pièce — voir § Pièces
  justificatives. Elle est **facultative** et toujours proposée au dépôt.
- ⚠️ **L'ajout de `'cnaps_card'` à l'enum est isolé dans `2-enums.sql`** —
  `refresh_cnaps_verified()` l'emploie, et Postgres refuse une valeur d'enum
  dans la transaction qui l'ajoute. `compose-schema.ps1` le repère par son
  marqueur et le **retire** du bloc 3.
- ⚠️ **Le libellé compte.** « Carte CNAPS vérifiée », jamais « Certifié Nova »
  ni « Agent de protection agréé » : le CNAPS délivre la carte, la plateforme
  constate seulement qu'elle existe. Un badge qui ferait certifier Nova serait
  faux, et se lirait comme une offre.
- **Interfaces** : badge sur `DriverCard` et encart sur la fiche
  `/drivers/[id]` — avec la mention qui rappelle que la réservation porte sur
  une course de transport ; état en **lecture seule** dans `ProfileEditor` ;
  dépôt facultatif à l'étape 3 du tunnel. i18n sous `cnaps.*`. `/legal/mentions-legales`
  porte la mention « Nature de l'activité ». Testé dans `tests/cnaps.test.ts` (7).

## Bon de réservation préalable (PDF)

`GET /api/booking/[id]/pdf` rend le bon de réservation d'une course.
Trois modules : `lib/bookingVoucher.ts` (domaine pur, testé),
`lib/pdf/bookingVoucher.tsx` (rendu, `server-only`), `lib/voucherSource.ts`
(lecture en base, `server-only`).

- **Le générateur sait REFUSER.** `missingVoucherFields` liste ce qui manque et
  `renderBookingVoucher` lève plutôt que d'émettre. Un document au bon format
  mais dont l'itinéraire dit « Adresse de départ » a **l'apparence** de la
  conformité : il n'est contesté qu'au moment du contrôle. La route répond 409
  avec la liste des mentions manquantes, en français.
- ⚠️ **Les adresses par défaut comptent comme manquantes.** `DEFAULT_PICKUP` /
  `DEFAULT_DROPOFF` sont des chaînes **non vides** : elles passent tout test de
  présence et s'impriment telles quelles. C'est le contrôle le moins évident du
  module.
- **Numérotation déterministe** (`NOVA-<année>-<5 car.>`) dérivée de l'id de
  réservation : un bon se réimprime, et deux numéros pour une même course
  seraient indéfendables. L'année vient de la **réservation**, pas de
  l'horloge. L'alphabet exclut O/0/I/1 — ce numéro est recopié à la main.
- **Autorisation** : parties de la course uniquement, via `bookingActor()`
  (même définition que le chat). Un tiers reçoit le **même 404** qu'une
  réservation inexistante. Statuts `paid`/`completed` seulement : le bon porte
  « Payé à l'avance », l'émettre pour une course `pending` (fonds seulement
  **autorisés**) serait faux. Limité à 10/min/IP — un PDF coûte du CPU.
- `lib/voucherSource.ts` lit avec le **service role**, et pas par confort :
  aucune session ne peut voir à la fois le SIREN du chauffeur, la plaque
  (`vehicles`, RLS propriétaire) et le téléphone du client (`profiles`). Il ne
  contrôle **aucune identité** — l'exposer sans `bookingActor()` publierait les
  coordonnées des deux parties.
- ⚠️ **`@react-pdf/renderer` supprime en silence les glyphes absents de
  Helvetica** : `€` et `—` disparaissent du PDF sans erreur. D'où « EUR » et un
  tiret ASCII. `tests/bookingVoucherPdf.test.ts` **relit le texte imprimé**
  (décompression du flux) — seul garde-fou contre une omission invisible.
  ⚠️ Ces tests tournent en `// @vitest-environment node` : sous jsdom, le
  binaire produit est **corrompu** tout en gardant un en-tête `%PDF-` valide.
- `serverComponentsExternalPackages: ["@react-pdf/renderer"]` dans
  `next.config.js` — bundlé, il perd la résolution de ses polices, et
  **seulement en production**.
- **SIREN/SIRET** : colonne `drivers.siret` + saisie à l'étape 1 du tunnel,
  validée par la clé de Luhn des deux côtés (`isValidSiren`). Un numéro refusé
  laisse la colonne nulle plutôt que d'écrire une valeur invalide.

## Emails (booking confirmations)

- Transactional emails via **Resend REST API** (no SDK) in `lib/email.ts`
  (`server-only`). Flag `isEmailConfigured` (needs `RESEND_API_KEY=re_…`).
  Graceful: without a key, sends are skipped and the booking flow still works.
- Templates: `bookingRequestEmail` (client requests), `bookingConfirmedEmail`
  (driver accepts → pay now), `paymentReceivedEmail` (paid). Sent from the
  `POST`/`PATCH` handlers of `app/api/bookings/[driverId]/route.ts` to the
  booking's `clientEmail` (carried from the session; `BookingWidget` sends
  `user.email`). Real client emails require Supabase auth OR a demo account
  email set in `lib/demoAccounts.ts`.
- Enable: `RESEND_API_KEY` + verified `EMAIL_FROM` domain in `.env.local`.

### Deux systèmes d'e-mail, à ne pas confondre

| | Ce qui part | Où ça se règle |
|---|---|---|
| **API Resend** | chauffeur validé, demande / confirmation / paiement de course | `RESEND_API_KEY` + `EMAIL_FROM` dans `.env.local` (`lib/email.ts`) |
| **SMTP Supabase** | confirmation d'inscription, mot de passe oublié | dashboard Supabase → Auth → SMTP (`smtp.resend.com:465`, user `resend`, pass = la clé API) |

Renseigner la clé API ne réactive **pas** la confirmation d'inscription : celle-ci
part de Supabase, qui a besoin d'identifiants SMTP. Les deux viennent du même
compte Resend, mais se configurent à deux endroits différents.

⚠️ **Tant qu'aucun domaine n'est vérifié chez Resend, l'envoi n'est autorisé que
vers l'adresse du titulaire du compte** — un alias `+quelquechose` est refusé
(403 `validation_error`). `sendEmail` renvoie alors `false` et la validation d'un
chauffeur répond `emailed: false` : ce n'est pas un bug, c'est le rapport fidèle
d'un envoi refusé. Vérifier `novacompagnie.com` dans Resend (SPF + DKIM), puis
basculer `EMAIL_FROM` et `smtp_admin_email` sur ce domaine.

`mailer_autoconfirm` reste à `true` (confirmation d'inscription coupée) tant que
le domaine n'est pas vérifié : sinon un visiteur quelconque ne recevrait jamais
son lien et resterait bloqué à l'inscription.

## Deployment workflow

- Local dev → `./deploy.sh` (build locally first; aborts if it fails). The script also
  **starts the VM if it's deallocated**, ships a tarball, runs `npm ci && npm run build`
  on the VM, restarts the `lumecar` service, and curls the HTTPS URL to confirm.
- Manual fallback steps: see "Azure deployment" below.

## Environment variables

| Var | Scope | Purpose |
|-----|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Privileged ops (account deletion). NEVER expose to browser. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | public | Mapbox token (`pk....`) |
| `STRIPE_SECRET_KEY` | **server only** | Stripe Checkout. `sk_test_…`=test mode (no real charge), `sk_live_…`=prod. Empty=demo flow. |
| `RESEND_API_KEY` | **server only** | Resend API key (`re_…`) for booking confirmation emails. Empty = emails skipped (demo). |
| `EMAIL_FROM` | **server only** | Sender for emails, verified domain in Resend (e.g. `Nova Compagnie <reservations@novacompagnie.com>`). |

Empty/placeholder → demo mode. Flags in `lib/config.ts` decide behaviour at
runtime; never hard-require a key.

## Architecture principles (IMPORTANT)

1. **Graceful degradation everywhere.** Every integration (Supabase, Mapbox,
   live chat persistence) has a working fallback. Adding a feature must not
   break the no-keys demo. Gate real paths behind `isXConfigured` flags.
2. **Server/client boundary.** Secrets live in `serverEnv` (no `NEXT_PUBLIC`).
   `lib/supabase/admin.ts` imports `server-only` so it can never leak into a
   client bundle. API routes verify identity from the **session cookie**, never
   from client-supplied ids.
3. **Route groups** separate chrome: `(site)` has Navbar/Footer/CookieConsent;
   `auth/` is full-screen.

## GDPR / EU compliance

- **Cookie consent** (`CookieConsent` + `lib/consent.ts`): no non-essential
  cookies before opt-in; versioned, timestamped, withdrawable.
- **Legal pages** under `/legal/*` (privacy, terms, cookies, mentions légales).
- **Data-rights centre** `/legal/mes-donnees`: export (JSON) + erasure +
  consent management. Wired to `/api/account/*` when Supabase is configured,
  local/demo otherwise.
- **Schema** (`supabase/schema.sql`): RLS on all tables, `consents` registry,
  `audit_log`, and `delete_my_account()` security-definer RPC scoped to
  `auth.uid()`. Service-role deletion via `auth.admin.deleteUser`.
- **Booking date/time** is processing necessary for the service (Art. 6(1)(b));
  no extra consent. The home-search date prefill uses sessionStorage
  `jw_booking_date` — strictly-necessary functional storage (no tracking,
  cleared on tab close), so it needs no consent. ⚠️ Les réservations, messages
  et avis sont désormais **persistés** (§ Persistance) : ils entrent donc dans
  le périmètre de l'export et de l'effacement RGPD — `delete_my_account()`
  s'appuie sur les `on delete cascade` depuis `profiles`, à revérifier si la
  route d'export doit les inclure.

## Internationalisation (FR / EN)

- Client-side bilingual system: `lib/i18n.tsx` (`I18nProvider` in root layout,
  `useI18n()` → `{ lang, setLang, t }`) + `lib/dictionaries.ts` (typed FR + EN).
- Default language = visitor's **browser language**, then persisted in
  localStorage `lumecar_lang`. Same URL for both languages (no `/fr` `/en`
  routing) — `LanguageSwitcher` dropdown in the navbar flips it instantly.
- `t("section.key")` looks up the active lang, falls back to FR, then the key.
- Translate UI strings via the dictionary — don't hardcode user-facing text in
  components. EN object must match the FR shape (typed as `Dict`).

## Security posture (OWASP-aware)

- **`profiles` n'est plus en lecture publique.** La policy `profiles_select`
  était `using (true)` ; depuis que la migration back-office a ajouté la colonne
  `email`, cela exposait l'adresse et le rôle de **tous** les comptes à quiconque
  possède la clé anon — publique par conception, embarquée dans le bundle. Elle
  est passée à `using (auth.uid() = id)`. Rien n'en dépendait : `/admin` lit avec
  le service role (qui contourne la RLS) et tout le reste ne consulte que sa
  propre ligne. Un annuaire public devra s'appuyer sur `drivers`, qui garde sa
  policy de lecture ouverte. ⚠️ Ne pas réintroduire un `select("*")` sur
  `profiles` avec une session utilisateur en croyant lire les autres.
- Security headers in `next.config.js` (`X-Frame-Options`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, **`Content-Security-Policy`** scoped
  for Mapbox/Stripe/Supabase, HSTS); `X-Powered-By` removed.
- RLS enforces per-user/row access in Supabase.
- Auth: password `minLength=8`, proper `autoComplete`, server-side identity.
- Input validation/sanitisation on the public live API.
- No `dangerouslySetInnerHTML`; image hosts allow-listed (anti-SSRF).

## iOS Safari / mobile conventions

- Use `min-h-screen-dvh` / `h-screen-dvh` (NOT `vh`) to avoid the address-bar jump.
- Safe-area helpers: `.pt-safe`, `.pb-safe`, `.top-safe` (notch/home indicator).
- Inputs forced to 16px under 640px (`globals.css`) to stop focus auto-zoom.
- `viewportFit: "cover"` + apple-web-app meta in `app/layout.tsx`.
- **Flex truncation gotcha:** a truncating `<p>` inside a flex row needs
  `min-w-0 flex-1`, otherwise siblings (time/badge) get clipped.

## UI / design system

- **Sober, premium "businessman" palette** (`tailwind.config.ts`): warm graphite
  `ink` surfaces, muted **champagne/bronze** accent (the `royal` scale was
  re-tuned from blue → champagne, so every existing `royal-*` usage follows
  automatically), `gold` refined to champagne for ratings. Primary button is a
  champagne fill with dark ink text. Animations `fade-up`, `pulse-ring`,
  `float`; `shadow-glow` (warm)/`card`.
- CSS component classes in `globals.css`: `.glass`, `.glass-strong`, `.btn-primary`,
  `.btn-ghost`, `.btn-white`, `.chip`, `.input`, `.section-eyebrow`,
  text gradients, `.prose-legal`.
- Animations: wrap sections in `<Reveal>`; respect existing easing
  `[0.22, 1, 0.36, 1]`. Shared motion tokens live in `lib/motion.ts`
  (springSoft/Snappy, reveal, popover, stagger). Direct interaction = spring,
  reveals = ease-out. Buttons have a tactile `active:scale-[0.97]`.
- **Apple-grade motion**: `(site)/template.tsx` adds a subtle page transition
  (fade + rise) on every route; hero testimonials use a stagger reveal.
- **Accessibility**: `prefers-reduced-motion` is honoured globally in
  `globals.css` (animations/transitions collapsed) AND via `useReducedMotion()`
  in JS components (DatePicker, template) — fade-only fallback, no transform.

## Mock data

> **Scope: Paris only.** The app is currently limited to Paris — all other
> cities (London, Barcelona, New York) have been removed from the data,
> dictionaries, footer, globe and airports. Re-add them in `lib/cities.ts`,
> `lib/geo.ts`, `lib/transfer.ts`, `lib/drivers.ts` and the dictionaries to
> expand again.

### ⚠️ L'annuaire est VIDE — ne pas le repeupler

`lib/drivers.ts` contenait 5 chauffeurs parisiens inventés (nom, photo,
véhicule, note **et avis clients fabriqués**). Ils ont été retirés : présenter
de faux professionnels et de faux avis sur un site marchand où l'on peut
réserver relève de la pratique commerciale trompeuse (directive Omnibus), et un
bandeau « démonstration » n'y change rien.

Ce qui a disparu avec eux, et pourquoi il ne faut pas le remettre :

- les 5 profils + leurs avis (`getDriver` / `driversByCity` renvoient
  désormais `undefined` / `[]` — les appelants itèrent sans garde, d'où le
  tableau vide plutôt qu'`undefined`) ;
- `city.driversCount: 248` → **dérivé** de l'annuaire réel dans `CityShowcase`
  (« Bientôt disponible » quand personne n'est inscrit) ;
- les 6 témoignages clients inventés des dictionnaires (`hero.*`,
  `transfer.*`) et `AuthQuote.tsx` — tous déjà orphelins côté rendu ;
- le lien `driverId` du compte démo `driver`/`driver`, qui pointait vers
  `jeremy-driver`.

**Les seuls avis publiables sont ceux que `lib/reviews.ts` certifie** :
rattachés à une course réellement terminée, par son client.

Conséquences assumées : `/drivers` affiche un état vide dédié
(`drivers.emptyTitle`, distinct du « aucun résultat » des filtres),
`generateStaticParams` ne produit aucune page, un ancien id renvoie 404, et
l'estimation de transfert compte zéro chauffeur par classe.

**Les tests utilisent `tests/fixtures/drivers.ts`** — ils vérifient des
fonctions pures (tarifs, transferts, surcharges), pas des données marketing.
Ne pas les faire lire l'annuaire réel : ils deviendraient dépendants du contenu
de la base.

### La vraie source : `public.drivers` (bloc 6 du schéma)

**`lib/driverDirectory.ts` (`server-only`) est le seul lecteur de l'annuaire.**
`listDirectory()`, `getDirectoryDriver(slug)`, `listDirectorySlugs()`.

- ⚠️ **Il lit avec le service role, et ce n'est pas un raccourci.** `drivers`
  est en lecture publique, mais le **statut de validation vit dans
  `profiles`**, que la RLS réserve à son propriétaire. Une lecture anon sur
  `drivers` seule publierait donc les chauffeurs **en attente de validation** —
  exactement ce que la validation sert à empêcher. Ne pas « simplifier » ça.
- `Driver.id` porte le **slug**, pas l'uuid : c'est l'identifiant que les URL,
  les réservations, le chat et les avis manipulent déjà.
- Les tarifs sont re-bornés **à la lecture** (garde-fous de saisie, pas un
  barème), et `isListable` écarte une fiche **sans tarif** : la plateforme
  n'impose aucun prix et n'en invente aucun. Voir § Payments.
- Sans clé de service, l'annuaire est vide plutôt qu'en erreur.

**Le parcours d'un chauffeur** : inscription (`role=driver`, `status=pending`)
→ **tunnel d'onboarding `/compte/onboarding`** en trois étapes (profil + permis
+ carte VTC · véhicule + immatriculation · pièces justificatives) → un admin
valide dans `/admin` → `approve_driver()` crée la ligne d'annuaire, attribue le
slug et pose `profiles.driver_slug`, **dans une seule transaction**.

Le tunnel enregistre à chaque étape (`onboarding_step`), donc un dossier
interrompu se reprend. `/compte/profil` reste l'édition ultérieure.

**Pièces justificatives** (`driver_documents` + bucket `driver-docs`) :

- ⚠️ **Le bucket doit être créé PRIVÉ**, le SQL ne pouvant pas le faire sur une
  instance hébergée. Deux chemins : le dashboard (Storage → New bucket →
  `driver-docs` → Public : OFF), ou l'API Storage avec la clé de service
  (`POST /storage/v1/bucket`, `{"name":"driver-docs","public":false}`).
  ✅ Déjà créé sur le projet `goayrdtgblpczbcojkaq` (privé, plafond 8 Mo, MIME
  restreints aux JPEG/PNG/WebP/PDF). Aucune policy Storage : les dépôts passent
  par le service role côté serveur, jamais par la clé anon — en ajouter une
  ouvrirait un accès direct qui ne passerait par aucune vérification.
- Les fichiers **ne partent jamais directement** du navigateur : tout transite
  par `POST /api/driver/documents`, qui vérifie session, rôle, type MIME et
  poids (8 Mo). Un dépôt direct n'aurait que les règles que Storage sait dire.
- ⚠️ **Aucune URL publique n'est jamais produite.** Une pièce d'identité
  derrière une URL publique reste accessible à qui obtient le lien (journal,
  partage d'écran, `Referer`). La consultation admin passera par une URL signée
  à durée de vie courte.
- Le chemin vient du compte + du type, **jamais du nom de fichier envoyé** :
  un nom contrôlé par l'appelant permet `../` ou d'écraser la pièce d'un autre
  (`documentPath`, testé).
- Redéposer **remplace et remet en attente d'examen** : sinon il suffirait de
  faire valider un document propre puis de le remplacer.
- Règles partagées client/serveur dans `lib/driverDocuments.ts` (pur, 14 tests).

⚠️ Cette transaction est indivisible pour une raison précise : un slug posé sur
`drivers` sans son pendant sur `profiles` donnerait un chauffeur visible
publiquement mais incapable d'accepter la moindre course — `bookingActor()` ne
le reconnaîtrait pas. Une panne qu'on ne découvre qu'à la première réservation.

**Ce que le chauffeur ne décide pas** : son slug (ce serait choisir la clé qui
l'autorise sur une salle de réservations — il pourrait prendre celle d'un
autre), son statut, ni un tarif hors bande (`clampRate` est le dernier mot du
serveur).

**Pages** : `/drivers` est `force-dynamic` et lit côté serveur, puis passe la
liste à `DriversExplorer` (client, il ne peut pas interroger la base).
`/drivers/[id]` pré-génère les fiches validées et rend les suivantes à la
demande — un chauffeur validé après le build doit être joignable sans
reconstruction. Un profil non validé répond 404.

⚠️ **Reste en dur** : les composants client qui n'ont pas de page serveur pour
les alimenter (`AccountDashboard`, `DriverRequests`, `ClientBookings`,
`TransferEstimate`) lisent encore `lib/drivers.ts`, donc rien. Ils n'en tirent
que des noms d'affichage et retombent sur des libellés génériques.

## Testing UI on a real mobile viewport

The integrated VS Code browser ignores `setViewportSize`. To emulate iPhone,
create a fresh Playwright context:
`browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, userAgent:"…iPhone…" })`.
Use `.tap()` (not `.click()`) — Framer Motion rows can make `.click()` hang.

## Gotchas / lessons

- Type the `@supabase/ssr` cookie `setAll` param explicitly (`CookieOptions[]`)
  or strict TS build fails.
- SSE routes need `export const dynamic = "force-dynamic"` and `runtime = "nodejs"`.
- `useSearchParams()` pages must be wrapped in `<Suspense>`.
