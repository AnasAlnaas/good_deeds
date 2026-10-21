# good_deeds
تطبيق الأعمال الصالحة

Good Deeds: a mobile app for Android and iOS.

## Layout

| Folder    | What it is |
|-----------|------------|
| `mobile/` | React Native app (Expo, TypeScript, Expo Router). One codebase for Android and iOS. |
| `server/` | Node.js API (TypeScript), deployed on Vercel as serverless functions in `server/api/`. |

## Mobile app

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your phone, or press `a` for an Android emulator.
iOS builds are made in the cloud with EAS (`npx eas-cli@latest build -p ios`), so no Mac is needed.
On Windows PowerShell, use `npx.cmd` / `npm.cmd` if scripts are blocked.

### Current state: offline demo

The app is a clickable demo with no server. Its data lives on the phone and
"Reset the demo data" in Settings puts it back to the start. It follows the
planning notes (`DESIGN.md`, `Screens.md`, `Data_Model.md`, `Attendance_And_Hours.md`).

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

`src/demo/server.ts` stands in for the backend: every rule that must be enforced
on the server lives there, and the screens never compute hours or points.
`npm run check:rules` tries to break those rules (record yourself, backdate
before the event, join a full event…) and must report "All checks passed".

**Placeholders to replace** (`src/demo/placeholders.ts`): base points per event
type, level thresholds and the end-time grace period — they belong to
`Points_And_Levels.md`. Fields marked `DEMO-ONLY` in `src/data/types.ts` are
not in `Data_Model.md` yet and need a decision.

## API

```bash
cd server
npm install
npm run dev        # runs locally with `vercel dev`
```

Each file in `server/api/` becomes an endpoint, e.g. `api/health.ts` → `GET /api/health`.

To deploy: import the repo in Vercel and set **Root Directory** to `server`.
