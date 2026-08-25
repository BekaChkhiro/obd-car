# App Store submission runbook

How to ship `apps/mobile` to the iOS App Store when the build happens on your own
Mac but the app lives in **someone else's Apple Developer account**.

Two things make this submission unusual, and almost every step below exists
because of one of them:

1. **The signing team is not yours.** The account holder owns the membership;
   you are a guest with a role. Certificates, the bundle ID and the App Store
   Connect app record all have to be created *inside their team*, not yours.
2. **`ios/` is a build artifact, not source.** `apps/mobile/.gitignore:40`
   ignores `/ios`. Everything you change by hand in Xcode — including the team
   ID — is erased by the next `expo prebuild --clean`. Durable settings belong
   in `app.json` / `app.config.ts`.

Read § 2 and § 3 before touching Xcode. Getting the bundle ID wrong is the one
mistake in this document that cannot be undone later.

---

## 1. Getting into the other developer account

The account holder does this once, from **App Store Connect → Users and Access
→ + (Invite)**:

| Field | Value |
|---|---|
| Email | Your own Apple ID email — not a shared mailbox |
| Role | **Admin** if you will create the bundle ID and signing certificates yourself; **App Manager** if the owner does that part |
| Apps | Grant access to the OBD Car app once it exists (§ 5) |

You accept the invite from your own Apple ID, keep your own 2FA, and appear in
their team as a separate identity. Your Mac can hold memberships in several
teams at once — joining theirs does not remove yours.

### Why the role matters

- **App Manager** can upload builds, edit the app record, manage TestFlight, and
  create an App Store Connect API key for itself. It generally *cannot* create
  new Identifiers (bundle IDs) in the developer portal.
- **Admin** can do all of the above plus create Identifiers, certificates and
  provisioning profiles — which is what Xcode's automatic signing needs the
  first time it signs for a new team.

If you are given App Manager, the owner must register the bundle ID (§ 2) and
you must ask them to approve the first distribution certificate request. Admin
avoids that ping-pong. Ask for Admin, settle for App Manager plus a cooperative
owner.

### Why you must not just borrow their password

- Sharing an Apple ID breaks the Apple Developer Program License Agreement, and
  Apple has terminated accounts over it.
- Their 2FA codes arrive on *their* devices. Every build upload becomes a phone
  call.
- Every action — including a mistaken app deletion — is attributed to them, with
  no audit trail separating you.
- App-specific passwords and App Store Connect API keys are per-user. On a
  borrowed login you cannot create one that survives them changing the password.
- When the working relationship ends, revoking your access means resetting their
  Apple ID rather than clicking one button.

---

## 2. Bundle ID — check this first

The app is currently `com.beka.obdcar` (`app.json` → `expo.ios.bundleIdentifier`,
and `PRODUCT_BUNDLE_IDENTIFIER` in the generated Xcode project).

**Bundle IDs are globally unique across every Apple Developer account.** If
`com.beka.obdcar` is already registered as an App ID under your own team
(`445W9H7Z49` — automatic signing registers App IDs silently, so it very likely
is), the other team **cannot** register the same string. There is no transfer
mechanism for a bare Identifier.

Check, at <https://developer.apple.com/account/resources/identifiers> with your
own team selected:

- **Not listed** → nothing to do. Register it under the new team in § 3.
- **Listed, and no App Store Connect app record uses it** → delete it from your
  team, then register it under theirs.
- **Listed, and an app record already exists on it** → you cannot free it. Pick a
  new bundle ID.

If you have to change it, change it in **one** place — `app.json`:

```jsonc
"ios": {
  "bundleIdentifier": "com.newteam.obdcar"
}
```

then `npx expo prebuild --clean -p ios`. Prebuild re-derives everything
downstream, including the second entry in `CFBundleURLSchemes` — the Info.plist
carries `obd-car` (from `expo.scheme`) *and* a literal `com.beka.obdcar`, which
is Expo's default bundle-id scheme, not a leftover OAuth redirect. Nothing
external is keyed to it now that Google Sign-In is gone, so a bundle-ID change
costs nothing beyond re-running prebuild.

---

## 3. Team ID, certificates, provisioning

### Find the new Team ID

<https://developer.apple.com/account> → switch to their team → **Membership
details** → **Team ID**. Ten uppercase letters and digits, e.g. `AB32CZE81F`.
(The same string appears in App Store Connect under Users and Access →
Integrations, but Membership is the canonical place.)

### Set it durably

Today the team lives only in the generated project:

```
ios/OBDCar.xcodeproj/project.pbxproj
  DEVELOPMENT_TEAM = 445W9H7Z49;   ← Debug config
  DEVELOPMENT_TEAM = 445W9H7Z49;   ← Release config
```

That file is gitignored and regenerated. Set the team in `app.json` instead:

