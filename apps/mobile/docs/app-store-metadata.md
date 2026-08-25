# App Store metadata — v1.0.0 draft

Copy for the App Store Connect listing. Everything here is grounded in what the
app actually ships: the strings in `src/locales/ka.json` / `src/locales/en.json`
and the product positioning already published on the landing site
(`apps/landing/src/i18n/dictionaries/ka.ts`). Nothing below promises a feature
that is not in the build.

Paste it into **App Store Connect → your app → Distribution → iOS App 1.0** and
**App Information**. Field limits are Apple's; the counts in brackets are the
draft's actual length.

---

## 0. Read this before anything else: Georgian is not an App Store language

v1.0 launches in **Georgia only** and the app is Georgian-first. The listing
cannot be, and no amount of wanting it changes that:

- **Apple's App Store metadata localisations do not include Georgian.** The list
  is fixed at 50 languages
  ([App Store localizations](https://developer.apple.com/help/app-store-connect/reference/app-store-localizations/)),
  and Georgian is not one of them — including after the eleven languages Apple
  added in March 2026. There is no Georgian option in the Localizations dropdown
  and none for Primary Language either.
- **The Georgia (GEO) storefront's language is English (U.K.), with no
  additional supported language.** That is Apple's own country table on the same
  page. So the single localisation a Georgian user will ever be served is
  English (U.K.).

What follows from that, and what this file is therefore structured around:

1. **Primary Language = English (U.K.)**, not English (U.S.). It is the language
   of the storefront the app is being sold into, and there is no reason to make
   the one listing anyone sees a foreign-region variant.
2. **The one description field carries the Georgian copy first**, with a shorter
   English version under it. Apps sold into markets Apple does not localise do
   this routinely; it is the only way for a Georgian buyer to read the listing in
   Georgian. Both halves are kept below and must stay in sync.
3. **Name, subtitle and keywords have 30/30/100 characters and one field each** —
   there is no second locale to put the other language in. They are written in
   Georgian, with the Latin-script terms people actually type (`OBD`, `ELM327`,
   `check engine`) kept inline so both search vocabularies are covered.
4. **"Georgian" appears on the product page only if the bundle says so.** The
   store page's Languages row is read from the app binary, not the listing. See
   § "Bundle languages" below — this is currently missing and is the one place a
   Georgian user gets an unambiguous signal.

If Apple later adds Georgian as a metadata localisation, § "Georgian listing (if
Apple ever offers it)" has the copy ready to split back out into its own locale.

---

## App Information (set once, not per-version)

| Field | Value | Note |
|---|---|---|
| Name | `OBD Car — ავტოდიაგნოსტიკა` | [25/30] Globally unique. The on-device home-screen name stays `OBD Car` (`CFBundleDisplayName`); the store name may differ and should carry the searchable words in both scripts. |
| Subtitle | `ცოცხალი მონაცემები და კოდები` | [28/30] Shown under the name in search results. |
| Primary language | **English (U.K.)** | The Georgia storefront's language — see § 0. Georgian is not selectable. |
| Primary category | **Utilities** | Where OBD-II scanner apps live. |
| Secondary category | **Reference** | Optional; the DTC descriptions in `packages/obd-protocol/src/dtc-descriptions.ts` justify it. |
| Age rating | 4+ | No user-generated content shown to others, no ads, no gambling, no unrestricted web. The AI assistant answers about the user's own vehicle only. |
| Privacy Policy URL | `https://obdcar.ge/ka/privacy` | Served by `apps/landing/src/app/[lang]/privacy/page.tsx`; `ka` is the landing site's default locale (`apps/landing/src/i18n/config.ts`). Must be live **and accurate** before submission — see the blocker in `docs/app-store-submission.md` § 9. |
| Support URL | `https://obdcar.ge/ka` | **See "Open questions" — a real support page is needed.** |
| Marketing URL | `https://obdcar.ge/ka` | Optional. |
| Copyright | `2026 OBD Car` | Replace with the publishing entity's legal name — it must match the account the app ships under, not the developer's. |

---

## Availability — Georgia only

Set **Distribution → Availability** to **Georgia** and nothing else. This is not
a go-to-market preference, it is a functional limit:

- The only way into the app is a phone number and an SMS code
  (`app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx`) — there is no email
  login, no password, no anonymous mode.
- `normalize_georgian_phone()` in `services/backend/src/app/auth/phone.py`
  rejects anything that is not a 9-digit Georgian mobile number starting with 5,
  before a code is ever generated.
- Codes are delivered by **sender.ge** (`services/backend/src/app/sms.py`), a
  Georgian gateway that is handed the bare 9-digit national number with `+995`
  stripped. It cannot deliver anywhere else.

So a user in any other storefront can download the app and then cannot get past
the first screen. Listing it there earns one-star reviews and a Guideline 2.1
rejection risk for a feature the reviewer cannot complete.

**What has to change before expanding to a second country**, so a future reader
does not have to re-derive it:

1. An SMS provider with international reach (or a second provider per market)
   behind the `send_sms` seam in `sms.py` — the seam is already there, the
   provider is not.
2. `normalize_georgian_phone()` replaced with real E.164 parsing, and the
   `PhoneInput` component's fixed `+995` prefix made a country picker.
3. `RequestCodeRequest`/`VerifyCodeRequest` validators updated in lockstep — the
   phone validator is what currently enforces the market boundary, so widening
   it is the moment the availability list may widen.
4. Only then: add storefronts in App Store Connect, and add the metadata
   localisation for each new market (which, for most of them, Apple does have).

---

## Version 1.0 listing

### Promotional text [155/170]

Editable without shipping a new build — use it for adapter-compatibility news or
a "what's new" teaser between releases. Georgian, because it renders directly
above the description for the audience that will read it.

```
ჩარგე ELM327 ადაპტერი და ტელეფონი პირდაპირ ძრავს კითხულობს: ბრუნი, გაგრილება, საწვავი, აკუმულატორი და ყველა შენახული ხარვეზის კოდი — ახსნილი გასაგებ ენაზე.
```

### Description [3713/4000]

Georgian first, then a condensed English version after a separator. The English
half is deliberately shorter than the Georgian: it exists so an App Review
reader and the small English-reading minority of the storefront are not stuck,
not to carry equal weight.

```
შენმა მანქანამ უკვე იცის, რა სჭირს. OBD Car ეკითხება და პასუხს გასაგებად გიხსნის.

ჩარგე ELM327 OBD-II ადაპტერი საჭის ქვეშ არსებულ პორტში, დააკავშირე ტელეფონი და აპლიკაცია პირდაპირ ძრავის კომპიუტერს (ECU) კითხულობს — იმავე მონაცემებს, რასაც ავტოსერვისის სკანერი ხედავს.

ცოცხალი მონაცემები
ძრავის ბრუნი, სიჩქარე, გამაგრილებლის ტემპერატურა, საწვავის დონე და აკუმულატორის ძაბვა — წამში ერთხელ განახლებული, 5-წუთიანი ისტორიის გრაფიკით. დააყენე შენი ზღვრები და აპლიკაცია მაშინვე გაფრთხილებს, როცა ძრავი გადახურდება ან ძაბვა დასაშვებზე დაბლა ჩავა.

ხარვეზის კოდები, რომლებიც გასაგებია
წაიკითხე შენახული, მოლოდინში მყოფი და მუდმივი კოდები პირდაპირ ECU-დან — თითოეული მარტივი ახსნით, რას ნიშნავს სინამდვილეში. freeze-frame მონაცემები გიჩვენებს, რა პირობებში დაფიქსირდა ხარვეზი. კოდების წაშლა შესაძლებელია, მაგრამ მხოლოდ ცალკე დადასტურების შემდეგ — და აპლიკაცია პირდაპირ გეუბნება, რომ მეხსიერების გასუფთავება ხარვეზის შეკეთება არ არის.

ასისტენტი, რომელიც შენს ციფრებს კითხულობს
ჰკითხე ჩვეულებრივი სიტყვებით. AI ასისტენტი პასუხამდე თავად კითხულობს ცოცხალ მაჩვენებლებსა და შენახულ კოდებს შენი ადაპტერიდან — ახსნა შენს მანქანას ეყრდნობა და არა ზოგად რჩევას. საუბრები ინახება, ასე რომ თვის წინ ნაძებნი ხარვეზი შემდეგშიც აქვე დაგხვდება.

მუშაობს იმ ადაპტერთან, რომელიც უკვე გაქვს
ნებისმიერი ELM327-თავსებადი OBD-II ადაპტერი Bluetooth Low Energy-ით ან WiFi-ით. მათ შორის იაფი კლონები — სწორედ ისინი აქვს ხალხის უმეტესობას.

ჯერ არ გაქვს ადაპტერი? გაუშვი დემო რეჟიმი
დემო რეჟიმი სიმულირებულ ადაპტერს უშვებს, ასე რომ ყიდვამდე ნახავ, როგორ მუშაობს პანელი, გრაფიკები და ასისტენტი. სიმულირებული მაჩვენებლები ყოველთვის აღნიშნულია.

ქართულად და ინგლისურად
ინტერფეისიც და ასისტენტიც შენს ენაზე საუბრობს — ასისტენტი პასუხობს იმ ენაზე, რომელიც აირჩიე.

რა გჭირდება
მანქანა 16-პინიანი OBD-II პორტით — სტანდარტულია ევროპაში 2001 წლიდან გაყიდულ ბენზინის და 2004 წლიდან დიზელის მანქანებზე — და ELM327 ადაპტერი. მაჩვენებლებისა და კოდების წაკითხვა მთლიანად ადაპტერსა და ტელეფონს შორის ხდება; ინტერნეტი მხოლოდ ასისტენტსა და ისტორიის სინქრონიზაციას სჭირდება.

რეგისტრაცია ხდება ქართული მობილურის ნომრით, SMS-ით მიღებული 4-ნიშნა კოდით. Bluetooth Classic ადაპტერები iPhone-ზე არ მუშაობს — ეს iOS-ის შეზღუდვაა და არა აპლიკაციის; გამოიყენე BLE ან WiFi ადაპტერი.

— — —

Your car already knows what is wrong. OBD Car asks it, and explains the answer.

Plug an ELM327 OBD-II adapter into the port under your steering wheel, pair it with your phone, and the app reads your engine control unit directly — the same data a garage's scan tool sees.

LIVE ENGINE DATA. Engine RPM, speed, coolant temperature, fuel level and battery voltage, refreshed once a second, with a rolling five-minute chart and alert thresholds you set yourself.

FAULT CODES THAT MAKE SENSE. Stored, pending and permanent trouble codes read straight from the ECU, each with a plain description, plus freeze-frame data. Codes can be cleared only after a separate confirmation, and the app is honest that clearing is not repairing.

AN ASSISTANT THAT READS YOUR NUMBERS. Ask in ordinary words. The AI assistant pulls live readings and stored codes from your adapter before answering, so the explanation is built on your car. Conversations are kept.

NO ADAPTER YET? Demo mode runs a simulated adapter so you can see the app work first. Simulated readings are labelled as such, always.

WHAT YOU NEED. A car with a 16-pin OBD-II port and any ELM327-compatible adapter over Bluetooth Low Energy or WiFi. Reading happens between the adapter and your phone; the internet is needed only for the assistant and history sync.

Sign-up uses a Georgian mobile number and a 4-digit SMS code. Bluetooth Classic adapters are not supported on iPhone — an iOS platform restriction, not an app one.
```

Note the last line of each half. Telling a buyer *before* they download that
sign-up needs a Georgian number costs nothing here and prevents the one-star
review from the person who found the app from outside the storefront.

### Keywords [95/100]

Comma-separated, **no spaces after commas** — spaces count against the 100
characters. Do not repeat words already in the app name or subtitle; Apple
indexes those separately (which is why `ავტოდიაგნოსტიკა`, `ცოცხალი`,
`მონაცემები` are absent — they are already in the name and subtitle).

```
obd2,elm327,დიაგნოსტიკა,სკანერი,ხარვეზი,კოდები,ძრავი,ბრუნი,check engine,ecu,მანქანა,აკუმულატორი
```

The Latin terms are not filler. Georgian drivers type `obd2`, `elm327` and
`check engine` as-is — those are the words printed on the adapter and on the
dashboard lamp, and there is no Georgian spelling of them in circulation.

### What's New in This Version

First release — leave empty for 1.0. App Store Connect does not require it for a
new app.

### Support and review contact

- Support email: `hello@obdcar.ge` (`apps/landing/src/lib/site.ts`)
- The reserved review phone number and the demo-mode walkthrough go in
  **App Review Information**, not here — see `docs/app-store-submission.md` § 8.

---

## Screenshots

Required: **6.9"** (iPhone 16 Pro Max, 1320 × 2868) and **6.5"** (1284 × 2778).

**No iPad screenshots are needed.** `app.json` sets `ios.supportsTablet: false`
and the generated project agrees — `TARGETED_DEVICE_FAMILY = 1` in
`ios/OBDCar.xcodeproj/project.pbxproj`, i.e. iPhone only. App Store Connect only
demands the 13" iPad set from apps that declare themselves iPad-capable.

**Capture them with the app set to Georgian.** Screenshots are the one part of
the listing that is not bound by Apple's metadata-language list — the images are
whatever you upload. With the listing forced into English (U.K.), the
screenshots are where a Georgian buyer actually sees their own language, so this
matters more here than it would in a normal submission. Switch the language in
onboarding, or in Profile → language, before capturing.

Capture these five, all from **demo mode** so the numbers are real-looking but
honest. Every screen already has the copy on it, so no added marketing text is
needed:

1. Live data dashboard mid-stream — RPM, speed, coolant, fuel, battery, with the **დემო რეჟიმი** pill visible.
2. The five-minute history chart with an active coolant threshold alert.
3. Trouble codes screen with the stored code and its description.
4. AI assistant answering `ძრავი რატომ ცხელდება?` (`chat.quickPrompt2`), with the **სიმულირებული ადაპტერი** banner in frame.
5. Garage tab — the connect-adapter entry point.

Screenshot 4 deliberately keeps the simulated-adapter banner in frame rather
than cropping it out. The whole demo-mode design is that generated numbers are
never passed off as measurements (`services/backend/src/app/claude/prompt.py`,
`_LIVE_DATA_SIMULATED`); a marketing screenshot that hides the label would be
the one place the product lies.

---

## Bundle languages — the only place "Georgian" appears on the product page

The store page's **Languages** row is read from the app binary, not from the
listing metadata. Right now the bundle declares nothing: there are no `.lproj`
directories in `ios/OBDCar/`, and `CFBundleDevelopmentRegion` is the default. A
fully bilingual app will therefore advertise itself as English-only.

Fix it in `app.json` — like every other native setting, `ios/` is regenerated by
`prebuild`, so a hand-edit there is lost:

```jsonc
"ios": {
  "infoPlist": {
    "CFBundleLocalizations": ["ka", "en"]
  }
}
```

`ka` first, so Georgian is what the row leads with. This is a listing-visible
change with no runtime effect — the app's own language is chosen in onboarding
and stored in MMKV (`src/lib/i18n.ts`, `src/store/locale.ts`), not from the
bundle.

> **Related, and worth deciding before launch:** `src/lib/i18n.ts` falls back to
> `'en'` when nothing is stored, ignoring the device language. In a
> Georgia-only launch, every user's first screen is in the wrong language until
> they reach the onboarding language step. Defaulting to `ka` — or reading
> `expo-localization` — is a one-line change with a large share of the first-run
> impression riding on it.

---

## Georgian listing (if Apple ever offers it)

Nothing to do today; keep this section so the copy is ready if Georgian is added
to the localisations list. At that point:

- Add `ka` as a localisation, move the Georgian half of the description above
  into it verbatim, and cut the description of the English (U.K.) locale down to
  the English half alone.
- Name and subtitle stay as they are — they are already Georgian.
- Keywords can drop the hedging: a Georgian locale would let the Latin terms
  move to the English locale's keyword field and free ~25 characters here.
- Keep both locales in this file side by side so they do not drift, the same
  discipline `apps/landing/src/i18n/dictionaries/` enforces with its
  `satisfies Dictionary` check.

---

## Open questions before this is submittable

1. **Support URL.** Apple requires a page with a way to contact support. The
   landing site only routes `/[lang]` and `/[lang]/privacy` (`routes` in
   `apps/landing/src/lib/site.ts`) — there is no support page, and a `mailto:`
   is not accepted as a Support URL. Either add `/[lang]/support` to
   `apps/landing` or point the field at the landing page and make sure
   `hello@obdcar.ge` is visible on it.
2. **Store name.** `OBD Car — ავტოდიაგნოსტიკა` is a proposal. It must be unique
   across the entire App Store and is reserved the moment the app record is
   created, so check availability first and settle on it before § 5 of the
   submission runbook. If a Georgian-script name turns out to be awkward to
   reserve, `OBD Car: ავტოდიაგნოსტიკა` [24/30] is the fallback.
3. **Copyright holder.** Must name the entity that owns the publishing account,
   which is not the developer. Ask the account owner.
4. **Brand mismatch in the permission prompts.** `app.json`'s
   `NSBluetoothAlwaysUsageDescription` and `NSLocalNetworkUsageDescription` both
   begin "Auto Area connects to…", while `CFBundleDisplayName` and the whole
   listing say "OBD Car". The reviewer sees that string in the first system
   dialog the app raises. Pick one name and make the purpose strings match it.
