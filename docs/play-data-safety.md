# Google Play: Data safety form

Answers for Play Console → **App content → Data safety**, each tied to the
code that justifies it. Checked against the code in October 2026 (commit
`ab66ece`). If the code changes what it collects, update this file and the
privacy policy (`privacy-en.md`, `privacy-ar.md`) together.

⚠️ = the association must fill in or decide.

## Before you start

- ⚠️ **Privacy policy URL**: publish `privacy-ar.md` / `privacy-en.md` as a web
  page first. Play needs the URL in the form and in the store listing. Put the
  same URL in `EXPO_PUBLIC_PRIVACY_URL` for the build, so the app's Settings
  shows the "Privacy policy" link (`mobile/src/app/settings.tsx`).
- ⚠️ **Account deletion web link**: Play also asks for a web page where people
  can ask for deletion without the app. The "Deleting your account" section
  of the privacy policy can be that page (link to it with `#deleting-your-account`),
  once it has a real email address.

## Section 1: Data collection and security

| Question | Answer | Why (code) |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | Sign-up stores phone, name, gender, city (`server/src/routes/auth.ts`, `verifyCodeBody`). |
| Is all of the user data collected by your app encrypted in transit? | **Yes** ⚠️ | Only if the server runs behind HTTPS. Android release builds refuse plain `http://` (README, "Two modes"), so a working release build already needs HTTPS. Confirm on the real server. |
| Do you provide a way for users to request that their data is deleted? | **Yes** | In the app: Settings → Delete your account (`mobile/src/app/settings.tsx` → `DELETE /api/me`, `server/src/routes/me.ts`). Plus by email ⚠️. |

## Section 2: Data types

For each type: **collected** (sent to our server) or not, **shared** (given
to a third party for its own use) or not, **optional** or required, and the
**purposes**. Play's purposes: App functionality, Analytics, Developer
communications, Advertising or marketing, Fraud prevention / security /
compliance, Personalization, Account management.

No data is **shared**. The services that handle data for us (Expo push,
Google FCM, Apple APNs, the SMS provider, the server host) act as service
providers, which Play does not count as sharing. No data is processed
**ephemerally** only.

### Location

| Type | Collected | Why (code) |
|---|---|---|
| Approximate location | **No** | The app has no location library (`mobile/package.json`: no `expo-location`) and asks for no location permission (`mobile/app.json`). The map shows event places only. |
| Precise location | **No** | Same. When a member proposes an event they tap the event's place on a map (`mobile/src/components/LocationPicker.tsx`); that is the event's place, not the person's. |

The **city** is typed at sign-up; it is declared under Personal info below.

### Personal info

| Type | Collected | Shared | Optional? | Purposes | Why (code) |
|---|---|---|---|---|---|
| Name | **Yes** | No | Required | App functionality, Account management | `users.full_name` (`server/src/db/schema.ts`). Shown on event participant lists and to supervisors (`publicUser` in `server/src/db/queries.ts`). |
| Email address | **No** | | | | `users.email` exists in the schema but nothing fills it: sign-up takes only name, gender, city (`auth.ts`). |
| User IDs | **Yes** | No | Required | App functionality, Account management | `users.id`, a random ID made by the server (`newId()` in `queries.ts`), sent in the sign-in token (`server/src/auth.ts`). |
| Address | **No** ⚠️ | | | | Only the city is asked, not a home address. If you prefer to be cautious, declare the city here instead of "Other info". |
| Phone number | **Yes** | No | Required | App functionality, Account management, Fraud prevention / security | `users.phone`; sign-in by SMS code (`routes/auth.ts`, `login_codes`). Seen by admins only (`server/src/routes/admin.ts`). |
| Race and ethnicity | No | | | | |
| Political or religious beliefs | **No** ⚠️ | | | | The app never asks about beliefs. But the events are run by an Islamic educational association, points have a "spiritual" pillar, and events are tagged with branches of faith (`branches`, `points_ledger.pillar`). Our reading: that describes the event, not the person's beliefs. Decide whether you agree. |
| Sexual orientation | No | | | | |
| Other info | **Yes** | No | Required | App functionality | Gender (`users.gender`): decides men-only / women-only events (`rules.canUserJoinCategory`) and who sees photos (`rules.canSeePhoto` in `shared/rules.ts`). City (`users.city`). |

### Financial info

All **No**. The app has no payments.

### Health and fitness

All **No**. Attendance hours are volunteer hours, not health data.

### Messages

| Type | Collected | Why (code) |
|---|---|---|
| Emails, SMS or MMS | **No** | The server sends the sign-in SMS; the app does not read the phone's messages. |
| Other in-app messages | **No** | The app has no chat. Reports and appeals are declared as user-generated content below. |

### Photos and videos

| Type | Collected | Shared | Optional? | Purposes | Why (code) |
|---|---|---|---|---|---|
| Photos | **Yes** | No | Optional | App functionality | Profile photo: `expo-image-picker` (`mobile/src/lib/photo.ts`), `PUT /api/me/photo`, stored in `user_photos` with metadata removed (`server/src/photo.ts`). Shown only to the owner, admins and the same gender (`rules.canSeePhoto`). |
| Videos | **No** | | | | |

### Audio files

All **No**. The image picker plugin has `microphonePermission: false` (`mobile/app.json`).

### Files and docs

**No**.

### Calendar