```jsonc
"ios": {
  "bundleIdentifier": "com.beka.obdcar",
  "appleTeamId": "AB32CZE81F"
}
```

`expo.ios.appleTeamId` is a first-class Expo config field — the
`withDevelopmentTeam` config plugin writes `DEVELOPMENT_TEAM` into *every* build
configuration during prebuild, and `expo run:ios`'s code-signing step reads the
same value. Set it once and `prebuild --clean` stops being destructive.

Then regenerate and verify:

```bash
cd apps/mobile
npx expo prebuild --clean -p ios
grep -n DEVELOPMENT_TEAM ios/OBDCar.xcodeproj/project.pbxproj   # expect the new ID twice
```

### Certificates and profiles

`CODE_SIGN_STYLE = Automatic` is already set, so Xcode handles the rest: open the
workspace, select the OBDCar target → **Signing & Capabilities**, pick the new
team, and Xcode creates an *Apple Development* certificate, an *Apple
Distribution* certificate and matching provisioning profiles under that team,
registering the App ID on the way.

Two things that bite here:

- **Distribution certificates are team-wide and capped.** If the team already has
  two, Xcode's "Revoke and create" offer will break whoever holds the existing
  one. Ask the owner before revoking anything.
- **Keychain ambiguity.** With two teams' certificates installed, the identities
  have similar display names. Select the team on the *target*, not in Keychain
  Access, and let Xcode resolve the identity.

Nothing else has to be enabled on the new team's App ID: `OBDCar.entitlements` is
an empty dict — no push notifications (the app only schedules *local*
notifications via `src/lib/notifications.ts`), no App Groups, no Sign in with
Apple, no associated domains. That is what keeps this team switch a
five-minute job rather than a capability audit.

---

## 4. Building locally and getting it uploaded

### 4.1 The build must carry production config

`app.config.ts` reads `API_URL` / `WS_URL` / `SENTRY_DSN` from `process.env` when
the config is evaluated. The `env` blocks in `eas.json` are injected by **EAS
Build only** — a local build never sees them. What a local build sees is
`apps/mobile/.env`, which Expo CLI loads automatically, and which currently holds
the right values:

```
API_URL=https://obd-ai-backend.fly.dev
WS_URL=wss://obd-ai-backend.fly.dev
```

The Xcode "Bundle React Native code and images" phase shells out to the Expo CLI
and **re-evaluates `app.config.ts` at build time**, so the config baked into the
`.app` comes from whatever environment that phase runs in. Consequences:

- Launch Xcode from a shell in `apps/mobile` (`open ios/OBDCar.xcworkspace`) so
  the working directory resolves `.env`.
- **The E2E guard now covers a local archive too.** `app.config.ts`'s
  `isShippableBuild` is true for `EAS_BUILD_PROFILE=preview|production` *or*
  `CONFIGURATION=Release` — Xcode exports `CONFIGURATION` into the bundling
  phase, which is how a hand-built archive identifies itself. A Release build
  with `EXPO_PUBLIC_E2E` set now throws rather than silently shipping the
  sign-in bypass, and the same block refuses `example.com` placeholders and any
  `http://` / `ws://` endpoint. This closes what used to be the sharpest hazard
  in this section; `grep EXPO_PUBLIC_E2E .env` showing only the commented line
  is still a cheap thing to confirm, but it is no longer the only thing standing
  between a stray env var and the App Store.
- After archiving, confirm the shipped config before uploading:
  ```bash
  plutil -p ios/build/.../OBDCar.app/EXConstants.bundle/app.config \
    | grep -E 'apiUrl|wsUrl|"e2e"'
  ```

### 4.2 Bump the build number

`app.json` now carries `expo.ios.buildNumber: "1"`, and the generated
`CFBundleVersion` is `1`. That fixes where the value lives; it does not make it
move. App Store Connect rejects a second upload with a `CFBundleVersion` it has
already seen for the same `CFBundleShortVersionString`, so **bump it by hand
before every upload**:

```jsonc
"ios": {
  "buildNumber": "1"   // → "2", "3", … for every upload of version 1.0.0
}
```

`eas.json`'s `cli.appVersionSource: "remote"` governs EAS Build's auto-increment
only; it has no effect on a local `xcodebuild`.

### 4.3 Option A — Xcode Archive → Distribute App (recommended for the first submission)

`npx expo run:ios --configuration Release` — what we have been running all
session — installs a `.app` on a device. It is a smoke test. It does **not**
produce an uploadable `.ipa`.

```bash
cd apps/mobile
npx expo prebuild --clean -p ios          # picks up appleTeamId + buildNumber
open ios/OBDCar.xcworkspace
```

In Xcode:

