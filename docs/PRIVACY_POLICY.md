# Privacy Policy

> ## ⚠ Unfilled placeholders — must be completed before submission
>
> Three fields below are still `[bracketed placeholders]`: the publishing
> entity's name, its contact email address, and its postal address. They are
> left as placeholders deliberately, because only the account holder can supply
> them — but **this document cannot be published while they are still here.**
>
> Apple requires a Privacy Policy URL that is publicly reachable and accurate
> for the app in review, and a policy whose contact section reads
> `[your-support-email@example.com]` is a reviewable defect on its own: it
> means a user has no way to exercise the rights § 6 promises them. The same is
> true under GDPR, which requires an identifiable controller.
>
> Fill them in, then delete this box. See
> `apps/mobile/docs/app-store-submission.md` § 6.

**Effective date:** 2026-08-25
**App name:** OBD Car (published as `OBD Car — ავტოდიაგნოსტიკა`; formerly
"OBD-II AI Diagnostic Assistant")
**Contact:** [your-support-email@example.com]

---

## 1. Introduction

OBD Car ("the App", "we", "us") is a mobile application that pairs with an
ELM327 OBD-II adapter to read live vehicle data and provide AI-powered
diagnostic assistance. This Privacy Policy explains what information we collect,
how we use it, and the choices you have.

The App is currently offered in **Georgia only**. Creating an account requires a
Georgian mobile number, because account verification is done by SMS through a
Georgian gateway. If we expand to other countries, this policy will be updated
before we do.

---

## 2. Information we collect

### 2.1 Information you provide

- **Mobile phone number** — required to create an account and to sign in. It is
  your account identifier. There is no email address, no password and no
  third-party sign-in; the App does not collect any of them.
- **First name and last name** — required at registration. They are how the App
  addresses you; they are not verified and are not shared with anyone.
- **Vehicle details** — make, model, year, and VIN (Vehicle Identification
  Number), which you enter or which the App reads from your vehicle's ECU. All
  vehicle fields are optional.
- **Chat messages** — the questions and repair notes you type into the AI
  assistant.

### 2.2 Information collected automatically

- **Live OBD sensor readings** — RPM, vehicle speed, coolant temperature, fuel
  level, battery voltage, and other PIDs supported by your adapter. These
  readings are streamed during an active session and appear in your chat history.
- **Diagnostic Trouble Codes (DTCs)** — fault codes stored in your vehicle's
  ECU, read during a session and included in the AI conversation.
- **Freeze-frame data** — ECU snapshots captured at the moment a fault was
  stored.
- **Session metadata** — session start and end times, locale preference.
- **Verification codes** — when you request a sign-in code, we store a one-way
  hash of the 4-digit code, the phone number it was sent to, and the time. The
  code itself is never stored in a readable form, expires after five minutes,
  and is discarded once used.

### 2.3 Information we do NOT collect

- **Crash reports and analytics.** The App contains no crash-reporting SDK and
  no analytics SDK. Nothing about how you use the App is transmitted anywhere.
- Email addresses and passwords — the App has neither.
- Continuous background location. The App requests no location permission on
  iOS at all.
- Contacts, calendar, or photos.
- Driving behaviour, mileage, or route history.
- Advertising identifiers. There is no IDFA, no ad SDK and no tracking.
- Any data from your vehicle beyond what is explicitly read during an active
  session.

---

## 3. How we use your information

| Purpose | Legal basis (GDPR) |
|---|---|
| Provide the diagnostic assistant feature | Performance of contract |
| Store your chat history and vehicle profiles | Performance of contract |
| Send a one-time code to your phone and verify it | Performance of contract |
| Keep your account secure (rate limits, attempt limits) | Legitimate interest |
| Generate AI responses via the Claude API | Performance of contract |
| Comply with legal obligations | Legal obligation |

We do not sell, rent, or trade your personal data to third parties for marketing
purposes. We do not send you marketing messages — the only SMS you will ever
receive from us is a sign-in code you asked for.

---

## 4. How your data is shared

### 4.1 Anthropic (AI responses)

Your chat messages and live OBD readings are sent to Anthropic's Claude API to
generate diagnostic responses. Anthropic is a data processor acting on our
behalf. Anthropic does not use API customer data to train its models by default.
See [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy).

### 4.2 sender.ge (SMS delivery)

When you request a sign-in code, we pass your mobile number and the text of the
message to **sender.ge**, a Georgian SMS gateway, so that it can be delivered.
That is the only data sender.ge receives: your number, and a message reading
"Your OBD Car verification code is NNNN." No name, no vehicle data and no chat
content is sent to them.

