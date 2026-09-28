# CLAUDE.md — Nova Compagnie

> Context file for AI agents working on this codebase. Read this first.
> Keep it updated when architecture, commands, or conventions change.

## What this is

**Nova Compagnie** (domain www.novacompagnie.com) est un **annuaire** de
chauffeurs privés vérifiés, à Paris. Les clients parcourent les fiches,
comparent les tarifs que les chauffeurs annoncent eux-mêmes, et **contactent
celui qu'ils ont choisi** : la prestation et son paiement se règlent
directement avec lui. Interface sombre et premium, glassmorphism, Framer Motion.

⚠️ **Ce n'est plus une place de marché.** Le site ne prend aucune réservation et
n'encaisse aucune course — voir § STATUT D'ANNUAIRE, qui passe avant toute
considération technique.

Il tourne **sans aucune clé** (carte stylisée, auth simulée) et **monte en
charge** vers Supabase et Mapbox dès que les variables d'environnement
correspondantes existent.

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
npm run build    # production build; MUST pass. ~17 routes + middleware
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
    page.tsx                  Accueil : Hero (carte de recherche + globe), teaser transfert, how-it-works, features, CTA
    drivers/page.tsx          Listing + filters (Suspense → DriversExplorer)
    drivers/[id]/page.tsx     Fiche chauffeur (SSG via generateStaticParams) : galerie, faits, vehicule, badge CNAPS + bloc de contact. Plus de section avis, plus de reservation.
    transfert-aeroport/page.tsx  Composant SERVEUR : lit l'annuaire (listDirectory, service role) et le passe a TransferAirport. force-dynamic.
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

components/                   All client components unless noted
  Navbar                      Front bar = logo (Nova Compagnie) + "Annuaire" (→ /drivers, clé `nav.booking`) + "Transfert Aéroport" + "Contact" links + CitySwitcher + LanguageSwitcher + account dropdown/login. Account dropdown has a **WhatsApp contact** link (messaging feature removed).
  CitySwitcher                City dropdown (front bar, next to LanguageSwitcher) — cities from lib/cities.ts (Paris only for now); selecting routes to /drivers?city=<id>, persisted in localStorage `nova_city`.
  LanguageSwitcher            FR/EN dropdown (globe icon). Persists choice; default = browser language.
  Footer, SectionHeader, Reveal (anim wrapper)
  Hero                        Uber-inspired homepage hero: tagline ("Trouvez votre chauffeur" / "Find your driver") + Uber-style booking card on the left, Globe focal point on the right. Left scrim keeps text legible. Below: 3 FICTIONAL client testimonials (about the SITE/reliability, not drivers). No big title/subtitle, no stats row.
  SearchBar                   Carte de recherche de l'accueil : Ville + Date et heure, sur un jour ou **plusieurs** (`DatePicker` en `mode="range"`) + CTA → /drivers?city=&date=&dateEnd=&time=. ⚠️ Le créneau est un CRITÈRE DE RECHERCHE, pas une réservation : il filtre sur le planning déclaré, il ne bloque rien. Il voyage par l'URL (filtre partageable), plus par `sessionStorage`. Le bouton reste « Voir les chauffeurs » — ne pas le retitrer « Réserver ».
  DatePicker                  Sélecteur date + heure premium (popover glass par portail) : chips rapides (aujourd'hui / demain / ce week-end), calendrier lundi-first, chips d'heures, navigation clavier, bascule vers le haut quand l'écran manque, `prefers-reduced-motion`, i18n. Logique pure dans lib/calendar.ts. ⚠️ Ne rend jamais un créneau passé (`rollPastTimeToNextDay` reporte au lendemain, une heure passée sur une autre date est effacée) — les deux cas sont expliqués par une note. ⚠️ Le `mode="range"` est celui utilisé par `SearchBar` : un clic ouvre la plage, le second la ferme, un troisième repart — un seul clic suffit donc toujours pour un jour unique. Sur une plage, l'heure s'affiche à la FIN et une seule fois (elle vaut pour chaque jour, pas comme un départ suivi d'un retour).
  Globe                       Animated WebGL globe (cobe) — Google-Earth "blue marble" hero backdrop, slow auto-rotation. NOTE: pin cobe to 0.6.3; v2 has a WebGL regression that renders only markers (no sphere).
  InteractiveMap              Stylised fallback map (no token needed)
  MapboxMap                   Real Mapbox map (token required)
  LiveMap                     Picks Mapbox vs InteractiveMap based on token
  DriverCard, DriversExplorer, Gallery   ⚠️ Plus de `Reviews` ni de `StarRating` : sans course, aucun avis n'est certifiable (voir § STATUT D'ANNUAIRE).
  DriverContactCard           Colonne de droite de la fiche chauffeur, en remplacement de `BookingWidget`. Composant SERVEUR. Trois choses : les tarifs tels que le chauffeur les annonce, ses disponibilités s'il en a déclaré, et un lien de mise en relation (WhatsApp Nova). Plus la mention qui dit avec qui le contrat se noue. ⚠️ Aucun sélecteur d'unité, aucun créneau, aucun total client.
  ContactForm                 Professional contact form (nom/prénom, e-mail, téléphone, type de demande, message) with client-side validation + animated success confirmation. ⚠️ L'envoi est SIMULÉ — aucun backend ne reçoit le message.
  TransferEstimate            Recherche « qui dessert ce trajet ? » : aeroport + zone + classe → la LISTE des chauffeurs concernes, chacun avec le tarif qu'IL a annonce, plus un « a partir de » qui est le MINIMUM de ces tarifs (jamais une moyenne, jamais une valeur plateforme ; un 0 est exclu, aucun tarif ⇒ aucun montant). Etat vide qui nomme sa cause et propose une suite. Recoit les chauffeurs en prop depuis la page serveur.
  TransferAirport             Corps client de la page transfert (i18n) : hero, gages de confiance + ce que « habilitations verifiees » recouvre, 5 services « selon le chauffeur », la recherche, « Comment ca marche » en 3 etapes, la carte des zones, et la mention legale d'annuaire en bas de page.
  TransferPickupMap           Stylised pickup-zones map (airport pins + animated rings), same aesthetic as InteractiveMap.
  CityShowcase
  AuthForm                    Client/driver toggle, Supabase auth + demo fallback. Props `embedded`/`onSuccess`/`onSwitchMode` when rendered inside AuthModal.
  AuthModal                   Login/register dialog opened from the Navbar (portal, z-40 under the navbar): X, outside click, Escape, body scroll lock, mobile bottom-sheet. No redirect.
  CookieConsent               GDPR consent banner (mounted in (site)/layout)
  DataRights                  RGPD self-service (export/delete/consent)