1. Target **OBDCar** → Signing & Capabilities → Team = the new team, "Automatically manage signing" ticked.
2. Scheme **OBDCar**, destination **Any iOS Device (arm64)**. (Archive is disabled for a simulator destination.)
3. **Product → Archive**.
4. Organizer opens → **Distribute App** → **App Store Connect** → **Upload**.
5. Signing: **Automatically manage signing**. Xcode creates the distribution profile if it is missing.

Recommended first because signing failures surface in a dialog that tells you
which certificate or profile is missing, against the team you actually selected —
which is exactly the class of error a first build under a borrowed team produces.
Command-line signing failures are considerably more opaque.

### 4.4 Option B — local `.ipa` + `eas submit`

Better once the recipe is stable: it is scriptable and it does not need Xcode's
Organizer. **EAS Submit is free on every plan, including the free one** — it only
uploads an artifact you already built, so no build minutes are involved.

Produce the `.ipa`:

```bash
cd apps/mobile

xcodebuild -workspace ios/OBDCar.xcworkspace \
  -scheme OBDCar \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath build/OBDCar.xcarchive \
  archive

xcodebuild -exportArchive \
  -archivePath build/OBDCar.xcarchive \
  -exportPath build/ipa \
  -exportOptionsPlist ExportOptions.plist
```

`ExportOptions.plist` (keep it next to `eas.json`; it holds no secrets):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>            <string>app-store-connect</string>
  <key>teamID</key>            <string>REPLACE_WITH_NEW_TEAM_ID</string>
  <key>signingStyle</key>      <string>automatic</string>
  <key>uploadSymbols</key>     <true/>
  <key>destination</key>       <string>export</string>