We have no other third-party integrations. There are no advertising networks,
analytics SDKs, crash reporters, or data brokers connected to the App.

---

## 5. Data storage and retention

| Data | Where stored | Retention |
|---|---|---|
| Account (phone, name), vehicles, sessions, messages | Server database | Until you delete your account. |
| Chat history (local copy) | On your device | Until you uninstall the app or delete your account. |
| Refresh tokens | Server (hash only) | 30 days, or until you sign out or delete your account. |
| Verification codes | Server (hash only) | Valid for 5 minutes; the row is kept briefly afterwards to enforce resend limits. |

All server-side data is stored in a SQLite database on the server where the App
is deployed. There is no cloud data warehouse or analytics database.

---

## 6. Your rights and choices

Depending on your location, you may have the following rights:

- **Access** — request a copy of the data we hold about you.
- **Correction** — update your name from the Profile tab, and your vehicle
  details and locale through the app.
- **Deletion** — delete your account at any time from **Profile → Delete
  account**. This permanently removes your phone number, name, vehicles,
  sessions and all chat messages from our server, and clears the App's local
  data on your device.
- **Data portability** — contact us to request an export of your data.

To exercise any of these rights, contact us at the address in § 9.

---

## 7. Children's privacy

The App is not intended for children under 13 years of age (or under 16 where
applicable under local law). We do not knowingly collect personal information
from children. If you believe a child has provided us with their information,
contact us and we will delete it promptly.

---

## 8. Security

We protect your data with:

- **No stored credentials.** There is no password to leak. Signing in requires
  possession of your phone at that moment.
- Verification codes stored only as a SHA-256 hash, single-use, expiring after
  five minutes, and invalidated after five incorrect attempts — which is what
  keeps a 4-digit code safe.
- Short-lived access tokens (15 minutes) and rotating refresh tokens, stored on
  the server as hashes only.
- Tokens held on your device in the iOS Keychain / Android Keystore.
- HTTPS/WSS encryption for all data in transit; the App refuses to connect to a
  plaintext endpoint.
- Rate limiting per phone number and per IP address on code requests, so your
  number cannot be used to send you messages you did not ask for.

No security measure is perfect. In the event of a breach that affects your
personal data we will notify you as required by applicable law.

---

## 9. Contact

If you have questions, requests, or complaints about this Privacy Policy, please
contact:

**[Developer / Company name]**
Email: [your-support-email@example.com]
[Mailing address]

---

## 10. Changes to this policy

We will update this policy when we change how we handle your data. The
"Effective date" at the top will reflect the most recent revision. For material
changes we will notify you within the app.

---

## Appendix — App Store and Play Store data disclosures

The following disclosures are intended for use in the Apple App Store "App
Privacy" section and the Google Play Data Safety form. They must match
`expo.ios.privacyManifests` in `apps/mobile/app.json` and the table in
`apps/mobile/docs/app-store-submission.md` § 6 — treat the three as one edit.

### Apple App Store — App Privacy labels

**Data used to track you:** None

**Data linked to you:**

| Category | Type | Purpose |
|---|---|---|
| Contact Info | Phone Number | Account creation and authentication |
| Contact Info | Name | App functionality |
| Identifiers | User ID | App functionality |
| User Content | Other User Content (chat messages) | App functionality |
| Other Data | Other Data Types (VIN, OBD readings, DTCs, freeze frames) | App functionality |

**Data not linked to you:** None

**Diagnostics / Crash Data:** Not collected. The App ships no crash-reporting
or analytics SDK.

**Data collected but not tracked:** The App does not track users across other
companies' apps or websites.

### Google Play — Data Safety

| Category | Data type | Collected | Shared | Encryption in transit | User deletion |
|---|---|---|---|---|---|
| Personal info | Phone number | Yes | With SMS gateway (sender.ge), for delivery only | Yes | Yes |
| Personal info | Name | Yes | No | Yes | Yes |
| App activity | In-app messages (chat history) | Yes | With AI provider (Anthropic) | Yes | Yes |
| Vehicle data | OBD sensor readings, DTCs, VIN | Yes | With AI provider (Anthropic) | Yes | Yes |
| App info & performance | Crash logs | No | — | — | — |

**Is all the data encrypted in transit?** Yes — HTTPS and WSS.
**Can users request data deletion?** Yes — via in-app account deletion.
