# Privacy Policy

**Effective date:** 2026-05-19
**App name:** OBD-II AI Diagnostic Assistant
**Contact:** [your-support-email@example.com]

---

## 1. Introduction

OBD-II AI Diagnostic Assistant ("the App", "we", "us") is a mobile application
that pairs with an ELM327 Bluetooth OBD-II adapter to read live vehicle data and
provide AI-powered diagnostic assistance. This Privacy Policy explains what
information we collect, how we use it, and the choices you have.

---

## 2. Information we collect

### 2.1 Information you provide

- **Email address** — required to create an account.
- **Password** — stored as a one-way hash (bcrypt); we never have access to
  your raw password.
- **Vehicle details** — make, model, year, and VIN (Vehicle Identification
  Number), which you enter or which the app reads from your vehicle's ECU. All
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
- **Crash reports** — if crash reporting is enabled, anonymised error
  information (stack traces, device model, OS version) is sent to Sentry. Chat
  message content is removed from these reports before transmission.

### 2.3 Information we do NOT collect

- Continuous background location.
- Contacts, calendar, or photos.
- Driving behaviour, mileage, or route history.
- Advertising identifiers.
- Any data from your vehicle beyond what is explicitly read during an active
  session.

---

## 3. How we use your information

| Purpose | Legal basis (GDPR) |
|---|---|
| Provide the diagnostic assistant feature | Performance of contract |
| Store your chat history and vehicle profiles | Performance of contract |
| Authenticate your account and keep it secure | Legitimate interest |
| Generate AI responses via the Claude API | Performance of contract |
| Detect and fix crashes (Sentry) | Legitimate interest |
| Comply with legal obligations | Legal obligation |

We do not sell, rent, or trade your personal data to third parties for marketing
purposes.

---

## 4. How your data is shared

### 4.1 Anthropic (AI responses)

Your chat messages and live OBD readings are sent to Anthropic's Claude API to
generate diagnostic responses. Anthropic is a data processor acting on our
behalf. Anthropic does not use API customer data to train its models by default.
See [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy).

### 4.2 Google (optional sign-in)

If you use Google Sign-In, your Google ID token is sent to our server for
verification. We store only your email address and an opaque account identifier
(`sub`). We do not receive or store your Google profile photo, contacts, or other
Google account data. See
[Google's privacy policy](https://policies.google.com/privacy).

### 4.3 Sentry (crash reporting)

Anonymised crash reports may be sent to Sentry when this feature is enabled.
Chat message content is scrubbed before transmission. See
[Sentry's privacy policy](https://sentry.io/privacy/).

We have no other third-party integrations. There are no advertising networks,
analytics SDKs, or data brokers connected to the App.

---

## 5. Data storage and retention

| Data | Where stored | Retention |
|---|---|---|
| Account, vehicles, sessions, messages | Server database | Until you delete your account. |
| Chat history (local copy) | On your device | Until you uninstall the app or delete your account. |
| Refresh tokens | Server (hash only) | 30 days, or until you sign out or delete your account. |
| Crash reports | Sentry | 90 days (Sentry default). |

All server-side data is stored in a SQLite database on the server where the App
is deployed. There is no cloud data warehouse or analytics database.

---

## 6. Your rights and choices

Depending on your location, you may have the following rights:

- **Access** — request a copy of the data we hold about you.
- **Correction** — update your vehicle details or locale through the app.
- **Deletion** — delete your account at any time from the app settings. This
  permanently removes your email, password hash, vehicles, sessions, and all
  chat messages from our server.
- **Data portability** — contact us to request an export of your data.
- **Opt out of crash reporting** — crash reporting is controlled by the app
  operator; contact support to request it be disabled.

To exercise any of these rights, contact us at the address in § 10.

---

## 7. Children's privacy

The App is not intended for children under 13 years of age (or under 16 where
applicable under local law). We do not knowingly collect personal information
from children. If you believe a child has provided us with their information,
contact us and we will delete it promptly.

---

## 8. Security

We protect your data with:

- Bcrypt password hashing with per-password salt.
- Short-lived access tokens (15 minutes) and rotating refresh tokens.
- HTTPS/WSS encryption for all data in transit.
- Rate limiting on authentication and AI endpoints.
- PII scrubbing before crash reports are transmitted.

No security measure is perfect. In the event of a breach that affects your
personal data we will notify you as required by applicable law.

---

## 9. Changes to this policy

We will update this policy when we change how we handle your data. The
"Effective date" at the top will reflect the most recent revision. For material
changes we will notify you within the app or by email.

---

## 10. Contact

If you have questions, requests, or complaints about this Privacy Policy, please
contact:

**[Developer / Company name]**
Email: [your-support-email@example.com]
[Mailing address]

---

## Appendix — App Store and Play Store data disclosures

The following disclosures are intended for use in the Apple App Store "App
Privacy" section and the Google Play Data Safety form.

### Apple App Store — App Privacy labels

**Data used to track you:** None

**Data linked to you:**

| Category | Type | Purpose |
|---|---|---|
| Contact info | Email address | Account creation and authentication |
| Identifiers | User ID | App functionality |
| Usage data | Diagnostics (crash logs) | App stability (if crash reporting enabled) |

**Data not linked to you:** None

**Data collected but not tracked:** The App does not track users across other
companies' apps or websites.

### Google Play — Data Safety

| Category | Data type | Collected | Shared | Encryption in transit | User deletion |
|---|---|---|---|---|---|
| Personal info | Email address | Yes | No | Yes | Yes |
| App activity | In-app messages (chat history) | Yes | With AI provider (Anthropic) | Yes | Yes |
| App activity | Crash logs | Yes (optional) | With crash reporter (Sentry) | Yes | 90 days |
| Vehicle data | OBD sensor readings, DTCs, VIN | Yes | With AI provider (Anthropic) | Yes | Yes |

**Is all the data encrypted in transit?** Yes — HTTPS and WSS.
**Can users request data deletion?** Yes — via in-app account deletion.