</dict>
</plist>
```

Then upload:

```bash
npx eas submit -p ios --profile production --path build/ipa/OBDCar.ipa
```

### 4.5 Which credential `eas submit` should use

Two ways to authenticate against someone else's App Store Connect. Prefer the
second.

| | `appleId` + app-specific password | App Store Connect API key |
|---|---|---|
| What it is | Your Apple ID, plus a per-app password from appleid.apple.com | A `.p8` key file with an ID and issuer ID |
| 2FA prompts | On every session | None |
| Revocable without touching anyone's login | No | Yes |
| Works unattended / in CI | Poorly | Yes |

Create your own key at **App Store Connect → Users and Access → Integrations →
App Store Connect API → Individual Keys → +**. An *individual* key is issued to
you personally, is available regardless of role, and inherits your permissions —
which is precisely the property you want in an account you do not own. Download
the `.p8` once (Apple will not show it again) and store it outside the repo.

With a key, the `ios` block in `eas.json` uses `ascApiKeyPath` / `ascApiKeyId` /
`ascApiKeyIssuerId` **instead of** `appleId`; `ascAppId` is still required so the
CLI knows which app record to attach the build to.

`eas.json` cannot carry comments — EAS validates it with
`allowUnknown: false`, so a sibling `"//"` key makes the whole file invalid. The
three iOS submit values are therefore self-describing `TODO …` strings that say
where each value comes from. They are also deliberately malformed, so a submit
attempted before they are filled in fails on EAS's own validation
("Invalid Apple Team ID was specified…") rather than silently pointing at the
wrong account.

The `preview` submit profile also names a TestFlight group, `"Beta Testers"` —
that group has to exist in the *new* account's TestFlight before the profile
works.

---

## 5. Creating the App Store Connect app record

Register the bundle ID in the developer portal **first** (§ 3 — Xcode does this
on the first signed build), otherwise it will not appear in the dropdown below.

**App Store Connect → Apps → + → New App**:

| Field | Value | Note |
|---|---|---|
| Platforms | iOS | |
| Name | `OBD Car — ავტოდიაგნოსტიკა` (see `docs/app-store-metadata.md`) | Must be unique across the whole App Store, ≤ 30 chars. Reserved as soon as you save. |
| Primary language | **English (U.K.)** | The Georgia storefront's language. Georgian is **not** an App Store metadata localisation and never becomes one later — see `docs/app-store-metadata.md` § 0. Do not pick English (U.S.) out of habit. |
| Bundle ID | the registered identifier | Must match `expo.ios.bundleIdentifier` exactly |
| SKU | `obdcar-ios-001` | Internal only, never shown to users, immutable |
| User Access | Full Access | Limited Access means naming every user who may see it |

After saving, **App Information → General Information → Apple ID** shows a
numeric ID (e.g. `6740123456`). That number is the `ascAppId` for `eas.json`.

Then set **Distribution → Availability → Georgia only**. Phone auth is the only
door into the app and `sender.ge` delivers to Georgian numbers alone, so every
other storefront ships an app nobody there can sign into. The reasoning and what
would have to change to expand are in `docs/app-store-metadata.md`
§ "Availability — Georgia only".

---

## 6. App Privacy questionnaire

Answers below are what the code actually does. File references are the evidence;
re-check them if the data model changes.

### Data collected

These five answers must match `expo.ios.privacyManifests` in `app.json`
one-for-one — that block is already filled in, and the table below is written
from it, so a change to either is a change to both.

| Apple category → type | `NSPrivacyCollectedDataType` | Linked | Purpose | Evidence |
|---|---|---|---|---|
| Contact Info → Phone Number | `…TypePhoneNumber` | Yes | App Functionality | the account identity — `User.phone` (`services/backend/src/app/models.py`), collected on both screens in `app/(auth)/`, normalised to E.164 by `auth/phone.py` |
| Contact Info → Name | `…TypeName` | Yes | App Functionality | `User.first_name` / `User.last_name`, both `nullable=False` — required at registration, not optional |
| Identifiers → User ID | `…TypeUserID` | Yes | App Functionality | server-side numeric `User.id`, present on every synced row |
| User Content → Other User Content | `…TypeOtherUserContent` | Yes | App Functionality | chat messages — `src/db/schema.ts` `Message.content`, pushed/pulled by `src/sync/engine.ts`, stored in backend `messages` |
| Other Data → Other Data Types | `…TypeOtherDataTypes` | Yes | App Functionality | vehicle make/model/year/**VIN** (`Vehicle` in both schemas) and OBD readings/DTCs/freeze-frame JSON carried in `ToolCall` input/output |

**Email address is no longer collected — answer No.** There is no `email` column
on `User` and no email field anywhere in `app/(auth)/`. Authentication is a
phone number plus a 4-digit SMS code (`/auth/request-code` →
`/auth/verify-code`); there is no password to store either, so the old
"password hash" line is gone from every disclosure. Phone number takes the slot
email used to occupy, and it is the *more* sensitive of the two — it is a
directly reachable personal contact point, which is worth remembering when
someone proposes logging it.

Apple has no vehicle-telemetry category, so VIN, live PIDs and DTCs go under
**Other Data**. Describe them in the free-text purpose field rather than trying
to force them into "Sensitive Info" — none of Apple's sensitive subtypes apply.

The verification codes themselves are not a disclosable data type: they are
stored as a SHA-256 hash (`PhoneVerificationCode.code_hash`), single-use, and
expire in five minutes.

Chat content, VIN and sensor readings are forwarded to Anthropic's Claude API to
produce answers (`services/backend/src/app/claude/`). Apple treats a processor
used solely to deliver the app's own functionality as collection, not sharing —
it is already covered by the App Functionality purpose above. The disclosure
still belongs in the privacy policy, where it is (§ 4.1 of
`docs/PRIVACY_POLICY.md`).

### Data explicitly NOT collected

| Category | Why the answer is No |
|---|---|
| Contact Info → Email Address | No `email` column, no email input, no password. Phone + SMS code is the whole of authentication. |
| Diagnostics / Crash Data | **`src/lib/sentry.ts` is a no-op stub** ("Sentry disabled — native integration crashes on iOS 18 with Hermes new arch"): every exported function has an empty body, and `@sentry/react-native` is not a dependency in `package.json`. The app transmits no crash telemetry. The backend's own Sentry (`services/backend/src/app/sentry.py`) records server-side errors and is off unless `SENTRY_DSN` is set — server-side error logging is not App Privacy collection in any case. |
| Location | No `NSLocation*` key in `ios/OBDCar/Info.plist`, no location API anywhere in `src/`. The Android manifest requests `ACCESS_FINE_LOCATION` because pre-API-31 Android gates BLE scanning behind it — iOS does not, and Apple's questionnaire is per-platform. |
| Usage Data / Product Interaction | No analytics SDK. `package.json` dependencies are Expo modules, i18next, nativewind, zustand, react-native-ble-plx / bluetooth-classic / tcp-socket, reanimated, svg, mmkv. Nothing that reports usage. |
| Identifiers → Device ID / Advertising Data | No IDFA, no `AppTrackingTransparency`, no ad SDK. |
| Contacts, Photos, Health, Financial, Browsing/Search History, Purchases | Not touched. |

### Tracking

**"Do you or your third-party partners use data for tracking?" → No.** Nothing
is shared with data brokers or joined with third-party data for advertising.
Consequently the app needs no `NSUserTrackingUsageDescription` and must not show
an ATT prompt. This matches `ios/OBDCar/PrivacyInfo.xcprivacy`, which declares
`NSPrivacyTracking = false`.

### Account deletion — Guideline 5.1.1(v), and it is satisfied

Any app that lets a user create an account must let them delete it from inside
the app, not by emailing support. This one does: **Profile tab → Delete
account**, behind a confirmation alert (`app/(app)/(tabs)/profile.tsx`,
`settings.deleteAccount*` in both locale files). It calls
`DELETE /auth/me`, which does `session.delete(user)` — and every relationship on
`User` in `services/backend/src/app/models.py` carries
`cascade="all, delete-orphan"` with `ondelete="CASCADE"` on the foreign keys, so
refresh tokens, vehicles, diagnostic sessions, messages and tool calls all go
with it. `src/lib/clear-local-data.ts` wipes the on-device MMKV stores too.

Worth naming in the review notes only if a reviewer asks; it is listed here
because it is the kind of requirement that is easy to assume is someone else's
job.

### Privacy manifest — already consistent, keep it that way

`expo.ios.privacyManifests` in `app.json` declares `NSPrivacyTracking: false`,
an empty `NSPrivacyTrackingDomains`, and exactly the five
`NSPrivacyCollectedDataTypes` in the table above, all
`…Linked: true` / `…Tracking: false` / purpose `AppFunctionality`. Prebuild has
written it through to `ios/OBDCar/PrivacyInfo.xcprivacy`, so the manifest and
the questionnaire agree today.

They agree because both are generated from the same list. The failure mode is
that someone adds a field to `User` or a new tool output and updates only one of
the three places this is written down — `app.json`, the table above, and the
privacy policy. Treat them as one edit.

### Privacy Policy URL

App Store Connect requires a live URL, and Apple checks that the page loads and
describes the app in front of them.

`https://obdcar.ge/ka/privacy` is served by
`apps/landing/src/app/[lang]/privacy/page.tsx`, with copy in
`apps/landing/src/i18n/dictionaries/{ka,en}.ts`.

