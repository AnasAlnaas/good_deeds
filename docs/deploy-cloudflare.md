# Going live for testing: Cloudflare (free plan)

What runs where:

| Part | Where | Cost |
|---|---|---|
| The API (`server/`) | A Cloudflare Worker, `good-deeds-api` | Free: 100,000 requests a day, 10 ms CPU per request |
| The admin panel (`admin/`) | The same Worker, at the same address | Free: its files do not count as requests |
| The database | Postgres at Neon, reached through Cloudflare Hyperdrive | Free: Neon 0.5 GB; Hyperdrive 100,000 queries a day |
| The app | A test APK pointing at the Worker's address | Free |

Everything below is done once, on this PC, from the `server/` folder unless
it says otherwise. Steps marked **you** need your own accounts and a browser.

## 1. The database (Neon) — you

1. Make a free account at <https://neon.tech> and a project named `good-deeds`.
   Region: **AWS Europe (Frankfurt)**, the closest to Libya.
2. On the project's dashboard, **Connect** → turn **Connection pooling off**
   (Hyperdrive does the pooling) → copy the connection string. It looks like
   `postgresql://neondb_owner:…@ep-….eu-central-1.aws.neon.tech/neondb?sslmode=require`.
   Keep it private: it is the database's password.
3. Put it in `server/.env` (this file is never committed):

   ```
   DATABASE_URL=postgresql://neondb_owner:…
   ```

4. Make the tables and add the branches of faith and the levels:

   ```bash
   npm run db:migrate
   ```

   ```bash
   npm run db:seed -- --reference
   ```

   The demo people and events are never loaded into this database.

## 2. Cloudflare — you

1. Make a free account at <https://dash.cloudflare.com/sign-up>.
2. Sign this PC in to it (a browser window opens; approve it there):

   ```bash
   npx wrangler login
   ```

3. Connect Cloudflare to the database. Use the same connection string as in step 1:

   ```bash
   npx wrangler hyperdrive create good-deeds-db --connection-string="postgresql://neondb_owner:…"
   ```

   It prints an `id`. Put it in `server/wrangler.jsonc` in place of
   `REPLACE_WITH_HYPERDRIVE_ID`.
4. The secret that signs sign-ins. Make one and paste it when asked:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   ```bash
   npx wrangler secret put JWT_SECRET
   ```

## 3. Deploy

```bash
npm run cf:deploy
```

It builds the admin panel and uploads both. The address it prints is the
app's server, e.g. `https://good-deeds-api.<your-subdomain>.workers.dev`.

- `…/api/health` answers `{"ok":true,…}`.
- `…/` is the admin panel.

Every minute a Cron Trigger closes attendance left open after an event ends.

## 4. Sign-in codes while testing

There is no SMS provider yet, so `LOGIN_CODE_DELIVERY` is `console` in
`wrangler.jsonc`: a sign-in code is written to the Worker's log instead of being
sent. To read them, watch the log while someone signs in:

```bash
npx wrangler tail
```

or open the dashboard → **Workers & Pages** → `good-deeds-api` → **Logs**.
Testers ask whoever watches the log for their code. Before real members use
the app, add an SMS provider and set `LOGIN_CODE_DELIVERY` to it.

## 5. The first admin

1. Sign up in the app (step 6) with the admin's phone number.
2. Then, from this PC (with `DATABASE_URL` still in `server/.env`):

   ```bash
   npm run make-admin -- +218912345678
   ```

That person can now sign in to the admin panel; after that, admins change
roles in the panel.

## 6. The test APK

In `mobile/`, copy `.env.example` to `.env.local` and set the Worker's address:

```
EXPO_PUBLIC_API_URL=https://good-deeds-api.<your-subdomain>.workers.dev
```

Then build it (README, "Test APK"):

```bash
npm run apk
```

The sign-in screen offers the server or the offline demo.

Push notifications in an APK also need the Firebase (FCM) key uploaded to the
Expo project once (expo.dev → the project → **Credentials** → Android → FCM V1).
Until then, everything works except notifications.

## Later changes

- **Code only:** `npm run cf:deploy`.
- **A new migration** (`npm run db:generate` made one): `npm run db:migrate`
  first, then `npm run cf:deploy`.

## Trying the Worker on this PC first

Two windows, both in `server/`:

```bash
npm run cf:db
```

```bash
npm run cf:dev
```

`cf:db` serves a throwaway demo database on port 5433; `cf:dev` runs the Worker
in Cloudflare's own runtime at <http://127.0.0.1:8787> (the panel at `/`, the
API at `/api`). It needs `server/.dev.vars` with a `JWT_SECRET` (copy
`.dev.vars.example`). Sign-in codes appear in the `cf:dev` window. The demo
admin's phone is `+218910000000`.

## What to know about the free plan

- **10 ms of CPU per request.** Normal requests use far less (most of their
  time is waiting for the database, which does not count). If the dashboard
  ever shows "exceeded CPU", the Workers Paid plan ($5 a month) raises it to 30 s.
- **100,000 requests and 100,000 database queries a day**, reset at midnight UTC.
  Plenty for testing.
- **Neon sleeps after a few idle minutes**, so the first request after a quiet
  spell takes a second or two longer.
- The sign-in limit per network address is counted in the Worker's memory,
  which Cloudflare restarts often, so it is looser than on a server. The limits
  per phone number are in the database and hold.