lib/
  types.ts                    Domain types: Driver, City. ⚠️ Plus de `Review`, et plus de `rating` / `reviewsCount` / `trips` sur `Driver` — rien ne pouvait les renseigner honnêtement (voir § STATUT D'ANNUAIRE).
  siren.ts                    `isValidSiren` (SIREN 9 / SIRET 14, clé de Luhn). Extrait de `bookingVoucher.ts` : le bon de réservation a disparu, le numéro reste une pièce du dossier d'un professionnel référencé.
  identity.ts                 Pure helpers normalising provider metadata (Google given_name/family_name/name/picture → firstName/lastName/avatarUrl). Unit-tested.
  i18n.tsx                    I18nProvider + useI18n() — bilingual FR/EN. Default = browser lang, persisted in localStorage `lumecar_lang`. t("a.b") with FR fallback.
  dictionaries.ts             FR + EN translation dictionaries (typed; EN must match FR shape).
  calendar.ts                 Aides de calendrier pures (monthGrid, shiftMonth, isBefore, addDays, nextWeekendISO) **et de créneau** (todayISODate, composeSlot, isFutureSlot, rollPastTimeToNextDay, formatSlot). ⚠️ Ces cinq dernières viennent de `lib/bookings.ts` : renommées depuis `isFutureBooking` / `formatWhen`, parce qu'elles décrivent un créneau RECHERCHÉ, pas réservé. Testées (35).
  motion.ts                   Shared Apple-grade motion tokens (ease [0.22,1,0.36,1], springSoft/Snappy, reveal, popover, stagger).
  schedule.ts                 Planning hebdomadaire (pur) : DaySchedule/WeeklySchedule (7 entrées, lundi-first), DEFAULT_SCHEDULE (= aucune contrainte, donc un chauffeur sans planning reste visible partout), PRESET_WEEKDAYS (lun–ven 07:00–19:00), isWithinSchedule / isDayOpen / dayScheduleFor, sanitizeSchedule (répare une heure invalide et une fin avant son début), et **isWithinScheduleRange** pour une recherche sur plusieurs jours — TOUS les jours doivent être ouverts, borné par MAX_SLOT_RANGE_DAYS. Testé (22).
  transfer.ts                 Aéroports parisiens, zones desservies, classes de véhicule, et `transferDestinations` = trajets DIRECTIONNELS (`{id, from, to}`) : 3 Paris→aéroport, 3 aéroport→Paris, plus le fourre-tout historique `paris`. Les chauffeurs adhèrent par UN interrupteur global (`ProfileEditor`), donc une fiche porte tous les trajets ou aucun — `acceptsAirportTransfers` / `transferDestinationsForOptIn` / `ALL_TRANSFER_DESTINATION_IDS` font la conversion. Stocké en `text[]` pour que `transfer_destinations @> array['cdg']` et son index GIN répondent sans migration. ⚠️ AUCUN PRIX : plus de forfait par classe, plus de `estimateTransfer`, plus de `transferFareForDriver`, plus de `baseFare`. `transferVehicleForCategories` ne sert plus qu'à CLASSER un chauffeur.
  cities.ts                   Villes (Paris seule pour l'instant) + accesseurs.
  drivers.ts                  ⚠️ VIDE, et doit le rester (§ Mock data). La vraie source est `public.drivers`, lue par `driverDirectory.ts`.
  utils.ts                    cn(), formatPrice(), initials()
  config.ts                   env, serverEnv, feature flags (isSupabaseConfigured, isMapboxConfigured, isSupabaseAdminConfigured)
  auth.tsx                    AuthProvider + useAuth() — global session (demo localStorage or Supabase). setDemoSession/clearDemoSession
  demoAccounts.ts             Comptes de démonstration (test/test client, driver/driver). ⚠️ Le lien vers la fiche `jeremy-driver` a été retiré avec les faux chauffeurs.
  driverOverrides.ts          Driver self-edits (demo): bio, available, **avatar** + **car** (make/model/year/colour, typed by the driver) + **carPhotos** (uploaded, compressed to data-URLs). `applyDriverOverrides` merges, `mergeCar` handles the car (a blank field falls back to the original — never a nameless car). ⚠️ Le tarif est fixé par le CHAUFFEUR (voir § Véhicules et tarifs) : un 0 y reste un 0 — « non communiqué » — et ne repart pas sur le tarif d'origine de la fiche. The public profile is SSG, so `Gallery`, `DriverAvatar` and `DriverVehicle` re-read the overrides client-side to reflect edits without a rebuild.
  whatsapp.ts                 WHATSAPP_NUMBER + whatsappUrl() — central WhatsApp contact link (messaging feature removed)
  geo.ts                      City coords + driverCoords() for Mapbox
  consent.ts                  Consent get/save/clear (localStorage, versioned)
  validation.ts               `sanitizeText`, `rateLimit`, `safeReturnPath`, `RECOVERY_PATH`. ⚠️ `ROOM_RE` / `isValidRoom` / `MAX_MESSAGE_LEN` ont été retirés avec la messagerie : un validateur orphelin finit réemployé pour ce qu'il ne valide pas.
  supabase/client.ts          Browser client (null if unconfigured)
  supabase/server.ts          Server client bound to cookies
  supabase/admin.ts           server-only service-role client (privileged)

middleware.ts                 Refreshes Supabase session (no-op in demo mode)
next.config.js                Security headers, image hosts, poweredByHeader:false, allowedDevOrigins
deploy.sh                     One-command deploy to the Azure VM (build → ship → restart → verify)
supabase/schema.sql           Full schema: tables, enums, RLS, triggers, realtime, RGPD (consents/audit/delete_my_account RPC)
.env.local / .env.local.example   Env placeholders
```

## ⚠️ STATUT D'ANNUAIRE — les quatre règles absolues

**Posées par le propriétaire le 2026-09-28. Elles passent avant toute
considération technique.** Le site ne doit **jamais** :

1. **prendre de réservation** — aucun formulaire de réservation, aucun panier ;
2. **encaisser l'argent des courses**, ni prélever une commission par course ;
3. **imposer un prix commun aux chauffeurs** — chacun fixe ses propres tarifs ;
4. **choisir un chauffeur à la place du client**.

C'est un choix de **statut**, donc juridique et fiscal, pas une préférence
d'interface : encaisser pour le compte de tiers et éditer la facture fait de la
plateforme une centrale de réservation, avec les obligations correspondantes.

⚠️ **Toute proposition qui réintroduit un tunnel de réservation, un paiement en
ligne, une commission, un barème imposé ou une attribution automatique est à
refuser**, même présentée comme une commodité d'interface. Ne pas « remettre
juste un bouton Payer ».

### Ce qui a été retiré le 2026-09-28, et ne doit pas revenir

Environ **12 000 lignes**, dont l'essentiel de la logique métier d'alors.

| Domaine | Fichiers retirés |
|---|---|
| Réservation | `BookingWidget`, `/api/bookings/[driverId]`, `lib/bookingBroker`, `lib/bookings`, `lib/clientBookings`, `lib/actions/booking` (la seule Server Action du dépôt), `/compte/reservations`, `/compte/courses`, `/compte/reservation`, `ClientBookings`, `DriverRequests`, `DriverCourses`, `MarkPaid` |
| Paiement | `/api/checkout`, `PaymentDialog`, `lib/stripe`, `lib/paymentIntents`, `lib/payments`, la dépendance `stripe`, les autorisations Stripe de la CSP |
| Barème | commission 15 %, frais client 5 %, `priceBreakdown` et ses six montants, le décompte « revenu net » du profil chauffeur, `pricing_rules` |
| Messagerie de course | `lib/chat`, `chatBroker`, `chatMasking`, `chatQuickReplies`, `useBookingChat`, `BookingChat`, `/api/chat/[bookingId]` |
| Avis certifiés | `lib/reviews`, `reviewBroker`, `/api/reviews/[driverId]`, `ReviewForm`, `Reviews`, `StarRating` |
| Bon de réservation | `lib/bookingVoucher`, `lib/pdf/bookingVoucher`, `lib/voucherSource`, `/api/booking/[id]/pdf`, la dépendance `@react-pdf/renderer` |
| Créneaux | les clés `sessionStorage` `jw_booking_*`, et la date/heure de la **page transfert**. ⚠️ `DatePicker` et la date/heure de la carte d'accueil ont été **remis** le 2026-09-28, comme CRITÈRE DE RECHERCHE — voir § Disponibilité |
| Adresses | `AddressAutocomplete`, `lib/places`, `/api/places` — orphelins dès que les champs d'adresse ont disparu. Une route publique que rien n'appelle reste une surface d'attaque |
| Persistance | `lib/persistence`, `lib/dbRows` (les tables `bookings` / `messages` / `reviews` n'ont plus d'écrivain) |

### Les conséquences qu'il faut assumer, pas contourner

- **Plus d'étoiles nulle part.** Un avis n'était certifié que par la course
  terminée qui l'avait produit ; sans réservation, plus rien ne le certifie. Un
  avis libre sur un site marchand accessible, c'est le faux avis que ce dépôt a
  déjà nettoyé une fois (§ Mock data). ⚠️ `drivers.rating` vaut **5.0 par
  défaut** en base : l'afficher publiait « 5,0 ★ · 0 avis » sur chaque fiche
  neuve, une note inventée sur un professionnel réel. `rating`,
  `reviewsCount` et `trips` ont donc quitté le type `Driver`, et le filtre
  « note minimum » comme le tri par note ont quitté `DriversExplorer`.
- **Un tarif est obligatoire pour paraître** (`isListable`, § Tarifs).
- **L'espace personnel est presque vide, et c'est exact** : la plateforme ne
  garde pas trace de prestations qu'elle n'organise pas. ⚠️ Ne pas le remplir de
  compteurs de remplissage — l'ancienne version affichait « Réservations 3 ·
  Note donnée 4.9 » et une « prochaine course » fictive, en lisant `drivers[0]`
  d'un annuaire vide : elle **plantait**.
- **Le bon de réservation préalable reste obligatoire**, mais c'est l'obligation
  du **chauffeur transporteur**, pas celle d'un annuaire. `isValidSiren` est
  conservé (`lib/siren.ts`) : le SIREN reste une pièce du dossier.
- **La mise en relation passe par la ligne WhatsApp Nova**, pas par le téléphone
  du chauffeur : `profiles.phone` n'est lisible que par son propriétaire (RLS),
  et le publier demanderait son consentement explicite. C'est une décision, pas
  un `select` de plus.

### Ce que le pivot a rendu inutile

Plus besoin de clé Stripe, de Stripe Connect, de rail de reversement au
chauffeur, de CGV de vente ni de statut pour l'encaissement pour compte de
tiers. Le raisonnement CNAPS (§ Une seule prestation) s'appuyait sur « la
plateforme encaisse la totalité du montant et édite la facture » : **sa prémisse
a changé**. La conclusion reste une question juridique, à ne pas trancher dans
le code.

### État du SQL

⚠️ Des pans entiers de `supabase/schema.sql` sont **obsolètes** et son en-tête
le dit maintenant : `bookings`, `messages`, `reviews`, `payments`,
`pricing_rules`, `calculate_booking_price()`, `refresh_driver_rating()`, le bloc
9 (messagerie) et les enums `booking_status` / `payment_status`. Le retrait est
écrit dans `supabase/migrations/2026-09-28-annuaire-retire-reservation.sql`,
**volontairement hors du chemin** de `compose-schema.ps1` / `apply-schema.ps1` :
il contient des `drop table`, et un script qui rejoue automatiquement une
suppression de table finit par la rejouer sur une base qui avait des données.
Il n'a **pas encore été appliqué**.

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
- ⚠️ **Plus de cloisonnement par rôle dans le middleware** : il gardait
  `/compte/courses` et `/compte/reservations`, supprimés avec la réservation.
  Les pages restantes sont communes aux deux rôles, et la lecture de
  `profiles.role` à chaque passage n'a plus d'objet. Si un espace réservé
  réapparaît : relire le rôle dans **`profiles`**, jamais dans `user_metadata`
  — un utilisateur peut réécrire ses propres métadonnées avec
  `supabase.auth.updateUser()`, alors que la colonne est verrouillée par
  `profiles_protect_privileged`.
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
  Une messagerie de course l'avait remplacé pour les courses payées ; elle a
  disparu avec la réservation, et **WhatsApp est redevenu le seul canal**.
- Points d'entrée : menu du compte (Navbar), `DriverContactCard` sur une fiche
  chauffeur (« Être mis en relation », avec le nom du chauffeur prérempli),
  `TransferEstimate` quand personne ne dessert un trajet, et le panneau
  d'information de `ContactForm` (`/contact`).
- ⚠️ **C'est aujourd'hui le seul moyen pour un client de joindre un chauffeur.**
  Publier le téléphone du chauffeur serait plus direct, mais `profiles.phone`
  n'est lisible que par son propriétaire (RLS) et cela demande son consentement
  explicite : une décision, pas un `select` de plus.
- Deleted: `app/(site)/messages`, `app/(site)/live`, `app/api/live`,
  `RealMessages`, `LiveChat`, `ChatInterface`, `lib/liveBroker.ts`,
  `lib/realtime.ts`, `lib/conversations.ts`, `lib/contacts.ts` + its test, and the
  `conversations` table in `supabase/schema.sql`. (A booking-scoped `messages`
  table was reintroduced later for the course chat.)
- Update `WHATSAPP_NUMBER` in `lib/whatsapp.ts` to change the number everywhere.

## Disponibilité d'un chauffeur : planning + interrupteur

- **Deux choses distinctes.** `available` (l'interrupteur en ligne / hors ligne)
  ne parle que de *maintenant* ; le **planning hebdomadaire**
  (`lib/schedule.ts`, édité dans `ProfileEditor`) décrit les créneaux habituels.
- Le planning est stocké par chauffeur (`driverOverrides.schedule`,
  `Driver.schedule`) ; `scheduleOf(driver)` résout surcharge → fiche →
  `DEFAULT_SCHEDULE` (aucune contrainte).
- Il est **affiché** sur la fiche publique par `DriverContactCard`, à titre
  indicatif. ⚠️ Un planning « tous les jours 00:00–23:59 » **est** le défaut
  d'un chauffeur qui n'a rien renseigné : l'afficher comme une disponibilité
  déclarée serait une information inventée, d'où le test `hasRealSchedule`.
- **Le planning est ce que filtre la recherche.** `DriversExplorer` lit
  `?date=&dateEnd=&time=` (posés par la carte d'accueil) et écarte, via
  `isWithinScheduleRange(scheduleOf(d), date, dateEnd, time)`, les chauffeurs
  qui ne travaillent pas à ce moment-là. C'est le seul usage « actif » du
  planning depuis le retrait de la réservation — et il n'engage rien.
- **Plusieurs jours** : `isWithinScheduleRange` exige que le chauffeur travaille
  **tous** les jours de la plage, et que l'heure tienne dans le créneau de
  chacun. ⚠️ La conjonction est volontaire : « un chauffeur du vendredi au
  lundi » veut dire les quatre jours, et un « au moins un jour » ferait
  découvrir le trou au moment de l'appel. L'heure s'applique donc à chaque jour,
  ce n'est pas un départ suivi d'un retour.
  ⚠️ `MAX_SLOT_RANGE_DAYS = 31` borne le parcours : sans lui,
  `?dateEnd=2090-01-01` ferait itérer 23 000 jours dans le navigateur.
  ⚠️ **`scheduleOf` retombe sur `DEFAULT_SCHEDULE` (aucune contrainte)** pour un
  chauffeur qui n'a rien déclaré : il reste donc visible sur tous les créneaux.
  C'est voulu — l'absence de planning n'est pas une indisponibilité, et exclure
  ces profils viderait l'annuaire. La note sous le filtre le dit au visiteur.
- ⚠️ Le créneau apparaît comme une **puce effaçable** dans les filtres : un
  filtre venu de l'URL que le visiteur ne peut pas défaire est un piège.
- ⚠️ **L'état « En course » a disparu.** Il se déduisait d'une course payée dont
  la fenêtre contenait l'instant présent — il n'y a plus de course. Ne pas le
  remplacer par un drapeau que le chauffeur doit basculer à la main : c'est
  précisément ce qu'il oublie, et il disparaît alors de l'annuaire sans le
  savoir.

## Véhicules et tarifs

- Table `vehicles` (bloc 5 du schéma). ⚠️ **Ne pas recréer `driver_profiles`** :
  c'est `drivers`. Les enums `user_role` et `vehicle_category` ainsi que le
  trigger `on_auth_user_created` existent déjà.
- **`vehicles` n'est pas en lecture publique** : la table porte la plaque
  d'immatriculation et Postgres n'a pas de RLS par colonne. La fiche publique
  est servie par l'API, qui choisit les colonnes.
- **Chaque chauffeur fixe ses tarifs** (`lib/pricing.ts`, pur et testé) :
  `RATE_LIMITS` / `boundsFor(unit)` sont de simples garde-fous de saisie
  (1–1 000 €/h, 1–10 000 €/j), **identiques pour toutes les gammes**, qui
  n'arrêtent qu'un zéro de trop. `isRateAcceptable` valide, `rateError` parle au
  formulaire, `clampRate` est le dernier mot du serveur.
  ⚠️ Les plafonds recopient les `check` de `public.drivers` ; les élargir ici
  seulement ferait passer le formulaire puis **échouer l'insertion**, ce qui se
  lit comme une panne et non comme un refus.
- ⚠️ **`clampRate` n'invente jamais un prix** : un tarif absent, nul ou illisible
  rend **0**, qui se lit « non communiqué ». L'ancienne version remontait un 0
  au plancher de la bande — un chauffeur validé sans avoir rempli son dossier
  était donc publié à 120 €/h, un prix que personne n'avait choisi.
- **Corollaire : un tarif est obligatoire pour paraître.** `isListable`
  (`lib/driverDirectory.ts`) écarte une fiche sans tarif — de la liste **et** de
  sa page, qui répond 404 — exactement comme un profil non validé. Sinon elle
  s'afficherait à « 0 € ». Une validation par un administrateur ne suffit donc
  pas à publier une fiche vide.
- ⚠️ **Changer de gamme ne touche pas aux tarifs** dans `ProfileEditor` :
  l'effet qui les recalait dans la bande de la nouvelle classe écrasait
  silencieusement le prix du chauffeur.
- ⚠️ **Retiré du module, et à ne pas réintroduire** : `PRICE_BANDS`, `bandFor`,
  `PriceBand`, `isRateEditable`, `hasFixedPricing`, `isRateInBand`, la commission
  de 15 %, les frais client de 5 %, `priceBreakdown`, `breakdownFromClientTotal`
  et les raccourcis `commissionOn` / `driverNetOn` / `clientTotalOn`.

## Airport transfer & Contact

- **Transfert aéroport** (`/transfert-aeroport`) : `page.tsx` est un composant
  **serveur** qui lit l'annuaire (`listDirectory`) et le passe à
  `components/TransferAirport.tsx` (client, i18n). ⚠️ Ce découpage est
  indispensable : `listDirectory` exige le service role, donc un composant
  client ne peut pas l'appeler — et avant ce câblage la page annonçait
  « 0 chauffeur » sur tous les trajets.
- **La page décrit ce que les CHAUFFEURS proposent, jamais ce que Nova
  garantit.** Quatre promesses ont été retirées, et ne doivent pas revenir :
  « Confirmation e-mail & SMS » (bloc supprimé — plus aucun envoi au titre d'une
  course), « Disponible 24h/24 · 7j/7 » (la disponibilité de qui ? chacun a son
  planning), « Tout est pris en charge, de l'atterrissage à destination » (rien
  n'est pris en charge par Nova), « à la sortie de l'avion » (personne ne peut
  promettre un accueil en zone réservée à la place du chauffeur). Les cinq
  services restants portent tous **« selon le chauffeur »**.
- **`TransferEstimate` est une recherche, plus une estimation.** Elle liste les
  chauffeurs qui desservent le trajet, chacun avec **le tarif qu'il a annoncé**,
  et un « à partir de » qui est le **minimum de ces tarifs** — jamais une
  moyenne, jamais une valeur choisie par la plateforme. ⚠️ Un tarif à 0 (« non
  communiqué ») est exclu du calcul, et aucun tarif exploitable ⇒ **aucun montant
  affiché** : il n'y en a aucun à citer.
  ⚠️ **Le montant cité est HORAIRE**, avec son suffixe « / h ». Les chauffeurs
  déclarent un tarif à l'heure et à la journée ; **aucun ne déclare de forfait
  transfert** (il n'existe pas de colonne pour ça). Écrire « forfait » sur un
  tarif horaire serait un prix inventé. Un vrai forfait par chauffeur demande une
  colonne, un champ dans le tunnel et une migration.
- **L'état vide nomme sa cause et propose une suite** (autre classe, autre
  destination, WhatsApp, annuaire complet) au lieu d'afficher « 0 chauffeur
  habilité ». ⚠️ Il distingue « personne ne dessert ce trajet » de « personne
  dans cette classe » : les deux se corrigent autrement.
- **« Habilitations vérifiées » est explicité** sous les badges : carte
  professionnelle VTC et son numéro au registre des exploitants, attestation
  d'assurance RC professionnelle, permis, carte grise — *contrôlés sur pièces*,
  avec la précision que Nova constate l'existence des pièces et n'exécute aucun
  transport. ⚠️ Un badge « vérifié » qui ne dit pas quoi ne vaut rien.
- **« Comment ça marche » en 3 étapes** (chercher · contacter · convenir) et la
  **mention légale d'annuaire** en bas de page — celle qui qualifie tout ce qui
  précède, donc lisible sans avoir à la chercher.
- ⚠️ Les forfaits par classe (Berline 100 € / Van 150 € / Première 200 €),
  `estimateTransfer`, `transferFareForDriver` et le `baseFare` de chaque aéroport
  ont été retirés de `lib/transfer.ts` : c'étaient des prix décidés par Nova. La
  date et l'heure de prise en charge sont parties avec eux — choisir un créneau
  ici était le premier pas d'une réservation.
- `transferVehicleForCategories` subsiste, mais comme **classement** : la classe
  sert à filtrer l'annuaire, elle ne détermine plus aucun prix.
- **Contact** (`/contact`): `ContactForm` with nom/prénom, e-mail, téléphone,
  type de demande, message. Client-side validation (required fields + email
  regex) and an animated success confirmation. **Demo mode**: the send is
  simulated (no e-mail backend wired). Both pages are fully bilingual
  (`contact.*` / `transfer.*` in `lib/dictionaries.ts`).

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

## Emails

- Envoi transactionnel via l'**API REST Resend** (sans SDK) dans `lib/email.ts`
  (`server-only`). Drapeau `isEmailConfigured` (exige `RESEND_API_KEY=re_…`).
  Sans clé, l'envoi est ignoré et rien n'échoue.
- ⚠️ **Un seul modèle subsiste** : `driverApprovedEmail`, envoyé quand un
  administrateur valide un chauffeur. `bookingRequestEmail`,
  `bookingConfirmedEmail` et `paymentReceivedEmail` ont été retirés avec la
  réservation et le paiement — la plateforme n'a plus de course à confirmer ni
  de règlement à accuser.
- Activer : `RESEND_API_KEY` + domaine `EMAIL_FROM` vérifié dans `.env.local`.

### Deux systèmes d'e-mail, à ne pas confondre

| | Ce qui part | Où ça se règle |
|---|---|---|
| **API Resend** | validation d'un chauffeur (seul modèle restant) | `RESEND_API_KEY` + `EMAIL_FROM` dans `.env.local` (`lib/email.ts`) |
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
| `RESEND_API_KEY` | **server only** | Clé Resend (`re_…`) pour l'e-mail de validation d'un chauffeur. Absente = envoi ignoré. |
| `EMAIL_FROM` | **server only** | Sender for emails, verified domain in Resend (e.g. `Nova Compagnie <reservations@novacompagnie.com>`). |

Empty/placeholder → demo mode. Flags in `lib/config.ts` decide behaviour at
runtime; never hard-require a key.

⚠️ **Deux variables ont disparu** : `STRIPE_SECRET_KEY` (plus de paiement) et
`GOOGLE_MAPS_API_KEY` (plus de champ d'adresse, donc plus de `/api/places`).
Les retirer aussi du `.env.local` de la VM lors du prochain déploiement.

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
  cleared on tab close), so it needs no consent.
- ⚠️ **Le périmètre RGPD a beaucoup rétréci** : plus de réservations, plus de
  messages, plus d'avis — donc plus aucune donnée de course conservée. Restent
  le compte (`profiles`), la fiche d'un chauffeur (`drivers`, `vehicles`) et ses
  **pièces justificatives** (`driver_documents` + bucket privé), qui sont
  désormais les données personnelles les plus sensibles du dépôt.
- ⚠️ **Les tables de courses existent encore en base** (`bookings`, `messages`,
  `reviews`) alors que plus rien ne les alimente ni ne les purge : c'est une
  conservation sans finalité. Le `drop` est écrit dans
  `supabase/migrations/2026-09-28-annuaire-retire-reservation.sql`, à relire et
  à lancer à la main. Tant qu'il ne l'est pas, `/api/account/export` continue
  de les interroger (sans rien trouver) et `delete_my_account()` s'appuie sur
  les `on delete cascade` depuis `profiles`.

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
  for Mapbox/Supabase, HSTS); `X-Powered-By` removed.
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
  in JS components (template) — fade-only fallback, no transform.

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

⚠️ **Il n'y a plus d'avis du tout**, et c'est la suite logique : `lib/reviews.ts`
ne certifiait un avis que par la course terminée qui l'avait produit, et il n'y a
plus de course (§ STATUT D'ANNUAIRE). Un avis libre ramènerait exactement le faux
avis qu'on vient de retirer.

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
- `Driver.id` porte le **slug**, pas l'uuid : c'est l'identifiant que les URL
  manipulent.
- Les tarifs sont re-bornés **à la lecture** (garde-fous de saisie, pas un
  barème), et `isListable` écarte une fiche **sans tarif** : la plateforme
  n'impose aucun prix et n'en invente aucun. Voir § Véhicules et tarifs.
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

⚠️ **Reste en dur** : `TransferEstimate` est le dernier composant client sans
page serveur pour l'alimenter — il lit encore `lib/drivers.ts`, donc rien, et
annonce « 0 chauffeur » sur tous les trajets. C'est le prochain câblage à faire
(lui passer la liste depuis `/transfert-aeroport`, comme `/drivers` le fait pour
`DriversExplorer`).

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
