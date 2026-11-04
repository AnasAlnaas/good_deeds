# Going live for testing: Vercel (free Hobby plan)

What runs where:

| Part | Where | Cost |
|---|---|---|
| The API (`server/`) | Vercel project `good-deeds-api` (<https://good-deeds-api-ashy.vercel.app>), a Vercel Function (`server/index.ts`) in Frankfurt | Free (Hobby) |
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
   | `LOGIN_CODE_DELIVERY` | leave it out: the app signs in with a password (see step 4) |
   | `CORS_ORIGINS` | the admin panel's address, after step 5, e.g. `https://good-deeds-admin.vercel.app` |
   | `ADMIN_PHONES` | the first admin's phone, e.g. `0912345678` (see step 5) |
   | `VERCEL_EXPERIMENTAL_BACKENDS` | `1`: Vercel's Hono build mode that bundles the server (its imports have no `.js` endings, which the default mode needs) |

   Also **Settings → Deployment Protection → Vercel Authentication**: set it to
   **Only Preview Deployments**, or the app cannot reach the API's address.

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

## 2. The tables

Nothing to do: every Vercel build runs `npm run db:migrate` first
(`server/vercel.json`), which applies new migrations and adds the levels if they
are missing. It uses Neon's direct address, `DATABASE_URL_UNPOOLED`. The demo
people and events are never loaded into this database. The branches of faith
are not loaded either: they come back with the course before joining events.

### Preview deployments

Every pushed branch gets a preview deployment with the same database settings
as production. `npm run db:migrate` does nothing there, so only a production
deploy (from `main`) changes the database. Previews still read and write the
production data; they are behind Vercel Authentication (step 4), so only the
team can open them.

### Starting with an empty database

To delete every account and record (before a beta, or when migrations went
wrong): either run `npm run db:reset -- --yes` in `server/` with the database
address in `server/.env`, or, as that address cannot be read out of Vercel,
add `RESET_DATABASE_AT_COMMIT` to the API project (Production) with the full
commit id that `main` is at and redeploy it. That deploy alone empties the
database before migrating; remove the setting afterwards. Then sign up again
as the first admin (step 5).

## 3. The scheduled job

`server/vercel.json` calls `/api/internal/tick` once a day, the most the Hobby
plan allows. That is enough: attendance left open is also closed the moment
anyone uses the app. Only the "confirm your hours" notification for auto-closed
attendance waits for it. To send that sooner, a free outside scheduler (e.g.
<https://cron-job.org>) can call it every few minutes:

- URL: `https://good-deeds-api.vercel.app/api/internal/tick` (GET)
- Header: `Authorization: Bearer <CRON_SECRET>`

## 4. Sign-in: phone number and password

SMS costs too much for now, so the app and the admin panel sign in with a phone
number and a password; nothing is sent to the phone. Nobody checks that a
number is the person's, so:

- **Forgotten password:** an admin opens **الأعضاء** in the panel, finds the
  person and presses **رمز استعادة**. The panel shows a 6-digit code once. The
  admin gives it to the person after checking it is them (a call to that
  number, or in person). In the app, the person taps **نسيت كلمة المرور؟** and
  types the code with a new password. A code works once, for a day.
- **Someone signed up with another person's number:** the same. The code lets
  the real owner choose a new password, and the other person is shut out.
- **Accounts made before passwords** (signed up with an SMS code while
  testing) get a reset code the same way. The app asks them for one.
- Ten wrong passwords in a day lock an account until the next day, or until
  a reset code.

The SMS sign-in is still in the server for later. Leave `LOGIN_CODE_DELIVERY`
unset (or `none`), so sign-in codes are no longer written to the log.

## 5. The first admin

1. Put the admin's phone number in `ADMIN_PHONES` (step 4; several are
   separated by commas) and redeploy.
2. Sign up in the app (step 6) with that number. The account is made admin as
   it signs in, and can sign in to the admin panel. If that number already has
   an account from before passwords, sign in with it instead: while the number
   is in `ADMIN_PHONES`, the password typed then becomes its password.
3. Then remove the number from `ADMIN_PHONES`: while it is there, demoting that
   person in the panel is undone at their next sign-in. After that, admins
   change roles in the panel.

With the database address in `server/.env`, `npm run make-admin -- 0912345678`
does the same for someone who has already signed up.

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
- **A new migration** (`npm run db:generate` made one): just push; the build applies it.

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
