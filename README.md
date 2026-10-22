# good_deeds
تطبيق الأعمال الصالحة

Good Deeds: a mobile app for Android and iOS.

## Layout

| Folder    | What it is |
|-----------|------------|
| `mobile/` | React Native app (Expo, TypeScript, Expo Router). One codebase for Android and iOS. |
| `server/` | Node.js API (TypeScript, Hono, PostgreSQL through Drizzle). |
| `shared/` | The rules, data types and demo data, used by both the app and the server. |

## Mobile app

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your phone, or press `a` for an Android emulator.
iOS builds are made in the cloud with EAS (`npx eas-cli@latest build -p ios`), so no Mac is needed.
On Windows PowerShell, use `npx.cmd` / `npm.cmd` if scripts are blocked.

### Two modes: demo and server

The login screen offers two modes:

- **Demo accounts**: the offline demo. Its data lives on the phone and "Reset
  the demo data" in Settings puts it back to the start. Good for presentations.
- **Your account**: sign-in by phone against the server (see API below). The
  token is kept in the phone's keychain/keystore.

Both go through one interface (`src/data/backend.ts`) with two implementations,
`demoBackend.ts` and `apiBackend.ts`, so every screen works the same in both.
Screens read data through the hooks in `src/data/queries.ts` (TanStack Query)
and make changes through `useAction`.

Where the server is: `EXPO_PUBLIC_API_URL` in `mobile/.env` (e.g.
`https://api.example.com`). In development without it, the app looks for the
server on port 3000 of the computer running `npx expo start`, so a phone on the
same Wi-Fi finds `npm run dev` with no setup. A build without either shows only
the demo. Android blocks plain `http://` in release builds, so a test APK needs
the server behind HTTPS; Expo Go and development builds are fine with `http://`.
After adding `expo-secure-store`, native builds (the test APK) must be rebuilt.

The app follows the planning notes (`DESIGN.md`, `Screens.md`, `Data_Model.md`,
`Attendance_And_Hours.md`).

- **Arabic and English**, switchable in Settings; Arabic is right-to-left.
- **Demo accounts** on the login screen: two participants (male/female) and two supervisors.
- Map of Tripoli events, event list, event page with the three-pillar bar and branches of faith.
- Join flow with the one-item-per-screen terms carousel; capacity and men/women/mixed rules.
- Supervisor roster: record start and finish, with backdating limited to event start → now.
- Participant confirms or disputes recorded hours; confirming credits points per pillar.
- My activity, profile with level, account deletion.

Try the full loop: sign in as **خالد منصور** (supervisor), open **حملة نظافة السراج**
(happening now) → roster → record start and finish for **أحمد سالم**. Then switch
account to أحمد → My activity → confirm the hours.

`src/demo/server.ts` stands in for the backend. It calls the same rules as the
real server (`shared/rules.ts`), and the screens never compute hours or points.
`npm run check:rules` tries to break those rules (record yourself, backdate
before the event, join a full event…) and must report "All checks passed".

The map is OpenStreetMap through Leaflet in a web view (`src/components/OsmMap.tsx`),
so no Google Maps key is needed. Public OSM tiles are for testing only; switch
`TILE_URL` to a tile provider before launch.

### Test APK (Android)

Built on this PC, no Expo account needed (Android SDK + JDK 17+ required):

```bash
cd mobile
npx expo prebuild --platform android
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

The APK is `mobile/android/app/build/outputs/apk/release/app-release.apk`. It is
signed with the Android debug key: fine for testers, not for Google Play.
`android/` is generated (and git-ignored); change native settings in `app.json`.

**Placeholders to replace** (`shared/placeholders.ts`): base points per event
type, level thresholds and the end-time grace period — they belong to
`Points_And_Levels.md`. Fields marked `DEMO-ONLY` in `shared/types.ts` are
not in `Data_Model.md` yet and need a decision.

## API

```bash
cd server
npm install
npm run dev        # http://localhost:3000/api/health
```

Nothing else to install: without `DATABASE_URL` the database is PGlite (PostgreSQL
running inside Node) in `server/.data/`, filled with the demo data on first start.
Sign-in codes are printed in the server log. A phone on the same Wi-Fi reaches the
API at the laptop's address, e.g. `http://192.168.1.20:3000`.

| Command | What it does |
|---|---|
| `npm run check:api` | Sends the same cheats as `check:rules`, plus sign-in checks, to the API on a fresh in-memory database. Must report "All checks passed". |
| `npm run db:seed` | Empties the development database and reloads the demo data. Stop `npm run dev` first: only one process may open the PGlite folder, and a second one is refused. |
| `npm run db:generate` | After changing `src/db/schema.ts`: writes the SQL migration into `drizzle/`. Commit it. |
| `npm run typecheck` | Also fails if the database schema and `shared/types.ts` stop matching. |

How it fits together:

- `src/app.ts` builds the API (Hono); `src/node.ts` serves it and runs the job that
  closes attendance left open when an event ends.
- `src/routes/` holds the endpoints. Each change runs in a transaction: read and lock
  the rows, let `shared/rules.ts` decide, write the result.
- Every request except sign-in needs `Authorization: Bearer <token>` from
  `POST /api/auth/verify-code`. Errors come back as `{ "error": "<code>" }`.
- `shared/api.ts` lists every response the app will receive.
- `src/notify.ts` tells a participant "your hours are waiting for you" when a
  supervisor records their finish or the job closes it, on every phone that
  registered a push token (`PUT /api/me/push-token`). It sends through Expo's
  push service in production and prints to the server log in development.

Settings are environment variables; see `server/.env.example`. In production
(`NODE_ENV=production`) `DATABASE_URL` and `JWT_SECRET` are required, and sign-in
is refused until an SMS provider is added. On a VPS: `npm ci`, run migrations by
starting once, `npm run db:seed -- --reference` for branches and levels, then keep
`npm start` running under a process manager.
