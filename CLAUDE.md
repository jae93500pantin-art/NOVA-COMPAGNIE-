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
./deploy.sh      # build locally, start VM if off, ship + build + restart on Azure, verify HTTPS
```

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
  api/
    account/route.ts          DELETE → RGPD account erasure (service role)
    account/export/route.ts   GET → RGPD data export (JSON)
    checkout/route.ts         POST → Stripe Checkout session (test/live) or {mode:"demo"} fallback. Amount computed server-side.
    bookings/[driverId]/route.ts  SSE (GET) live course requests + POST create + PATCH accept/refuse

components/                   All client components unless noted
  Navbar                      Front bar = logo (Nova Compagnie) + "Réservation" (→ /drivers) + "Transfert Aéroport" + "Contact" links + CitySwitcher + LanguageSwitcher + account dropdown/login. Account dropdown has a **WhatsApp contact** link (messaging feature removed).
  CitySwitcher                City dropdown (front bar, next to LanguageSwitcher) — cities from lib/cities.ts (Paris only for now); selecting routes to /drivers?city=<id>, persisted in localStorage `nova_city`.
  LanguageSwitcher            FR/EN dropdown (globe icon). Persists choice; default = browser language.
  Footer, SectionHeader, Reveal (anim wrapper)
  Hero                        Uber-inspired homepage hero: tagline ("Trouvez votre chauffeur" / "Find your driver") + Uber-style booking card on the left, Globe focal point on the right. Left scrim keeps text legible. Below: 3 FICTIONAL client testimonials (about the SITE/reliability, not drivers). No big title/subtitle, no stats row.
  SearchBar                   Uber-style vertical booking card (Ville + premium DatePicker + full-width CTA → /drivers). Chosen date saved to sessionStorage `jw_booking_date` to prefill the BookingWidget. NO vehicle category field.
  DatePicker                  Premium custom date+time picker (glass popover via portal). Quick-chips (Today/Tomorrow/This weekend), Monday-first calendar, time chips, keyboard nav (arrows/Esc), flips up when low on screen, reduced-motion-safe, i18n. `variant="search"|"booking"`. Calendar logic in lib/calendar.ts.
  Globe                       Animated WebGL globe (cobe) — Google-Earth "blue marble" hero backdrop, slow auto-rotation. NOTE: pin cobe to 0.6.3; v2 has a WebGL regression that renders only markers (no sphere).
  AccountDashboard            /compte client & driver dashboards
  InteractiveMap              Stylised fallback map (no token needed)
  MapboxMap                   Real Mapbox map (token required)
  LiveMap                     Picks Mapbox vs InteractiveMap based on token
  DriverCard, DriversExplorer, Gallery, Reviews, StarRating, BookingWidget
  ContactForm                 Professional contact form (nom/prénom, e-mail, téléphone, type de demande, message) with client-side validation + animated success confirmation. Demo mode: simulated send (no email backend yet).
  TransferEstimate            Instant airport-transfer price estimate (departure airport + destination zone + vehicle → live €). Pure math in lib/transfer.ts. CTA routes to /drivers?city=<airport city>.
  TransferPickupMap           Stylised pickup-zones map (airport pins + animated rings), same aesthetic as InteractiveMap.
  CityShowcase
  AuthForm                    Client/driver toggle, Supabase auth + demo fallback
  CookieConsent               GDPR consent banner (mounted in (site)/layout)
  DataRights                  RGPD self-service (export/delete/consent)

lib/
  types.ts                    Domain types: Driver, City, Review
  i18n.tsx                    I18nProvider + useI18n() — bilingual FR/EN. Default = browser lang, persisted in localStorage `lumecar_lang`. t("a.b") with FR fallback.
  dictionaries.ts             FR + EN translation dictionaries (typed; EN must match FR shape).
  calendar.ts                 Pure calendar helpers (monthGrid, shiftMonth, isBefore, addDays, nextWeekendISO…). Unit-tested. Powers DatePicker.
  motion.ts                   Shared Apple-grade motion tokens (ease [0.22,1,0.36,1], springSoft/Snappy, reveal, popover, stagger).
  bookings.ts                 Booking domain types + pure helpers: canTransition, statusLabel, buildBooking AND scheduling helpers (todayISODate, composeWhen, isFutureBooking, formatWhen). Unit-tested.
  transfer.ts                 Airport-transfer domain data (Paris airports, Île-de-France zone, vehicle classes) + pure estimateTransfer() pricing helper (flat fare per vehicle: Berline 100 € / Van 150 € / Première classe 200 €).
  cities.ts, drivers.ts       Mock data + accessors (getDriver, driversByCity…)
  drivers.ts                  Includes `jeremy-driver` (Jérémy Dubois, Mercedes-AMG E63 S)
  utils.ts                    cn(), formatPrice(), initials()
  config.ts                   env, serverEnv, feature flags (isSupabaseConfigured, isMapboxConfigured, isSupabaseAdminConfigured)
  auth.tsx                    AuthProvider + useAuth() — global session (demo localStorage or Supabase). setDemoSession/clearDemoSession
  demoAccounts.ts             Demo login accounts (test/test client, driver/driver → jeremy-driver)
  contacts.ts                 Client's contacted drivers + roomForDriver(id)="dm-<id>" (client↔driver chat room)
  driverOverrides.ts          Driver self-edits (demo): bio, available, **carPhotos** (uploaded, compressed to data-URLs). `applyDriverOverrides` merges; `Gallery` (with `driverId`) live-reflects uploaded photos on the public profile. Price is platform-fixed (not driver-editable).
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

## Contact (WhatsApp)

- The in-app messaging feature (and the `/live` cross-device chat demo) was
  **removed entirely**. All "contact" actions open the WhatsApp Business line via
  `lib/whatsapp.ts` (`whatsappUrl(message?)`, `WHATSAPP_NUMBER`, `WHATSAPP_DISPLAY`).
- Entry points: account dropdown (Navbar), `BookingWidget` "Contacter",
  `ClientBookings` row action, the booking-confirmation page, and the `ContactForm`
  info panel (`/contact`).
- Deleted: `app/(site)/messages`, `app/(site)/live`, `app/api/live`,
  `RealMessages`, `LiveChat`, `ChatInterface`, `lib/liveBroker.ts`,
  `lib/realtime.ts`, `lib/conversations.ts`, `lib/contacts.ts` + its test, and the
  `conversations`/`messages` tables in `supabase/schema.sql`.
- Update `WHATSAPP_NUMBER` in `lib/whatsapp.ts` to change the number everywhere.

## Real-time bookings (course requests, client ↔ driver)

- **Flow (realistic): client requests → driver accepts/refuses → client pays (Stripe) → paid.**
  Status machine in `lib/bookings.ts`: pending → confirmed|refused, confirmed → paid.
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
- In-memory broker `lib/bookingBroker.ts` (per-driver rooms, SSE), pure logic + types in
  `lib/bookings.ts`. Client identity via `lib/clientBookings.ts`.
- Unit-tested in `tests/bookings.test.ts` (23) + `tests/calendar.test.ts` (18). Verified live end-to-end:
  request → driver receives → accept → client pays → both see "Payée" without reload.

## Payments (Stripe — branch `stripe-test`)

- Pure amount logic in `lib/payments.ts` (`computeBookingAmount`, `computeAmount`, `clampHours`, `clampDays`,
  no service fee — `SERVICE_FEE_RATE = 0`, total = subtotal, euros→cents). Bookings can be billed **by the hour or by the day** (`BookingUnit`; day uses the fixed `pricePerDay`). Fully unit-tested (`tests/payments.test.ts`).
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
  button in `ClientBookings` opens a sheet to pick **Carte (Stripe) · PayPal ·
  Crypto · Espèces**. Card → `/api/checkout` (Stripe or demo). PayPal/Crypto/Cash
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
  cleared on tab close), so it needs no consent. Bookings stay ephemeral
  (in-memory broker), no new persistence.

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
