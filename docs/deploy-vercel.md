# Going live for testing: Vercel (free Hobby plan)

What runs where:

| Part | Where | Cost |
|---|---|---|
| The API (`server/`) | Vercel project `good-deeds-api`, a Vercel Function (`server/index.ts`) in Frankfurt | Free (Hobby) |
| The admin panel (`admin/`) | Vercel project `good-deeds-admin`, static files | Free (Hobby) |
| The database | Postgres at Neon, made from inside Vercel | Free: 0.5 GB |
| The app | A test APK pointing at the API's address | Free |

Both projects deploy by themselves on every `git push`. Steps marked **you**
need your account and a browser.

## 1. The two Vercel projects — you

1. Sign in at <https://vercel.com/signup> **with GitHub** (the same account that
   owns `AnasAlnaas/good_deeds`).
2. **Add New → Project → Import** `good_deeds`, then:
   - **Project name:** `good-deeds-api`
   - **Root Directory:** `server` (Vercel finds `index.ts` and uses the Hono preset)
   - Leave the build settings as they are, and **Deploy**. This first deploy
     fails until step 3 adds the settings; that is expected.
3. In `good-deeds-api` → **Storage → Create Database → Neon** (free plan,
   region **Frankfurt**), and connect it to the project. This adds
   `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`) to the project by itself.
4. `good-deeds-api` → **Settings → Environment Variables**, for Production:

   | Name | Value |
   |---|---|
   | `JWT_SECRET` | a long random value: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `CRON_SECRET` | another random value, made the same way |
   | `TRUST_PROXY` | `1` (Vercel sets the caller's address itself) |
   | `LOGIN_CODE_DELIVERY` | `console` (testing only, see step 4) |
   | `CORS_ORIGINS` | the admin panel's address, after step 5, e.g. `https://good-deeds-admin.vercel.app` |

5. **Add New → Project → Import** `good_deeds` again:
   - **Project name:** `good-deeds-admin`
   - **Root Directory:** `admin` (Vite preset)
   - **Environment Variable:** `VITE_API_URL` = the API's address, e.g.
     `https://good-deeds-api.vercel.app`
6. **Which branch:** Vercel deploys `main` as production. Merge
   [the open pull request](https://github.com/AnasAlnaas/good_deeds/pull/3)
   first, or set **Settings → Git → Production Branch** to `feature/offline-demo`
   in both projects. Then **Redeploy** both.

`https://good-deeds-api.vercel.app/api/health` answers `{"ok":true,…}`.

## 2. The tables (from this PC)

Copy `DATABASE_URL_UNPOOLED` from `good-deeds-api` → **Settings → Environment
Variables** into `server/.env` as `DATABASE_URL` (the file is never committed;
the unpooled address suits migrations). Then, in `server/`:

```bash
npm run db:migrate
```

```bash
npm run db:seed -- --reference
```

That makes the tables and adds the branches of faith and the levels. The demo
people and events are never loaded into this database.

## 3. The scheduled job

`server/vercel.json` calls `/api/internal/tick` once a day, the most the Hobby
plan allows. That is enough: attendance left open is also closed the moment
anyone uses the app. Only the "confirm your hours" notification for auto-closed
attendance waits for it. To send that sooner, a free outside scheduler (e.g.
<https://cron-job.org>) can call it every few minutes:

- URL: `https://good-deeds-api.vercel.app/api/internal/tick` (GET)
- Header: `Authorization: Bearer <CRON_SECRET>`

## 4. Sign-in codes while testing

There is no SMS provider yet, so with `LOGIN_CODE_DELIVERY=console` a sign-in
code is written to the log instead of being sent. Read it in `good-deeds-api` →
**Logs** (search `sign-in code`). Hobby keeps logs for one hour. Testers ask
whoever watches the logs for their code. Before real members use the app, add
an SMS provider.

## 5. The first admin

1. Sign up in the app (step 6) with the admin's phone number.
2. From this PC, with `DATABASE_URL` still in `server/.env`:

   ```bash
   npm run make-admin -- +218912345678
   ```

That person can sign in to the admin panel; after that, admins change roles in
the panel.

## 6. The test APK

In `mobile/`, copy `.env.example` to `.env.local` and set:

```
EXPO_PUBLIC_API_URL=https://good-deeds-api.vercel.app
```

Then `npm run apk` (README, "Test APK"). The sign-in screen offers the server
or the offline demo.

Push notifications in an APK also need the Firebase (FCM) key uploaded to the
Expo project once (expo.dev → the project → **Credentials** → Android → FCM V1).

## Later changes

- **Code:** `git push`; both projects redeploy.
- **A new migration** (`npm run db:generate` made one): `npm run db:migrate`
  first, then push.

## What to know about the free plan

- **Hobby is for non-commercial use.** Fine for testing; a paid plan (Pro) is
  for when the association runs on it for real.
- **Cron once a day**, at a time within the hour it is set for (see step 3).
- **Logs are kept one hour.**
- **Neon sleeps after a few idle minutes**, so the first request after a quiet
  spell takes a second or two longer.
- The sign-in limit per network address is counted in each running instance's
  memory, so it is looser than on one server; the limits per phone number are in
  the database and hold.