**The published copy is currently wrong and will fail that check.** The `data`
section of the landing dictionaries still says the app collects "your email
address and password (stored only as a one-way hash)". There is no email and no
password. Since the labels you file above say Phone Number and no Contact
Info → Email, a reviewer comparing the two finds a policy that does not match
the disclosure — which is a Guideline 5.1.1 problem, not a typo. Fix the landing
dictionaries and redeploy before the URL goes into App Store Connect.

`docs/PRIVACY_POLICY.md` (the repo-root source document) has been brought in
line; it still carries deliberate `[placeholder]` fields for the publisher name,
contact address and postal address, and those must be filled before the policy
is published anywhere Apple can read it.

---

## 7. Export compliance

**Already done — this section is now a justification, not a task.** `app.json`
sets `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` and the key is present
in the generated `ios/OBDCar/Info.plist`, so App Store Connect stops asking the
encryption question on every upload and no build parks in "Missing Compliance".

Why `false` is the correct answer, in case it is ever challenged:

The app's only use of cryptography is Apple's own TLS stack:
`src/lib/api.ts` talks to `https://obd-ai-backend.fly.dev` over `fetch`, the chat
client (`src/chat/client.ts`) uses `wss://`, and
`NSAppTransportSecurity.NSAllowsArbitraryLoads` is `false`, so cleartext is not
even permitted. Auth tokens are handed to the Keychain via `expo-secure-store`
(`src/lib/token-store.ts`) — again Apple's implementation. The app ships no
cryptographic implementation of its own and does no proprietary encryption of
stored data. That is squarely the standard exemption for apps that only call the
platform's HTTPS.

SMS verification does not change the answer. The 4-digit code is generated
server-side and hashed with SHA-256 (`services/backend/src/app/security.py`);
hashing is not encryption, none of it runs on the device, and the code reaches
the phone over the carrier's SMS network rather than through anything the app
implements.

Revisit this if anyone later adds custom encryption of the local SQLite database
or a bundled crypto library — `expo-crypto` is currently an unused transitive
dependency, but if it starts encrypting rather than hashing, the answer changes.

---

## 8. App Review notes

This app has **two** things a reviewer physically cannot do, and the review
notes exist to solve both. Get either wrong and it is an automatic Guideline 2.1
"we were unable to review the app's features."

### 8.1 The reviewer cannot receive an SMS code

Sign-in is a Georgian phone number and a 4-digit code, and nothing else — no
email, no password, no Google, no anonymous mode. `normalize_georgian_phone()`
rejects any number that is not `+9955XXXXXXXX` before a code is generated, and
`sender.ge` only delivers to Georgian mobiles. Apple's reviewers are in the
United States. Without help, review ends at the first screen.

The fix is already deployed: `TEST_PHONE_NUMBERS` in the backend config is a
map of reserved numbers to fixed codes. Production is set to

```
TEST_PHONE_NUMBERS="+995555000001:3843"
```

A number in that map skips the `sender.ge` call and the per-phone resend
cooldown. Everything else about it is a normal code — it is written to
`phone_verification_codes` with the same SHA-256 hash, it still expires after
`PHONE_CODE_TTL_MINUTES` (5), it is still consumed on first use, and it still
dies after `PHONE_CODE_MAX_ATTEMPTS` (5) wrong guesses. That is deliberate: the
bypass is delivery, not authentication, so a leaked reserved number does not
hand anyone a permanent skeleton key to the auth system.

