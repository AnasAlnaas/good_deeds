# good_deeds
تطبيق الأعمال الصالحة

Good Deeds: a mobile app for Android and iOS.

## Layout

| Folder    | What it is |
|-----------|------------|
| `mobile/` | React Native app (Expo, TypeScript, Expo Router). One codebase for Android and iOS. |
| `server/` | Node.js API (TypeScript, Hono, PostgreSQL through Drizzle). |
| `admin/`  | Admin panel for the association's staff (React, Vite). Arabic. |
| `shared/` | The rules, data types and demo data, used by the app, the server and the admin panel. |

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
After adding `expo-secure-store`, `expo-image-picker` and `expo-image-manipulator`,
native builds (the test APK, a development build) must be rebuilt; Expo Go already has them.

The app follows the planning notes (`DESIGN.md`, `Screens.md`, `Data_Model.md`,
`Attendance_And_Hours.md`).

- **Arabic and English**, switchable in Settings; Arabic is right-to-left.
- **Demo accounts** on the login screen: two participants (male/female) and two supervisors.
- Map of Tripoli events, event list, event page with the three-pillar bar and branches of faith.
- Join flow with the one-item-per-screen terms carousel; capacity and men/women/mixed rules.
- Supervisor roster: record start and finish, with backdating limited to event start → now.
- Participant confirms or disputes recorded hours; confirming credits points per pillar.
- My activity, profile with level, account deletion.
- **Profile photo**: from the phone's photos or the camera, made a small square
  JPEG on the phone; the server removes its metadata (EXIF: place, phone). Seen
  only by the owner, admins and people of the same gender (owner's decision);
  everyone else sees the first letter of the name. Shown on the roster and the
  record screen, so the supervisor can see who stands in front of them.
- **Proposing an event** (Events tab → "اقترح فعالية"): opens at level 5, or for
  supervisors and admins. The creator becomes its supervisor and may choose only
  mixed or their own men/women category. It waits for an admin (at most 3 waiting
  per person), who approves or turns it down from the admin panel; the creator is
  notified either way. Until then only the creator sees it, under "أنظّمها".
  An admin's own event made in the app is published at once.

Try the full loop: sign in as **خالد منصور** (supervisor), open **حملة نظافة السراج**
(happening now) → roster → record start and finish for **أحمد سالم**. Then switch
account to أحمد → My activity → confirm the hours. As خالد you can also propose
an event (Events → اقترح فعالية); the demo has no admin, so it stays waiting.

`src/demo/server.ts` stands in for the backend. It calls the same rules as the
real server (`shared/rules.ts`), and the screens never compute hours or points.
`npm run check:rules` tries to break those rules (record yourself, backdate
before the event, join a full event…) and must report "All checks passed".

The map is OpenStreetMap through Leaflet in a web view (`src/components/OsmMap.tsx`),
so no Google Maps key is needed. Public OSM tiles are for testing only; switch
`TILE_URL` to a tile provider before launch.

### Push notifications

The app registers the phone for notifications when someone signs in to the
server ("Your account"), removes it at sign-out, and opens the right screen when
a notification is tapped. Set up already: Expo project `@anasalnaas/good-deeds`,
Firebase project `good-deeds-c2990` (`google-services.json`), and the Firebase
key uploaded to Expo. iPhone needs an Apple Developer account first.

Expo Go on Android cannot receive push notifications. To try them on a phone:

1. In `server/.env`, set `PUSH_DELIVERY=expo` (by default development only
   prints notifications in the server log), then `npm run dev` in `server/`.
2. Connect the phone by USB with USB debugging on, and from `mobile/` run
   `npx expo run:android --device`. This installs a development build; it
   finds the server on the same Wi-Fi by itself. (Or build it in the cloud:
   `npx eas-cli@latest build --platform android --profile development`, install
   it from the link, then `npx expo start`.)
3. In the app choose "Your account", sign in (the code is in the server log),
   and allow notifications.
4. Make something happen: a supervisor records your finish, or the admin panel
   changes the time or place of an event you joined.

### Test APK (Android)

Built on this PC, no Expo account needed (Android SDK + JDK 17+ required):

```bash
cd mobile
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

The APK is `mobile/android/app/build/outputs/apk/release/app-release.apk`. It is
signed with the Android debug key: fine for testers, not for Google Play.
`android/` is generated (and git-ignored); change native settings in `app.json`.
`--clean` rebuilds it from `app.json` each time, so changes such as the package
name (`com.islahtarbawi.gooddeeds`) are always picked up.

**Placeholders to replace** (`shared/placeholders.ts`): base points per event
type, level thresholds and the end-time grace period — they belong to
`Points_And_Levels.md`. Fields marked `DEMO-ONLY` in `shared/types.ts` are
not in `Data_Model.md` yet and need a decision. Marked `⚠️ ASSUMPTION` in
`shared/rules.ts`: who may propose events ("level + direct nomination" read as
level 5, or supervisor/admin) and how many proposals may wait at once (3).

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
| `npm run check:api` | Sends the same cheats as `check:rules`, plus sign-in, notification and admin checks, to the API on a fresh in-memory database. Must report "All checks passed" twice. |
| `npm run db:seed` | Empties the development database and reloads the demo data. Stop `npm run dev` first: only one process may open the PGlite folder, and a second one is refused. |
| `npm run db:generate` | After changing `src/db/schema.ts`: writes the SQL migration into `drizzle/`. Commit it. |
| `npm run typecheck` | Also fails if the database schema and `shared/types.ts` stop matching. |
| `npm run make-admin -- +2189…` | Makes the person with this phone an admin (they sign up in the app first). How the first admin is made on a real server. |

How it fits together:

- `src/app.ts` builds the API (Hono); `src/node.ts` serves it and runs the job that
  closes attendance left open when an event ends.
- `src/routes/` holds the endpoints. Each change runs in a transaction: read and lock
  the rows, let `shared/rules.ts` decide, write the result.
- Every request except sign-in needs `Authorization: Bearer <token>` from
  `POST /api/auth/verify-code`. Errors come back as `{ "error": "<code>" }`.
- `shared/api.ts` lists every response the app will receive.
- `src/notify.ts` sends push notifications to every phone a person registered
  (`PUT /api/me/push-token`): "your hours are waiting for you" when a
  supervisor records their finish or the job closes it; "your dispute was
  reviewed" when an admin decides; and, to the members who joined and the
  supervisors, "event cancelled" or "new time / new place" (with the new value
  in the message; a corrected title or description sends nothing). It sends
  through Expo's push service in production and prints to the server log in
  development. Times are written in `TIME_ZONE` (default Africa/Tripoli).
  Whoever proposed an event in the app is told when it is approved or turned
  down (with the admin's reason, if given).
- Profile photos are kept in the database (`user_photos`), so the server needs no
  file storage. `GET /api/users/:id/photo` serves one only to those allowed to
  see it (`rules.canSeePhoto`), and answers 404 to anyone else.
- Events proposed in the app are drafts (`events.status = 'draft'`) until an admin
  publishes them, or `rejected` if turned down: neither is listed for anyone but
  their creator.

Settings are environment variables; see `server/.env.example`. In production
(`NODE_ENV=production`) `DATABASE_URL` and `JWT_SECRET` are required, and sign-in
is refused until an SMS provider is added. On a VPS: `npm ci`, run migrations by
starting once, `npm run db:seed -- --reference` for branches and levels, then keep
`npm start` running under a process manager.

## Admin panel

```bash
cd admin
npm install
npm run dev        # http://localhost:5173 (the server must be running)
```

Sign in with an admin's phone number. In development the code appears in the
server log, and the development database has an admin: **0910000000**.

- **Overview**: disputes and proposed events waiting, events running and
  upcoming, drafts, hours waiting for their owners to confirm.
- **Events**: create (as a draft or published), edit, publish, cancel. Choose
  the type (it sets the points), branches of faith, supervisors and terms.
  What people already agreed to is protected: terms lock at the first
  acceptance, the men/women/mixed category once someone joined, the time and
  type once attendance was recorded. An event proposed in the app shows who
  proposed it; approve it (publish) or turn it down with a reason, which is sent
  to them. An admin's own draft can be discarded the same way.
- **Disputes**: accept the recorded hours, correct them, or count none, with a
  reason. Points are credited like a confirmation and the member is notified.
- **Members**: search, change roles (member, supervisor, admin). Each member's
  photo is shown (click to open it full size); an unsuitable one can be removed,
  and the member is told and may add another.
- **Hours report**: confirmed hours and points per member for a period;
  downloads as a CSV that Excel opens with Arabic intact.
- **Audit log**: every admin decision, who made it and when.

The server address comes from `VITE_API_URL` (see `admin/.env.example`); empty
means `http://localhost:3000`. In production, add the panel's address to the
server's `CORS_ORIGINS`.

