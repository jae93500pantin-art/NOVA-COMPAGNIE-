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
    callback/route.ts         OAuth return URL: exchangeCodeForSession + sync `profiles`, then redirect back (?next=)
  api/
    account/route.ts          DELETE → RGPD account erasure (service role)
    account/export/route.ts   GET → RGPD data export (JSON)
    checkout/route.ts         POST → Stripe Checkout session (test/live) or {mode:"demo"} fallback. Amount computed server-side.
    bookings/[driverId]/route.ts  SSE (GET) live course requests + POST create + PATCH accept/refuse/complete/cancel
    chat/[bookingId]/route.ts     SSE (GET) per-booking chat + POST send. Participants only, open only while paid.

components/                   All client components unless noted
  Navbar                      Front bar = logo (Nova Compagnie) + "Réservation" (→ /drivers) + "Transfert Aéroport" + "Contact" links + CitySwitcher + LanguageSwitcher + account dropdown/login. Account dropdown has a **WhatsApp contact** link (messaging feature removed).
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
  GoogleButton                "Google" OAuth button (official G logo) → supabase.auth.signInWithOAuth({provider:"google"}) → /auth/callback
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
  chat.ts                     Chat domain: ChatMessage, chatStateFor/chatStateForBooking (locked|open|archived), canSendMessage, participantRole, buildMessage, formatMessageTime. Pure, unit-tested.
  chatBroker.ts               In-memory per-booking chat rooms + SSE pub/sub (postMessage, subscribeChat, closeChat, dropChat). Mirrors bookingBroker.
  transfer.ts                 Airport-transfer domain data (Paris airports, Île-de-France zone, vehicle classes) + pure estimateTransfer() pricing helper (flat fare per vehicle: Berline 100 € / Van 150 € / Première classe 200 €). `transferVehicleForCategories` / `transferFareForDriver` derive a driver's flat transfer fare from their declared categories — the server recomputes it, the client never sends a price. `transferDestinations` are **directional routes** (`{id, from, to}`, label = "from → to"): 3 Paris→airport, 3 airport→Paris, plus the legacy catch-all `paris` ("Aéroport → Paris · Île-de-France") kept so existing driver opt-ins stay valid. Drivers opt in with **one global switch** in `ProfileEditor` ("Accepter les transferts aéroport"), so a profile holds either every route or none — `acceptsAirportTransfers` / `transferDestinationsForOptIn` / `ALL_TRANSFER_DESTINATION_IDS` do the expansion. Kept as a `text[]` (no extra boolean column) so `transfer_destinations @> array['cdg']` and its GIN index still answer "who serves CDG?" with no migration. Reading is lenient (≥1 route = opted in) so legacy partial lists don't silently drop drivers; the next save normalises them.
  cities.ts, drivers.ts       Mock data + accessors (getDriver, driversByCity…)
  drivers.ts                  Includes `jeremy-driver` (Jérémy Dubois, Mercedes-AMG E63 S)
  utils.ts                    cn(), formatPrice(), initials()
  config.ts                   env, serverEnv, feature flags (isSupabaseConfigured, isMapboxConfigured, isSupabaseAdminConfigured)
  auth.tsx                    AuthProvider + useAuth() — global session (demo localStorage or Supabase). setDemoSession/clearDemoSession
  demoAccounts.ts             Demo login accounts (test/test client, driver/driver → jeremy-driver)
  contacts.ts                 Client's contacted drivers + roomForDriver(id)="dm-<id>" (client↔driver chat room)
  driverOverrides.ts          Driver self-edits (demo): bio, available, **avatar** + **car** (make/model/year/colour, typed by the driver) + **carPhotos** (uploaded, compressed to data-URLs). `applyDriverOverrides` merges, `mergeCar` handles the car (a blank field falls back to the original — never a nameless car). Price is platform-fixed (not driver-editable). The public profile is SSG, so `Gallery`, `DriverAvatar` and `DriverVehicle` re-read the overrides client-side to reflect edits without a rebuild.
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

## Connexion Google (OAuth 2.0)

- Flow: `GoogleButton` → `supabase.auth.signInWithOAuth({ provider: "google" })`
  (PKCE) → Google consent → `GET /auth/callback?code=…&next=…` →
  `exchangeCodeForSession` sets the session cookie → redirect back to the page the
  visitor came from (`/compte` when they started on an `/auth/*` page).