> **This is a working production credential in a public repository.**
> `github.com/BekaChkhiro/obd-car` is public, so the pair above is readable by
> anyone. The blast radius is small — the account sees only its own demo data,
> and the number belongs to nobody — but it is not zero. **Rotate it once the
> app is approved:** `fly secrets set TEST_PHONE_NUMBERS=""` removes the bypass
> entirely, and any later resubmission can set a fresh pair. If that is not
> acceptable, keep the code out of this file and paste it into App Store Connect
> only, leaving a `[see 1Password]` marker here.

Verify the number works against production *before* you submit — a reserved
number that was never set, or set on a machine that has since been redeployed,
fails silently and looks exactly like a wrong code:

```bash
curl -sS -X POST https://obd-ai-backend.fly.dev/auth/request-code \
  -H 'content-type: application/json' \
  -d '{"phone":"+995555000001"}'
# expect 200 {"expires_in":300,"resend_after":60}
# a 404 {"detail":"registration_required"} means the account does not exist yet —
# register it once from the app's sign-up screen with any first/last name.
```

Register the reviewer account once from the app itself so it has a name on it,
then leave it alone.

### 8.2 The reviewer does not have an OBD-II adapter or a car

Without an adapter the dashboard is empty and the AI assistant is gated —
`chat.gateTitle: "Connect your car first"`, `chat.gateComposer: "Connect a car
to chat"`.

**Demo mode now ships, and it is no longer E2E-gated.** In
`app/(app)/(tabs)/dashboard.tsx`, the empty-state screen renders a **Run demo
mode** button unconditionally; it builds `createMockAdapter()`
(`src/ble/mock-adapter.ts`, an in-memory ELM327 that answers real OBD-II
commands) and injects it with
`connectionMachine.injectAdapter(mock, 'demo-adapter', 'simulated')`.

The `'simulated'` kind is what makes this honest, and it reaches every screen
because the connection machine owns it rather than the dashboard:

- **Dashboard** — the LIVE pill becomes a **DEMO MODE** pill
  (`dashboard.demoMode`, tap to stop).
- **AI tab** — `carConnected = adapterKind !== null`, so a simulated adapter
  opens the gate; `hasLiveLink = adapterKind === 'real'` stays false, so the
  **SIMULATED ADAPTER** banner renders above the transcript
  (`chat.simulatedDataTitle` / `chat.simulatedDataBody`).
- **Backend** — the `adapter_simulated` flag reaches the system prompt, where
  `_LIVE_DATA_SIMULATED` in `services/backend/src/app/claude/prompt.py` instructs
  the model to name every value it reports as simulated demo data and to refuse
  conclusions about the user's actual vehicle.
- **Trouble codes** — the screen reads `connectionMachine.getAdapter()`, so it
  opens on the mock like any other adapter.

Two details to get right in the notes, because the mock is specific: it reports
**one** stored code, **P0300**, and no pending or permanent codes (`case '07'`
and `case '0A'` in `mock-adapter.ts` return `NO DATA` and an empty list). The
older draft of these notes promised "stored, pending and permanent DTCs" — a
reviewer who goes looking for the other two finds nothing and files it as a
broken feature. The VIN is `1GNEK13Z04R101234`.

The other mock-adapter entry point, on the pair screen, is **still** `isE2E()`-
gated and will not be visible to the reviewer. Only the Live data tab's button
ships. Do not write a tap path through the pair screen.

### 8.3 App Review Information — what to fill in

- **Sign-in required: Yes.**
- **User name**: `+995555000001` · **Password**: `3843`
  (App Store Connect labels the fields user name / password; there is nowhere
  else to put a phone-and-code pair, and the notes explain it.)
- **Contact**: a phone number and email that will actually be answered during
  review.
- **Notes**: the text below, verbatim.

### 8.4 Review notes — paste this into App Store Connect

English, because the review notes field is read by Apple's reviewers and not by
users. Everything in it is checkable against the build.

