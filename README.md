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
The app's store page goes in `EXPO_PUBLIC_SHARE_URL`: a shared event ends with it (unset = no link).
The privacy policy's address goes in `EXPO_PUBLIC_PRIVACY_URL`; Settings links to it,
and shows no link without it. The admins' email goes in `EXPO_PUBLIC_CONTACT_EMAIL`;
Settings ("راسل إدارة الجمعية") and the reset step for people without email
(who need a code from the admins) open an email to it, and show no button without it. The policy itself, the Data safety answers and the
store listing are drafts in `docs/` (⚠️ marks what the association must fill in).
After adding `expo-secure-store`, `expo-image-picker` and `expo-image-manipulator`,
native builds (the test APK, a development build) must be rebuilt; Expo Go already has them.

The app follows the planning notes (`DESIGN.md`, `Screens.md`, `Data_Model.md`,
`Attendance_And_Hours.md`).

- **Arabic and English**, switchable in Settings; Arabic is right-to-left.
- **Demo accounts** on the login screen: two participants (male/female) and two supervisors.
- **One main screen, the map** of Tripoli events. Everything else opens from its
  icons as a full screen that comes back to the map: your profile (your photo,
  top), search, the event list, My activity, and proposing an event.
- A **filter by class of good work** on the map and in the list: بيئة، صحة،
  تعلُّم وتعليم، مجتمع. Each event type belongs to one class (`shared/classes.ts`,
  where a class is added in one line).
- The map only shows where events are. **Directions** open Google Maps (Apple
  Maps on an iPhone) from the event page or the event's card on the map.
- Event page with its class and branches of faith.
- Join flow with the one-item-per-screen terms carousel; capacity and men/women/mixed rules.
- Supervisor roster: record start and finish, with backdating limited to event start → now.
- Participant confirms or disputes recorded hours; confirming credits points (one total per person).
- **Points and levels** (owner's decisions, 2026-11-18, in `shared/placeholders.ts`
  and `shared/rules.ts`; the point made a minute on 2026-11-19): a point is a
  minute of confirmed work, to the nearest minute (`rules.pointsForHours`:
  1 h 10 min 40 s = 71), whatever the event's type. Everyone starts at level 0;
  ten levels follow, 7500 points (125 hours) in all (150, 360, 660, 1050, 1500,
  2100, 3000, 4200, 5700, 7500). Level 5 (1500 points, 25 hours) unlocks
  proposing events. The profile shows the road of levels,
  and after the tenth a few dark, flickering ones still to come (more levels are
  set later). The levels' names are chosen later (`levelNames` in
  `mobile/src/i18n/strings.ts`); until then a level shows its number.
- **The supervisor's pledge and hours** (owner's decisions, 2026-11-18): the
  supervisor answers for the points. Before recording anyone at an event, each
  of its supervisors reads "تسجيل الحضور أمانة" and pledges, once per event
  (`POST /api/events/:id/pledge`; recording waits for it). Supervising counts:
  the roster lists the event's other supervisors, who record each other's hours.
  An event with a single supervisor credits them its whole time when it ends,
  if someone else's attendance was recorded there, to confirm like any record.
- My activity, profile with level, account deletion.
- **Editing the profile** (Profile → "عدّل بياناتك"): the name and the city,
  checked as at sign-up. Gender stays as it was set at sign-up (it decides which
  events a person may join), and so does the phone
  (sign-in is by phone); the screen says so.