**No**.

### Contacts

**No**.

### App activity

| Type | Collected | Shared | Optional? | Purposes | Why (code) |
|---|---|---|---|---|---|
| App interactions | **No** | | | | Nothing records taps, screens or time in the app. |
| In-app search history | **No** | | | | Event filters are not sent or stored. |
| Installed apps | **No** | | | | |
| Other user-generated content | **Yes** | No | Optional | App functionality | Reports and their notes (`reports`), warning appeals (`warnings.appeal_reason`), events a member proposes (`events` with `status = 'draft'`, `POST /api/events`). |
| Other actions | **Yes** | No | Required | App functionality | Joining events and accepting terms (`registrations`, `term_acceptances`), attendance and hours recorded by a supervisor (`attendance`), confirming or disputing them, points (`points_ledger`), warnings received (`warnings`). Required because taking part in events is the app's purpose. |

### Web browsing

**No**. The map loads inside the app; nothing records pages or links.

### App info and performance

| Type | Collected | Why (code) |
|---|---|---|
| Crash logs | **No** | No crash reporter (no Sentry, Crashlytics, Bugsnag: `mobile/package.json`). |
| Diagnostics | **No** | Same. |
| Other app performance data | **No** | |

### Device or other IDs

| Type | Collected | Shared | Optional? | Purposes | Why (code) |
|---|---|---|---|---|---|
| Device or other IDs | **Yes** | No | Optional | App functionality | The Expo push token (`mobile/src/data/push.ts` → `PUT /api/me/push-token`, table `push_tokens` in `schema.ts`). Optional: only if the person allows notifications. Removed at sign-out and account deletion. |

## Things to know when filling the form

- **Map tiles.** The map is drawn in a web view that downloads tiles from
  `tile.openstreetmap.org` and the Leaflet code from `unpkg.com`
  (`mobile/src/components/leaflet.ts`). They see the phone's IP address, like
  any website. Play does not list IP address as a data type, and we do not
  receive or keep it. ⚠️ Before launch, `TILE_URL` must move to a tile
  provider (OSM's usage policy forbids heavy app use). Name that provider in
  the privacy policy.
- **Server logs.** The API does not log requests or IP addresses itself
  (`server/src/app.ts`). ⚠️ The host or a reverse proxy (nginx, Cloudflare…)
  may. Check, and say how long those logs are kept in the privacy policy.
- **The demo mode** keeps made-up data on the phone (AsyncStorage,
  `mobile/src/state/app.tsx`) and sends nothing. It is not "collection".
- **Analytics and ads.** There are none: no analytics, ads or attribution
  library in `mobile/package.json`, `server/package.json` or
  `admin/package.json`. Answer "No" to every Analytics and Advertising
  purpose.

## Data deletion

Play asks what is deleted, and whether some data is kept.

What happens when someone deletes their account (`DELETE /api/me` in
`server/src/routes/me.ts`, checked by `npm run check:api`):

- **Deleted:** the profile photo (`user_photos`), every push token
  (`push_tokens`), the phone's sign-in code records (`login_codes`).
- **Erased:** name, phone, email and city (`rules.erasedProfile` in
  `shared/rules.ts`). The name becomes «حساب محذوف» ("deleted account"),
  also where the admin log copied it (`admin_actions` details).
- **Changed:** the account is marked deleted (`users.deleted_at`), so it can no
  longer sign in and drops out of every list; every registration is cancelled.
- **Kept, without name or phone:** gender, attendance, hours, points, the
  reports the person sent or was named in, and warnings, as written.

Sign-in code records are also cleared a day after they expire
(`server/src/routes/auth.ts`, `KEEP_EXPIRED_MS`).

Answer in Play: data is deleted on request; volunteer hours and points are
kept without the person's name or phone number, for the association's
records, and reports and warnings are kept for safety. ⚠️ Say how long they
are kept if you set a limit.

## Other Play Console declarations

These are separate from Data safety but are asked before the first release.

| Section | Answer | Note |
|---|---|---|
| Ads | **No ads** | No ad library. |
| App access | **Some features restricted** ⚠️ | Sign-in needs an SMS code, which the reviewer cannot receive. Give them a test phone number and a way in (for example a fixed code for that one number on the server), or explain the demo mode on the sign-in screen. The demo does not reach the server, so it cannot show account deletion. |
| Content rating | ⚠️ | Fill the questionnaire. Members can send reports and propose events (user-generated content, reviewed by admins before publishing). |
| Target audience and content | ⚠️ | Decide the minimum age. If under 13 is included, the Families policy applies. |
| News app | No | |
| Government app | No | |
| Financial features | None | |
| Health | No health features | |
| Photo and video permissions | ⚠️ | Android: the app uses the system photo picker (`expo-image-picker`). Check that the built APK does not request `READ_MEDIA_IMAGES`; if it does, Play asks you to justify it or remove it. |

## Later: App Store privacy labels

Apple's labels use almost the same types. Expected answers, from the same code:

- **Data linked to you**: Contact info (Name, Phone number), User content
  (Photos, Other user content: reports, appeals, proposed events),
  Identifiers (User ID, Device ID = push token), Other data (gender, city,
  attendance, points).
- **Purpose** for all: App functionality.
- **Data used to track you**: none. **Data not linked to you**: none.
- No App Tracking Transparency prompt is needed: there is no tracking.
