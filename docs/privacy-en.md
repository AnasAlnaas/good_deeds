# Privacy policy: Good Deeds (الأعمال الصالحة)

> Draft written from what the app and server really do (October 2026).
> Everything marked ⚠️ is for the association to fill in or decide.
> Remove these notes and the ⚠️ marks before publishing.

Last updated: ⚠️ [date of publication]

## Who we are

Good Deeds is an app for volunteer events, run by **جمعية الإصلاح التربوي**
(the Educational Reform Association), Tripoli, Libya. We decide what data the
app collects and why.

- Address: ⚠️ [postal address]
- Email for privacy questions: ⚠️ [email]
- Phone: ⚠️ [phone]

## In short

- We collect only what the app needs to run events and count your hours.
- We do not show ads.
- We do not sell your data or give it to anyone for their own use.
- The app has no analytics or tracking tools.
- You can delete your account at any time from **Settings** in the app.

## What we collect

**When you sign up**

- Your **phone number**. You sign in with a code sent to it by SMS.
- Your **full name**.
- Your **gender** (man or woman). Some events are for men only or women only,
  and photos are shown by gender (see below).
- Your **city**.

**If you choose to add it**

- A **profile photo**, from your photos or your camera. The app makes it a
  small square image. The server removes its hidden details (EXIF data, such
  as where the photo was taken and which phone took it) before saving it.

**When you take part**

- The events you **join**, and the event terms you **accept** (and when).
- Your **attendance**: the start and finish times a supervisor records for
  you, your hours, and whether you confirmed or disputed them.
- Your **points** and **level**, which come from your confirmed hours.
- **Events you propose**: title, description, place on the map, time and
  other details you enter.
- **Reports** you send: a category, an optional note, and, if you choose,
  an event and a person who was at it.
- **Warnings** a supervisor gives you, with their reason, and your appeal
  if you make one.

**From your phone**

- A **notification address** (an "Expo push token") if you allow
  notifications, and the app's language, so notifications reach your phone
  in your language. We do not collect your phone's location, contacts, or
  other files.

**What we do not collect**

- Your device's location (GPS). The map only shows where events are.
- Your email address, contacts, messages, or browsing history.
- Crash reports or usage statistics.

## Why we use it

- To create your account and let you sign in (phone number).
- To show you the events you may join, including men-only and women-only
  events (gender).
- To let supervisors record who came and for how long (name, photo,
  attendance).
- To count your hours and points, and to give the association a record of
  volunteer hours (attendance, points).
- To tell you about things that concern you: hours waiting for you to
  confirm, an event that was cancelled or moved, a decision about a dispute,
  a proposal, a report or a warning (notification address).
- To keep events safe and respectful (reports and warnings).
- To keep a record of the association's decisions, such as role changes or
  removed photos (the admin log).

## Who sees what

| Who | What they see |
|---|---|
| **Other members** | Your name, and whether you are a man or a woman, in the list of people who joined an event. Your photo only if they are the same gender as you. They never see your phone number, city, hours, points, reports or warnings. |
| **A supervisor of an event you joined** | The same as other members, plus the attendance they record for you. |
| **The association's admins** | Everything listed above, including your phone number, so they can run events, settle disputes and handle reports. |

- **Photos** are seen only by you, the admins, and people of the same gender
  as you. Everyone else sees the first letter of your name.
- **Reports** are read only by admins. The person you name is never told
  that you reported them, or that a report exists. You are told only that an
  admin has looked at your report.
- **Warnings** are seen only by you and the admins. The supervisor who gave
  one knows they gave it.
- If you **supervise or propose** an event, your name can show to people at
  that event (for example, as the person who recorded their hours).

## Who helps us run the app

These services handle some data for us, only to provide their service:

- **SMS provider** ⚠️ [name, country]: receives your phone number and the
  sign-in code, to send you the code.
- **Expo** (650 Industries, USA): receives your notification address and the
  text of each notification (for example the event's name and new time), and
  passes it to Google or Apple.
- **Google Firebase Cloud Messaging** (Android) and **Apple Push
  Notification service** (iPhone): deliver notifications to your phone.
- **Server hosting** ⚠️ [provider name]: the computer where our database runs.
- **OpenStreetMap** ⚠️ [or the map tile provider chosen before launch] and
  **unpkg.com**: when you open a map, your phone downloads the map images and
  the map code from them. Like any website, they see your phone's internet
  (IP) address and which area of the map is shown.

We do not give your data to anyone else, unless the law requires it.

## Where your data is kept

- On our server in ⚠️ [country / city / provider]. The connection between
  the app and the server is encrypted (HTTPS).
- Your sign-in key is kept in your phone's secure storage (Keychain or
  Keystore).
- Sign-in codes are never stored as they are, only a scrambled form (a hash)
  that cannot be turned back into the code.
- The demo mode on the sign-in screen keeps its made-up data on your phone
  only. Nothing from it is sent to us.

## How long we keep it

- **While your account is open**, we keep your data so the app works.
- **Your photo** is deleted at once when you remove it, replace it, or delete
  your account. An admin may also remove an unsuitable photo; you are told
  and can add another.
- **Notification addresses** are deleted when you sign out on that phone,
  when you delete your account, or when the phone stops accepting
  notifications.
- **After you delete your account**: ⚠️ see "Deleting your account" below.
- **Sign-in codes** expire after 10 minutes. ⚠️ Today the expired records
  (phone number and scrambled code) are not cleared. Decide a period, for
  example 30 days, and we will add the clean-up to the server.
- **The admin log** (who made which decision, and when) is kept ⚠️ [period].

## Deleting your account

In the app: **Profile → Settings → Delete your account**. It cannot be
undone. At once:

- you are signed out and can no longer sign in to that account;
- your photo is deleted;
- you leave every event you joined;
- your phone stops receiving notifications.

You can also ask us by email at ⚠️ [email], from the phone number on the
account. We answer within ⚠️ [e.g. 30] days.

⚠️ **Decide before publishing.** Today the server marks the account as
deleted but keeps your name, phone number, gender and city in the database,
together with your attendance, points, reports and warnings. The phone number
is freed, so you can sign up again with it. The delete screen in the app says
"your personal data is deleted", and Google Play expects deleted accounts to
lose their personal data. Choose one:

1. **Recommended:** change the server so deleting an account also erases the
   name, phone number and city (keeping the hours as anonymous totals for
   the association's records). Then this section can say "your personal data
   is erased; we keep only anonymous totals of hours".
2. Keep the data for a stated time and reason (for example, to answer a
   report about you), and write that period and reason here.

## Notifications

The app asks before sending notifications. You can turn them off at any time
in your phone's settings. The text of a warning notification never includes
the reason, because it may show on a locked screen.

## Children

⚠️ Decide the youngest age allowed in the app, and whether a parent must
agree for younger members. Google Play asks this in "Target audience". If
children under 13 can use the app, stricter Google Play rules apply.

## Your rights

You can:

- see most of your data in the app (Profile, My activity, your reports and
  warnings);
- correct your name, gender or city by asking us ⚠️ [the app has no screen
  for this yet];
- delete your photo or your whole account in the app;
- ask us what data we hold about you, by email at ⚠️ [email].

## Changes

If we change this policy, we will update the date at the top and, for
important changes, tell you in the app.

## Contact

⚠️ [email], ⚠️ [phone], ⚠️ [address].