- **Profile photo**: from the phone's photos or the camera, made a small square
  JPEG on the phone; the server removes its metadata (EXIF: place, phone). Seen
  by everyone signed in (owner's decision, 2026-11-17; before, only the same gender);
  without one, the first letter of the name shows. Shown on the roster and the
  record screen, so the supervisor can see who stands in front of them.
- **Proposing an event** (Events tab → "اقترح فعالية"): opens at level 5 (1500 points), or for
  supervisors and admins. The creator becomes its supervisor and may choose only
  mixed or their own men/women category. It waits for an admin (at most 3 waiting
  per person); once an admin approved 8 of a person's events in their own name,
  the next ones are published at once (owner's decision, 2026-11-18). An admin approves or turns it down from the admin panel; the creator is
  notified either way. Until then only the creator sees it, under "أنظّمها",
  and may edit it with the same form and checks ("عدّل اقتراحك") or withdraw it
  ("اسحب اقتراحك"), which deletes it. Once it is approved or turned down, only
  admins change it, in the panel. An admin's own event made in the app is
  published at once.
- **Online events** (owner's decision, 2026-11-07): an event happens in a place
  (an address and a map pin) or online (a platform: Zoom, Google Meet, Teams,
  Telegram or another, and an https meeting link). Both forms (the app's
  proposal form and the admin panel) switch between the two; `rules.cleanPlace`
  keeps only the chosen kind's fields. Online events have no pin: the map shows
  a bar, "فعاليات عن بُعد: N", that opens the list filtered to them, and the
  list filters by "في مكان / عن بُعد". Their times say "بتوقيت طرابلس".
  The link never travels with the events list; the event's page gives it to
  those who joined, from 30 minutes before the start until the end, and to its
  supervisors and admins at any time (`rules.canSeeMeetingLink`). At that moment
  everyone who joined is notified once, and again if the start moves.
  Attendance, points, capacity and the men/women rule work as for any event:
  a supervisor records who attended.
- **Event cards and covers** (owner's decisions, 2026-11-17, design ج): every
  card and event page opens with a cover, the title and the day over it. The
  cover is a photo the proposer chose on the form (cropped to 16:9 on the
  phone, sent like a lesson's picture, metadata removed), or, without one, a
  cover drawn from the event's class. The picker says to choose the place or
  the work, not people's faces. Covers show at once, also on events published
  without review; an admin removes an unsuitable one from the event's page in
  the panel, and whoever proposed it is notified. Admins can also set one in
  the panel's form.
- **Institutions** (جمعية، مؤسسة، مدرسة، جامعة، مسجد، شركة، فريق تطوعي; owner's
  decisions, 2026-11-17). Profile → "مؤسساتك":
  - A member asks to add one (its name and kind); an admin approves or turns it
    down in the panel (المؤسسات). Whoever asked is its first representative;
    only admins add or remove others (by phone number).
  - Its representatives propose events in its name (the form asks "باسم من
    تقترحها؟"), at any level; in their own name the level rule stays. Its first
    3 approved events wait for an admin (`rules.INSTITUTION_REVIEWED_EVENTS`,
    counted per institution); after that its events are published at once.
    The proposer supervises, as for any proposal. Events show "تنظّمها: …"
    instead of the association.
  - A volunteer asks to belong to one or several; a representative confirms
    each, and can take a member off.
  - Hours: the volunteer's hours record names each event's institution; the
    panel's hours report filters by organiser (an institution, or the
    association's own events) and lists the institutions each person belongs to.
  - The demo has one: فريق شباب السراج التطوعي, represented by خالد, with أحمد
    in it and a request waiting. It has no admin, so new requests stay waiting.
- **Reports (بلاغ) and warnings (إنذار)**, kept apart as the master file decides:
  a member reports, a supervisor warns.
  - *Report*: from the event page ("أبلغ عن مشكلة") or Profile → "بلاغاتك".
    A category (someone's behaviour, something unsafe, an event not as described,
    the app, something else) and an optional note (needed for "something else").
    It may be tied to an event the member was at, and name someone who was at
    that event. Only admins read it; the person named is never told. Who may
    report is `levels.can_report` (supervisors and admins always may); at most 5
    may wait at once. The reporter is told when an admin has looked at it.
  - *Warning*: a supervisor of the event, from its roster ("سجّل إنذاراً"),
    gives one to someone who joined it, with a reason, from the event's start
    until 7 days after it ends. It is recorded only: it takes no points and
    blocks nothing. The member is told (without the reason, which can show on a
    locked screen) and sees it under Profile → "إنذاراتك"; nobody but the member
    and the admins sees it. The member may appeal once with a reason; an admin
    keeps it or withdraws it, and the member reads the admin's note in the app.

Try the full loop: sign in as **خالد منصور** (supervisor), open **حملة نظافة السراج**
(happening now) → roster → record start and finish for **أحمد سالم**. Then switch
account to أحمد → My activity → confirm the hours. As خالد you can also propose
an event (Events → اقترح فعالية), in a place or online; the demo has no admin, so it stays waiting.
The demo has two online events: **دروس تقوية في الرياضيات عن بُعد** starts
20 minutes after the demo data is made, and أحمد, who joined it, sees its link;
**حلقة تحفيظ للأخوات عن بُعد** is two days away, so مريم sees when its link opens.
On the same roster, "سجّل إنذاراً" warns أحمد; as أحمد, Profile → إنذاراتك shows it
and lets him appeal, and the event page's "أبلغ عن مشكلة" sends a report. With no
admin in the demo, reports and appeals stay waiting.

`src/demo/server.ts` stands in for the backend. It calls the same rules as the
real server (`shared/rules.ts`), and the screens never compute hours or points.
`npm run check:rules` tries to break those rules (record yourself, backdate
before the event, join a full event…) and must report "All checks passed".

The map is OpenStreetMap through Leaflet in a web view (`src/components/OsmMap.tsx`),
so no Google Maps key is needed. Public OSM tiles are for testing only; switch
`TILE_URL` to a tile provider before launch.

### Hours outside the app, certificates and reports

Owner's decisions (2026-11-19). A member logs hours done for one of their
institutions outside the app's events (Hours record → ساعات خارج التطبيق): a day
within the last two weeks, up to 12 hours, what they did, and if they like a place
and a photo. One claim waits for each institution at a time. Its representative
approves it (a point a minute, like an event) or turns it down with a reason
(Institutions → ساعات خارج التطبيق); a representative may approve their own.
The demo has one waiting from أحمد for خالد.

The hours record makes a PDF certificate (expo-print): all hours, or one
institution's. The server writes down what it says (`POST /api/me/certificates`)
and its QR code opens `GET /api/verify/<code>`, a public page with only the name,
the hours and the day it was made. Set `PUBLIC_URL` on the server to its public
address so the QR link is right behind a proxy. The demo's certificates have no QR
code. Representatives download their institution's hours report as a CSV
(Institutions → تقرير الساعات); the admin panel's report counts outside hours too,
and its overview shows hours by month, organiser and city.

### Badges and leaderboards

Owner's decisions (2026-11-20; `shared/badges.ts`). Badges come from a person's own
record: confirmed events (1, 5, 10, 25, 50), events in one class (5, 10, 20: seed,
sapling, fruitful tree), classes tried (2, 3, all 4), months in a row (3, 6, 12),
lessons learned (10, 25), and a confirmed event in Ramadan or in the first ten days
of Dhul Hijjah. They are awarded where points are credited, where a lesson is
learned and when the profile loads; the timer pushes each new one once, and the app
celebrates it the next time the profile opens. Everyone sees them (Profile, and a
person's page from the leaderboard).

Hijri dates follow Umm al-Qura (`shared/hijri.ts`, a table to 1457 / 2035, extend
before then). After the moon is sighted an admin moves a month's start a day either
way in the panel (الأشهر الهجرية).

Leaderboards rank this month's confirmed hours (events and approved outside-app
hours), for the whole association or one of the person's institutions. Nobody is
listed until they choose "show me" on the leaderboard screen; the demo's people
have it on.

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
npm run apk
```

That builds for 64-bit phones (almost every phone in use); `npm run apk -- --all`
also covers old 32-bit phones and takes longer. The Android emulator on a PC is
x86_64 and cannot start the phone APK; `npm run apk -- --emulator` builds a copy
for it. `android/` is made again only
when `app.json`, the packages, `plugins/` or the brand pictures changed, so later
builds reuse the last one and are much faster. The first build after a change
like that is the slow one.

The APK is copied to `mobile/builds/good-deeds-<version>-arm64.apk`. It is
signed with the Android debug key: fine for testers, not for Google Play.
`android/` is generated (and git-ignored); change native settings in `app.json`.
`--clean` rebuilds it from `app.json` each time, so changes such as the package
name (`com.islahtarbawi.gooddeeds`) are always picked up.

**Fixes without a new APK** (over-the-air updates, EAS Update). For a change to
the app's own code, text or pictures:

```bash
cd mobile
npm run update -- "What the update changes"
```

It bundles the app with the same `.env.local` as the APK, checks the server's
address is inside, and sends it to the `preview` channel, which the APKs ask for
updates. A phone downloads it while the app starts and runs it from the next
start, so close and reopen the app twice to see it. An update cannot add
anything native: a new library with native code, a change to `app.json`, the
icon or splash, or a new Expo SDK. Those need a new APK, and then raise
`version` in `app.json` too, so phones with the older APK are not sent code
they cannot run (updates only go to APKs with the same version). See the sent
updates at expo.dev → the project → **Updates**.

**Crash and error reports** (Sentry, `mobile/src/data/crashes.ts`). On when
`EXPO_PUBLIC_SENTRY_DSN` is set in `mobile/.env.local`, and never during
development. Reports show at sentry.io with the phone, the app version and the
update it ran. For readable lines of code in them, also set `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG` and `SENTRY_PROJECT` in the shell before `npm run apk`; without
them the build skips that step.

**Placeholders to replace** (`shared/placeholders.ts`): the end-time grace
period, and the levels after the tenth (not set yet). The points and the ten
levels are the owner's (2026-11-18, above). Fields marked `DEMO-ONLY` in `shared/types.ts` are
not in `Data_Model.md` yet and need a decision. Decided by the owner
(2026-10-22, in `shared/rules.ts`): events may be proposed from level 5 or by
supervisors and admins ("level + direct nomination"), at most 3 may wait at
once, and a proposal is mixed or for the proposer's own men/women category.
Decided by the owner (2026-10-22/23, in `shared/rules.ts`): a report is about
anything, by category, with an optional note, and may name someone at its event;
a warning is given by a supervisor of the event, recorded only, seen by the
member (who is notified) and admins, has no severity, and may be appealed once.
Also decided: at most 5 reports waiting at once, warnings up to 7 days after an
event, one warning per supervisor, person and event, a note needed for
"something else", supervisors reporting whatever their level, and the reporter
told when their report has been looked at.
`reports` and `warnings` differ from `Data_Model.md` (see `shared/types.ts`):
a report has an event and a person instead of one target, and a warning has
no severity but records its event, the appeal and the decision.

## API

Needs Node.js 24 (`.nvmrc`).

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
| `npm run check:api` | Sends the same cheats as `check:rules`, plus sign-in, notification and admin checks, to the API on a fresh in-memory database. Must report "All checks passed" three times (the third suite, `check-online.ts`, covers online events). |
| `npm run db:seed` | Empties the development (PGlite) database and reloads the demo data. Stop `npm run dev` first: only one process may open the PGlite folder, and a second one is refused. Refused for a `DATABASE_URL` database, whose demo data would include an admin whose phone is in the code; use `--reference` there. |
| `npm run db:generate` | After changing `src/db/schema.ts`: writes the SQL migration into `drizzle/`. Commit it. |
| `npm run typecheck` | Also fails if the database schema and `shared/types.ts` stop matching. |
| `npm run make-admin -- +2189…` | Makes the person with this phone an admin (they sign up in the app first). How the first admin is made on a real server. |

How it fits together:

- `src/create-app.ts` builds the API (Hono); `src/node.ts` serves it and runs the job that
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
  down (with the admin's reason, if given). A member is told when a supervisor
  gives them a warning and when an admin decides on it, and whoever reported
  something is told when an admin has looked at it. For an online event, those
  who joined and its supervisors are told when its link opens, 30 minutes before
  the start (once per start time; the same job as the auto-close sends it), and
  a change says "now online", "new link" (without the link) or the new time.
- Reports and warnings: `POST /api/reports` (with `GET /api/reports/form` for
  what the screen offers), `POST /api/events/:id/warnings/:userId` from the
  roster, `POST /api/warnings/:id/appeal`, and the member's own lists under
  `/api/me/reports` and `/api/me/warnings`. Nobody else's warnings reach the app.
- Profile photos are kept in the database (`user_photos`), so the server needs no
  file storage. `GET /api/users/:id/photo` serves one only to those allowed to
  see it (`rules.canSeePhoto`), and answers 404 to anyone else.
- Events proposed in the app are drafts (`events.status = 'draft'`) until an admin
  publishes them, or `rejected` if turned down: neither is listed for anyone but
  their creator. While it is a draft, its creator may `PUT /api/events/:id` (the
  same body and checks as `POST /api/events`; its supervisors stay) or
  `DELETE /api/events/:id`. A withdrawn draft is deleted rather than marked
  `rejected`: nothing can point at a draft but its own branches, supervisors
  and terms, and `rejected` would read as an admin's decision.
- `PATCH /api/me` changes the name and/or the city (`rules.cleanProfileEdit`);
  any other field, gender and phone included, is refused as `invalid_request`.

Settings are environment variables; see `server/.env.example`. In production
(`NODE_ENV=production`) `DATABASE_URL` is required, and sign-in is refused until
an SMS provider is added. `JWT_SECRET` (at least 32 characters) is required
whenever `DATABASE_URL` is set, whatever `NODE_ENV` says: the server will not
start without it. With PGlite and no `JWT_SECRET`, the server makes a random one
and keeps it in `.data/jwt-secret`. Demo data is loaded only into an empty PGlite
database, never into a `DATABASE_URL` one. On a VPS: set `NODE_ENV=production`,
`DATABASE_URL` and `JWT_SECRET`, `npm ci`, run migrations by starting once,
`npm run db:seed -- --reference` for branches and levels, then keep `npm start`
running under a process manager. Behind a reverse proxy, also set `TRUST_PROXY=1`.

**On Vercel (free Hobby plan, for testing):** the same API runs as a Vercel
Function (`server/index.ts`, `server/vercel.json`) with the database at Neon,
and the admin panel is a second Vercel project. Steps:
[docs/deploy-vercel.md](docs/deploy-vercel.md).

Limits: a request body may be at most about 460 KB (a profile photo with room to
spare; `too_large` otherwise). Sign-in allows, per phone over 24 hours, 5 codes
and 10 wrong codes, and per network address 20 codes an hour (`try_later`
otherwise), so a code cannot be guessed and SMS cannot be sent in bulk.

## Admin panel

```bash
cd admin
npm install
npm run dev        # http://localhost:5173 (the server must be running)
```

Sign in with an admin's phone number. In development the code appears in the
server log, and the development database has an admin: **0910000000**.

- **Overview**: disputes, proposed events, open reports and appealed warnings
  waiting, events running and upcoming, drafts, hours waiting for their owners
  to confirm.
- **Events**: create (as a draft or published), edit, publish, cancel. Choose
  the type, branches of faith, supervisors and terms (the points come from the time: a point a minute).
  What people already agreed to is protected: terms lock at the first
  acceptance, the men/women/mixed category once someone joined, the time and
  type once attendance was recorded. An event proposed in the app shows who
  proposed it; approve it (publish) or turn it down with a reason, which is sent
  to them. An admin's own draft can be discarded the same way.
- **Disputes**: accept the recorded hours, correct them, or count none, with a
  reason. Points are credited like a confirmation and the member is notified.
- **Reports**: what members reported, open or closed, with who sent it, the
  event and the person named. Close one with a note saying what was done (kept
  in the audit log); the reporter is told only that it was looked at.
- **Warnings**: every supervisor's warning, or one member's (from the members
  list). Keep an appealed warning or withdraw one, with a note the member reads.
- **Members**: search, change roles (member, supervisor, admin), see how many
  warnings stand against each one. Each member's
  photo is shown (click to open it full size); an unsuitable one can be removed,
  and the member is told and may add another.
- **Hours report**: confirmed hours and points per member for a period;
  downloads as a CSV that Excel opens with Arabic intact.
- **Audit log**: every admin decision, who made it and when.

The server address comes from `VITE_API_URL` (see `admin/.env.example`); empty
means `http://localhost:3000`. In production, add the panel's address to the
server's `CORS_ORIGINS`.