```
This app reads live engine data and fault codes from a car through an ELM327
OBD-II adapter, and an AI assistant explains what the readings mean.

Two things about this app make it impossible to review normally, and both have
a workaround built in for you.

1) SIGN-IN — WHY WE PROVIDED A RESERVED TEST NUMBER

The app is launching in Georgia only, and the only way to sign in is a Georgian
mobile number plus a 4-digit code sent by SMS. Our SMS provider (sender.ge) is
a Georgian gateway and can only deliver to Georgian mobile numbers, so a code
sent to a US number would never arrive. There is no email or password login.

We have therefore reserved a test number on the production server that skips
the SMS send and accepts a fixed code:

    Phone number: +995555000001
    Code:         3843

To sign in:
  a. Launch the app. The sign-in screen is the first thing you see.
  b. In the phone field, type 555000001 (nine digits). The +995 country code
     is fixed next to the field and must not be typed.
  c. Tap "Continue". No SMS is sent for this number, so nothing needs to
     arrive on your device.
  d. Enter the code 3843. You are signed in.
  e. A four-step setup follows. Tap "Get Started", then "Skip for now" on the
     adapter step, "Skip" on the vehicle identification step, choose English,
     and tap "Get Started".

The code behaves normally apart from delivery: it expires 5 minutes after you
request it and allows 5 attempts. If it stops working, tap "Change phone
number", then request a new one — for this number it can be re-requested
immediately, as the usual 60-second resend cooldown does not apply.

2) DEMO MODE — REVIEWING WITHOUT AN OBD-II ADAPTER OR A CAR

The app normally reads data from an ELM327 adapter plugged into a car. You do
not need either. A demo mode is built into the shipping app:

  a. Open the "Data" tab in the bar at the bottom of the screen.
  b. Tap "Run demo mode".

A simulated adapter connects and engine RPM, speed, coolant temperature, fuel
level and battery voltage begin streaming, with a 5-minute history chart below
them. A "DEMO MODE" badge replaces the usual "LIVE" badge so the data can never
be mistaken for a real vehicle. Tap that badge to stop the demo.

With demo mode running, the rest of the app opens up:

  - "AI" — the round accent button set apart from the other tabs at the bottom
    of the screen. Ask, for example, "What error codes do we have?" or "Why is
    the engine heating up?". The assistant reads the simulated sensor values and
    fault codes before answering. A "SIMULATED ADAPTER" banner is shown above
    the conversation, and the assistant itself states in its answers that the
    readings are simulated and draws no conclusions about a real car.
  - "Garage" tab -> "Trouble codes" — shows the simulated stored fault code
    P0300 (random/multiple cylinder misfire) with a plain-language description
    and freeze-frame data. The simulator reports no pending and no permanent
    codes, so those two sections are correctly empty.
  - The simulated VIN is 1GNEK13Z04R101234.

3) PERMISSIONS AND DATA

Bluetooth permission is requested only to discover and connect to an OBD-II
adapter. The app never scans in the background, declares no background modes,
and collects no location data. We use no analytics or crash-reporting SDK.

Chat messages and the vehicle readings the assistant reads are sent to
Anthropic's Claude API to generate answers. This is disclosed in our privacy
policy.

4) CLEARING FAULT CODES

Clearing codes always requires a separate explicit confirmation, and the app
states plainly that clearing the ECU's memory does not repair the fault. This
is standard OBD-II mode 04 and is what every scan tool does.

Thank you — please contact us at the address above if anything here does not
work as described.
```

### Native config: two review risks that are now closed

Both of these were open in the previous revision of this document and have since
been fixed. Recorded so nobody re-introduces them:

- **Guideline 2.5.4 — unused background modes.** The `react-native-ble-plx`
  plugin block in `app.json` no longer passes a `modes` array, so the generated
  `Info.plist` declares no `UIBackgroundModes` at all. Verified: `plutil -p
  ios/OBDCar/Info.plist` has no such key. Do not add `modes` back — the plugin
  block still sets `isBackgroundEnabled: false` and the app does nothing while
  backgrounded, so any declared mode would be a mode it does not use.
- **Stray `NSFaceIDUsageDescription`.** Gone from the generated `Info.plist`.
  There is no `expo-local-authentication` dependency and no `LocalAuthentication`
  call in `src/` or `app/`, so an unused purpose string would have invited a
  question with no good answer.

The remaining purpose strings are `NSBluetoothAlwaysUsageDescription` and
`NSLocalNetworkUsageDescription` (the latter for WiFi adapters, which create
their own local network in the car). Both are used. Both, however, currently
begin **"Auto Area connects to…"** while the app is called OBD Car — see the
blocker in § 9.

---

## 9. Blockers to clear before the first upload

Ordered by how badly each one ends the review.

1. **`ios.appleTeamId` is still the literal string `REPLACE_WITH_APPLE_TEAM_ID`**
   in `app.json`. Signing cannot succeed until it is the publishing team's real
   ten-character ID (§ 3), and the same value is a `TODO …` placeholder in all
   four `eas.json` submit slots.
2. **The published privacy policy describes an app that no longer exists**
   (§ 6). `apps/landing/src/i18n/dictionaries/{ka,en}.ts` still tells readers the
   app collects an email address and a password hash. Apple reads that URL and
   compares it against your App Privacy answers, which now say Phone Number and
   no email at all. Fix and redeploy the landing site before the URL is entered.