- `safeNext()` in the callback only accepts same-origin relative paths (no open
  redirect). Failures bounce to `/auth/login?auth_error=…`, which `AuthForm`
  displays in its error banner.
- Data from Google: **email**, **given_name/family_name** (or `name`), **picture**.
  Normalised by `lib/identity.ts`, exposed by `useAuth()` as
  `firstName`/`lastName`/`email`/`avatarUrl`. The Navbar avatar shows the Google
  photo when present, initials otherwise (CSP `img-src` allows
  `*.googleusercontent.com`).
- Persistence: the `on_auth_user_created` trigger (`supabase/schema.sql`) creates the
  `public.profiles` row from the Google metadata (name + `avatar_url`); the callback
  additionally syncs those columns for accounts that predate the provider link
  (`profiles` has no insert policy — inserts go through the security-definer trigger).
- **Setup (one-off)**:
  1. Google Cloud Console → APIs & Services → Credentials → *OAuth client ID* →
     Web application. Authorised redirect URI:
     `https://<projet>.supabase.co/auth/v1/callback`. Add
     `https://www.novacompagnie.com` and `http://localhost:3000` as authorised
     JavaScript origins, and fill the OAuth consent screen.
  2. Supabase dashboard → Authentication → Providers → **Google**: paste the Client
     ID + Client Secret, enable. **The secret stays in Supabase — never in this repo.**
  3. Supabase → Authentication → URL Configuration: Site URL
     `https://www.novacompagnie.com`, redirect allow-list
     `http://localhost:3000/**` + `https://www.novacompagnie.com/**`.
  4. `.env.local` needs only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Without Supabase keys the button stays visible but explains it is unavailable
  (`auth.googleUnavailable`) — the no-keys demo keeps working.

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

- **Flow (realistic): client requests → driver accepts/refuses → client pays (Stripe) → paid.**
  Status machine in `lib/bookings.ts`: pending → confirmed|refused|cancelled,
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
  la bande, forfait pour un transfert, commission prise **dans** le prix, net
  du chauffeur par **soustraction**). Elle sert au chemin base de données ;
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
  - `completed` / `cancelled` → **archived** (history readable, sending refused
    server-side with 409). Also reached automatically 24 h after the ride date.
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
- i18n under `chat.*`. Tested in `tests/chat.test.ts` (17).

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

- **Driver rates + commission** in `lib/pricing.ts` (pure, unit-tested). Rates are
  **client prices TTC**. Standard classes (Business/Moto/Van) are **platform-fixed
  and not editable**: 120 €/h, 1000 €/day — modelled as a zero-width band
  (min = max) so nothing downstream needs a special case. Premium classes
  (Luxury/Van Luxury) are typed freely by the driver between 150–250 €/h and
  1500–3000 €/day. `hasFixedPricing`/`isRateEditable` drive the read-only state,
  `boundsFor`/`isRateInBand`/
  `rateError` drive the form, `clampRate` is the server's last word (also applied
  in `applyDriverOverrides`, so a rate stored before a band change can never go
  live). The **25 % platform commission** (`PLATFORM_COMMISSION_RATE`) is taken
  **out of** the client price, never added on top — `SERVICE_FEE_RATE` stays 0 and
  the client total is unchanged; `splitRate` derives `net` by subtraction so
  commission + net always equals the price exactly. Week rates have no field: the
  profile shows a WhatsApp CTA to support.
- Pure amount logic in `lib/payments.ts` (`computeBookingAmount`, `computeAmount`, `clampHours`, `clampDays`,
  no service fee — `SERVICE_FEE_RATE = 0`, total = subtotal, euros→cents). Bookings can be billed **by the hour, by the day, or as a flat airport transfer** (`BookingUnit`; day uses the fixed `pricePerDay`, `transfer` uses the flat fare from `transferFareForDriver` and ignores the quantity). Fully unit-tested (`tests/payments.test.ts`).
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

`lib/drivers.ts` has 5 realistic Paris drivers (incl. `jeremy-driver`)
with reviews, vehicles, categories (Business/Moto/Van/Van Luxury/Luxury) and
fixed rates (`pricePerHour` + `pricePerDay`, weekly on quote), languages,
availability, map coords. `getDriver(id)`, `driversByCity(cityId)`.
Driver profile pages are statically generated from these ids.

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
