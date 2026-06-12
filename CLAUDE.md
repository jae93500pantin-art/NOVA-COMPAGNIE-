# CLAUDE.md — LumeCar

> Context file for AI agents working on this codebase. Read this first.
> Keep it updated when architecture, commands, or conventions change.

## What this is

**LumeCar** is a premium private-chauffeur marketplace (think Uber Black ×
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
    page.tsx                  Homepage: Hero, LiveMap, featured drivers, cities, how-it-works, features, CTA
    drivers/page.tsx          Listing + filters (Suspense → DriversExplorer)
    drivers/[id]/page.tsx     Driver profile (SSG via generateStaticParams): gallery, facts, reviews, booking
    compte/page.tsx           Personal dashboard (AccountDashboard) — client & driver views; redirects to login if no session
    messages/page.tsx         REAL-TIME client↔driver chat (RealMessages, SSE). Requires login.
    live/page.tsx             REAL cross-device live chat over LAN (LiveChat)
    legal/layout.tsx          Legal shell with sidebar nav
    legal/confidentialite     Privacy policy (RGPD)
    legal/conditions          Terms of use
    legal/cookies             Cookie policy
    legal/mentions-legales    Legal notice (FR/EU required)
    legal/mes-donnees         Data-rights centre (DataRights): consent, export, delete
  auth/                       Full-screen, NO navbar (split-screen visual)
    layout.tsx
    login/page.tsx            Suspense → AuthForm mode="login"
    register/page.tsx         Suspense → AuthForm mode="register"
  api/
    live/[room]/route.ts      SSE stream (GET) + publish (POST). Powers /live AND /messages (room dm-<driverId>)
    account/route.ts          DELETE → RGPD account erasure (service role)
    account/export/route.ts   GET → RGPD data export (JSON)
    checkout/route.ts         POST → Stripe Checkout session (test/live) or {mode:"demo"} fallback. Amount computed server-side.
    bookings/[driverId]/route.ts  SSE (GET) live course requests + POST create + PATCH accept/refuse

components/                   All client components unless noted
  Navbar                      Account dropdown + logout when logged in (uses useAuth)
  Footer, Hero, SearchBar, SectionHeader, Reveal (anim wrapper)
  AccountDashboard            /compte client & driver dashboards
  RealMessages                Real-time client↔driver messaging (SSE), session-aware
  ChatInterface               LEGACY mock chat — no longer routed, kept for reference
  InteractiveMap              Stylised fallback map (no token needed)
  MapboxMap                   Real Mapbox map (token required)
  LiveMap                     Picks Mapbox vs InteractiveMap based on token
  DriverCard, DriversExplorer, Gallery, Reviews, StarRating, BookingWidget
  CityShowcase
  ChatInterface               Mock messaging UI (local state + simulated reply)
  LiveChat                    Real SSE-based cross-device chat client
  AuthForm                    Client/driver toggle, Supabase auth + demo fallback
  CookieConsent               GDPR consent banner (mounted in (site)/layout)
  DataRights                  RGPD self-service (export/delete/consent)

lib/
  types.ts                    Domain types: Driver, City, Review, Conversation, ChatMessage
  cities.ts, drivers.ts, conversations.ts   Mock data + accessors (getDriver, driversByCity…)
  drivers.ts                  Includes `jeremy-driver` (Jérémy Dubois, Mercedes-AMG E63 S)
  utils.ts                    cn(), formatPrice(), initials()
  config.ts                   env, serverEnv, feature flags (isSupabaseConfigured, isMapboxConfigured, isSupabaseAdminConfigured)
  auth.tsx                    AuthProvider + useAuth() — global session (demo localStorage or Supabase). setDemoSession/clearDemoSession
  demoAccounts.ts             Demo login accounts (test/test client, driver/driver → jeremy-driver)
  contacts.ts                 Client's contacted drivers + roomForDriver(id)="dm-<id>" (client↔driver chat room)
  geo.ts                      City coords + driverCoords() for Mapbox
  consent.ts                  Consent get/save/clear (localStorage, versioned)
  validation.ts               Room/text validation + sanitisation for live API
  liveBroker.ts               In-memory pub/sub for SSE live chat (server, globalThis singleton)
  realtime.ts                 Supabase Realtime helpers (fetch/send/subscribe messages)
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

## Real-time messaging (client ↔ driver)

- `/messages` (`RealMessages`) is a genuine real-time chat over SSE — NOT the old mock.
- A conversation = a deterministic room `dm-<driverId>` (`lib/contacts.ts`).
  The "Contacter" button on a driver profile calls `addContact(driverId)` and routes to
  `/messages?driver=<id>`; the logged-in driver auto-joins `dm-<their own id>`.
- Requires login (shows a CTA otherwise). Messages are ephemeral (in-memory broker),
  same infra as `/live`. Persistent history = Supabase step (not done yet).

## Real-time bookings (course requests, client ↔ driver)

- **Flow (realistic): client requests → driver accepts/refuses → client pays (Stripe) → paid.**
  Status machine in `lib/bookings.ts`: pending → confirmed|refused, confirmed → paid.
- Client clicks **Demander cette course** (`BookingWidget`, must be logged in) →
  `POST /api/bookings/[driverId]` creates a **pending** request (NO payment yet).
- Driver sees requests **live** on **`/compte/courses`** (dedicated page, `DriverCourses`
  → `DriverRequests`) and on the dashboard; Accept/Refuse via `PATCH`.
- Client follows status live on **`/compte/reservations`** (`ClientBookings`). When
  **confirmed**, a **Payer €X** button appears → `POST /api/checkout` (Stripe Checkout
  if `STRIPE_SECRET_KEY` set, else demo) → on success the booking is marked **paid**
  (`PATCH status:paid`, via `MarkPaid` on the Stripe return page, or directly in demo).
- Nav: drivers get "Mes courses", clients get "Mes réservations" in the account menu.
- In-memory broker `lib/bookingBroker.ts` (per-driver rooms, SSE), pure logic + types in
  `lib/bookings.ts`. Client identity via `lib/clientBookings.ts`.
- Unit-tested in `tests/bookings.test.ts` (13). Verified live end-to-end:
  request → driver receives → accept → client pays → both see "Payée" without reload.

## Payments (Stripe — branch `stripe-test`)

- Pure amount logic in `lib/payments.ts` (`computeBookingAmount`, `clampHours`,
  12% service fee, euros→cents). Fully unit-tested (`tests/payments.test.ts`).
- `lib/stripe.ts` = server-only Stripe client (null if no key). `lib/config.ts`
  flags: `isStripeConfigured`, `isStripeLiveMode`.
- `POST /api/checkout` creates a Checkout Session. **Amount is computed
  server-side from the trusted driver price** — a client-supplied `amount` is
  ignored (anti price-tampering). Rate-limited (10/min/IP). Apple Pay & Google
  Pay appear automatically in Stripe Checkout.
- No key → returns `{ mode: "demo", amount }` and `BookingWidget` shows the
  simulated confirmation. With `sk_test_…` → real test Checkout (test cards),
  redirect to `/compte/reservation?status=success`.
- To enable: put `STRIPE_SECRET_KEY=sk_test_…` in `.env.local`, restart.

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

## Live cross-device chat (PC ↔ phone)

- Page `/live`. Default room is the constant **`salon-demo`**, so PC
  (`localhost:3000/live`) and phone (`192.168.1.192:3000/live`) auto-join the
  same room. Override with `?room=<a-z0-9_-, ≤40>`.
- Transport: **Server-Sent Events**. `GET /api/live/[room]` streams
  `history` / `message` / `presence` events; `POST` publishes. State lives in
  `lib/liveBroker.ts` (in-memory, per-process, purged when a room empties).
- **Ephemeral by design** — nothing is persisted (GDPR-friendly demo).
- Production-grade persistent chat uses Supabase Realtime (`lib/realtime.ts`).
- Security: room regex + text sanitisation (`lib/validation.ts`); React escapes
  rendered text (no XSS); message length capped.

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

## Security posture (OWASP-aware)

- Security headers in `next.config.js` (`X-Frame-Options`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`); `X-Powered-By` removed.
  HSTS intentionally omitted to keep HTTP LAN access working on iPhone.
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

- Tailwind theme (`tailwind.config.ts`): `ink` surfaces, `royal` blue accent,
  `gold` ratings; animations `fade-up`, `pulse-ring`, `float`; `shadow-glow`/`card`.
- CSS component classes in `globals.css`: `.glass`, `.glass-strong`, `.btn-primary`,
  `.btn-ghost`, `.btn-white`, `.chip`, `.input`, `.section-eyebrow`,
  text gradients, `.prose-legal`.
- Animations: wrap sections in `<Reveal>`; respect existing easing
  `[0.22, 1, 0.36, 1]`.

## Mock data

`lib/drivers.ts` has 8 realistic drivers across paris/london/barcelona/newyork
with reviews, vehicles, categories (Business/Luxury/SUV/Van/Electric), prices,
languages, availability, map coords. `getDriver(id)`, `driversByCity(cityId)`.
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
- Keep the `salon-demo` default room constant — it's what makes cross-device
  pairing "just work".