3. **Bundle ID may be locked to your own team** (§ 2). Verify before anything
   else; the remedy changes what you fill into every later step.
4. **Verify `TEST_PHONE_NUMBERS` actually answers in production** (§ 8.1),
   with the `curl` in that section, and make sure the reviewer account exists.
   A reserved number that was never set fails exactly like a wrong code, and the
   rejection it produces is the expensive kind.
5. **Build number does not auto-increment** (§ 4.2). The key now exists in
   `app.json`; the second upload still fails unless someone bumps it.
6. **Availability must be set to Georgia only** (§ 5). Shipping worldwide ships
   an app that nobody outside Georgia can sign into.
7. **Purpose strings say "Auto Area", the app is called "OBD Car"**
   (`app.json` → `ios.infoPlist` and the `react-native-ble-plx` plugin block).
   The reviewer meets that string in the first system dialog the app raises.
   Not fatal on its own; trivially avoidable.
8. **`CFBundleLocalizations` is unset**, so the store page will advertise a
   fully bilingual app as English-only — see `docs/app-store-metadata.md`
   § "Bundle languages". Cosmetic to Apple, material to a Georgian buyer.

Closed since the previous revision of this document, recorded so the changes are
not mistaken for noise and not re-introduced:

- **Google sign-in is gone entirely**, along with email, password and password
  reset. `app/(auth)/` is two screens — phone, then a 4-digit code — so the dead
  "Continue with Google" button that would have failed under Guideline 2.1 no
  longer exists, and with it the Guideline 4.8 question about offering an
  equivalent privacy-preserving login. No Google OAuth client is needed and no
  `GOOGLE_*` variable is read anywhere.
- **`ITSAppUsesNonExemptEncryption: false`** is set in `app.json` (§ 7). No more
  "Missing Compliance" on every upload.
- **The privacy manifest is filled in** (§ 6) and matches the questionnaire.
- **`supportsTablet: false`**, and the generated project agrees
  (`TARGETED_DEVICE_FAMILY = 1`). No iPad screenshots, no iPad layout testing.
- **Unused background modes and `NSFaceIDUsageDescription` are gone** (§ 8).
- **The E2E bypass can no longer ship in a local archive** (§ 4.1) —
  `app.config.ts` now treats `CONFIGURATION=Release` as a shippable build.
- **Demo mode reaches the AI tab and the codes screen** (§ 8.2), so the gate on
  the app's headline feature no longer blocks review.
- **`eas.json` no longer sets empty env values.** eas-cli 18 rejects them, so
  **every** `eas` command that read the file used to fail with "eas.json is not
  valid" before you got as far as building.

Non-blocking but worth knowing: `eas.json`'s Android submit profiles point at
`./secrets/google-service-account.json`, which does not exist. That only matters
when you get to Play Store submission.

---

## 10. Pre-flight checklist

```
[ ] Invited into the other team, invitation accepted, role confirmed
[ ] Bundle ID resolved and registered under the NEW team
[ ] app.json: ios.appleTeamId is the real Team ID, not REPLACE_WITH_APPLE_TEAM_ID
[ ] app.json: ios.buildNumber bumped past the last uploaded build
[ ] app.json: ios.infoPlist.CFBundleLocalizations = ["ka", "en"]
[ ] app.json: purpose strings name the app the store calls it, not "Auto Area"
[ ] .env has production API_URL/WS_URL and no EXPO_PUBLIC_E2E
[ ] npx expo prebuild --clean -p ios, DEVELOPMENT_TEAM verified in the project
[ ] Archived, and the embedded app.config verified (apiUrl, wsUrl, e2e:false)
[ ] App Store Connect record created; ascAppId copied into eas.json
[ ] Primary Language = English (U.K.); Availability = Georgia only
[ ] TEST_PHONE_NUMBERS verified live against production (§ 8.1 curl)
[ ] Reviewer account +995555000001 registered, with a first/last name on it
[ ] Demo mode smoke-tested end to end on the release build: dashboard pill,
    AI tab banner, assistant naming the data as simulated, codes screen P0300
[ ] App Privacy answered per § 6; matches app.json privacyManifests exactly
[ ] Landing-site privacy copy corrected (no email/password) and redeployed
[ ] docs/PRIVACY_POLICY.md placeholders filled by the publishing entity
[ ] Privacy policy URL live at https://obdcar.ge/ka/privacy
[ ] App Review notes pasted from § 8.4, sign-in credentials filled in
[ ] Screenshots captured with the app in Georgian; iPhone 6.9" + 6.5" only
[ ] Metadata from docs/app-store-metadata.md uploaded (one locale, en-GB)
```

After approval: rotate or clear `TEST_PHONE_NUMBERS` (§ 8.1). The pair is
committed to a public repository and there is no reason to leave a working
delivery bypass on production once review is over.
