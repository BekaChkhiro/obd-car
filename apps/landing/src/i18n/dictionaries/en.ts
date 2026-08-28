import type { Dictionary } from './ka';

/**
 * English copy. Mirrors `ka` key for key — the `satisfies Dictionary` check at
 * the bottom fails the build if the two ever drift apart.
 */
export const en = {
  meta: {
    title: 'Auto Area — Ask Your Car What Is Wrong',
    titleTemplate: '%s · Auto Area',
    description:
      'An ELM327 OBD-II adapter pairs with your phone over Bluetooth and streams live engine data and fault codes. An AI assistant reads them and tells you what they actually mean.',
    keywords: [
      'OBD-II',
      'OBD2 scanner app',
      'ELM327',
      'car diagnostics app',
      'check engine light',
      'diagnostic trouble codes',
      'DTC lookup',
      'live OBD data',
      'AI car diagnostics',
      'engine fault codes',
      'Bluetooth OBD adapter',
      'freeze frame data',
    ],
    ogAlt: 'Auto Area — live telemetry and an AI assistant',
  },

  nav: {
    features: 'Features',
    how: 'How it works',
    codes: 'Codes',
    faq: 'FAQ',
    download: 'App',
    cta: 'Download app',
    ctaShort: 'Download',
    openMenu: 'Open menu',
    skipToContent: 'Skip to main content',
  },

  theme: { toggle: 'Switch theme', light: 'Light', dark: 'Dark' },

  lang: { label: 'Language' },

  hero: {
    badge: 'Ask your own car',
    title: 'Your car answers, if you ask it properly',
    lead: 'Plug in an ELM327 adapter, pair your phone, and see what the engine is saying — in live numbers and in plain language.',
    note: 'iOS TestFlight and Android internal testing',
    chips: {
      rpm: 'Engine',
      coolant: 'Coolant',
      code: 'Stored code',
      battery: 'Battery',
    },
  },

  intro: {
    body: 'The app pairs with an ELM327 adapter over Bluetooth, reads live readings and fault codes straight from the ECU, and hands those same numbers to the AI assistant.',
    title: 'Live data, an answer you can act on',
  },

  story: {
    eyebrow: 'What it looks like',
    intro: ['IF', 'YOU ARE TIRED', 'OF TRAILING ROUND', 'THE GARAGES'],
    intro2: ['YOU', 'NEED', 'OUR', 'APP'],
    intro3: ['CONNECT', 'YOUR CAR', 'TO OUR', 'APP'],
    intro4: ['CHECK', "YOUR CAR'S", 'REAL', 'PROBLEMS'],
    intro5: ['NOW', 'YOUR CAR', 'IS IN', 'YOUR HANDS'],
    outro: {
      eyebrow: 'Download',
      title: 'Start today',
      body: 'Scan the code or pick a store — the app is free and pairs with an ELM327 adapter from the first minute.',
      qr: 'Scan with your phone',
      social: 'Follow us',
      shot: 'Auto Area — the main screen with live readings',
    },
    title: 'From one warning light to a plain answer',
    alt: 'Animation: a driver stuck at an open bonnet works out what is wrong with the car by reading the fault code on their phone.',
    cards: [
      { eyebrow: 'Fault', title: 'The check engine light is on', body: 'The lamp is lit and nothing says why.' },
      { eyebrow: 'Auto Area', title: 'The app is in your pocket', body: 'No booking a garage, no waiting for a slot.' },
      { eyebrow: 'ELM327', title: 'Adapter connected', body: 'Over Bluetooth, straight from the OBD-II port.' },
      { eyebrow: 'P0420', title: 'Catalyst efficiency below threshold', body: 'The assistant explains what the code means and how urgent it is.' },
      { eyebrow: 'Resolved', title: 'Fault cleared', body: 'Code erased, readings back in range.' },
    ],
    captions: [
      {
        title: 'The light is on',
        body: 'The check engine light is lit and nothing tells you why. Opening the bonnet does not help.',
      },
      {
        title: 'Out comes the phone',
        body: 'The ELM327 adapter is already in the OBD-II port, waiting over Bluetooth.',
      },
      {
        title: 'The app reads the car',
        body: 'Live readings and fault codes, straight off the ECU.',
      },
      {
        title: 'You get an answer',
        body: 'The assistant explains what the code means, how urgent it is, and what fixing it takes.',
      },
    ],
  },

  features: {
    eyebrow: 'Features',
    items: [
      {
        title: 'Live data',
        body: 'RPM, speed, coolant, fuel and voltage — once a second, with a five-minute history.',
      },
      {
        title: 'AI assistant',
        body: 'It pulls the sensor readings from the adapter itself when you ask, then answers.',
      },
      {
        title: 'Fault codes',
        body: 'Stored, pending and permanent codes — each one with a plain description.',
      },
    ],
  },

  how: {
    eyebrow: 'How it works',
    title: 'Four steps from the port to an answer',
    lead: 'The phone holds the link to the adapter itself — no laptop in the middle and no companion program to install.',
    steps: [
      {
        title: 'Plug in the adapter',
        body: 'The OBD-II port is almost always under the steering wheel. Plug in and turn the ignition on.',
      },
      {
        title: 'Pair your phone',
        body: 'BLE, Bluetooth Classic (Android) or WiFi — pick whichever your adapter speaks.',
      },
      {
        title: 'Read the car',
        body: 'Live values appear on the dashboard and the ECU memory appears on the codes screen.',
      },
      {
        title: 'Ask the assistant',
        body: 'Type the question in ordinary words. The answer is built on your numbers.',
      },
    ],
  },

  codes: {
    eyebrow: 'Trouble codes',
    title: 'A code names the symptom, not the part to replace',
    lead: 'The ECU runs self-tests while you drive. When one fails it stores a code and usually lights the check-engine lamp.',
    kinds: [
      {
        code: 'P0301',
        label: 'Stored',
        body: 'A confirmed fault — the ECU saw it often enough to be sure.',
      },
      {
        code: 'P0420',
        label: 'Pending',
        body: 'Seen once, not yet confirmed. It becomes stored if it happens again.',
      },
      {
        code: 'P0171',
        label: 'Permanent',
        body: 'Cannot be erased with a scan tool. It clears only after the ECU’s own tests pass.',
      },
    ],
    lettersTitle: 'What the letters mean',
    lettersBody:
      'P is powertrain, B body, C chassis, U network. P0xxx and P2xxx mean the same on every make; P1xxx differs per manufacturer.',
    warningTitle: 'Clearing is not repairing',
    warningBody:
      'Erasing codes wipes the ECU memory and resets its readiness monitors. The fault returns as soon as the ECU sees it again.',
  },

  faq: {
    eyebrow: 'Frequently asked',
    title: 'Before you start',
    items: [
      {
        q: 'What adapter do I need?',
        a: 'Any ELM327-compatible OBD-II adapter. The app works with Bluetooth Low Energy, Bluetooth Classic (Android only) and WiFi adapters — including the cheap clones that are by far the most common.',
      },
      {
        q: 'Is my car compatible?',
        a: 'If it has a 16-pin OBD-II port near the steering wheel, almost certainly yes. EOBD has been mandatory in Europe since 2001 for petrol and 2004 for diesel, and OBD-II in the United States since 1996.',
      },
      {
        q: 'Does it need an internet connection?',
        a: 'Not to read live values or fault codes — that all happens between the adapter and your phone. A connection is only needed for the AI assistant to answer and for sessions to sync.',
      },
      {
        q: 'Can it clear fault codes?',
        a: 'Yes, but only after you confirm it separately. The app also warns you that clearing does not fix the fault — it only wipes the ECU memory.',
      },
      {
        q: 'Does it work on iPhone?',
        a: 'Yes, with BLE and WiFi adapters. Bluetooth Classic adapters are not supported on iOS — that is a platform restriction, not an app one.',
      },
      {
        q: 'Can I try it without an adapter?',
        a: 'Yes. Demo mode runs a simulated adapter, so the dashboard, charts and assistant all work — the readings are test data and the app says so plainly.',
      },
      {
        q: 'What languages does the assistant answer in?',
        a: 'Georgian and English. Your language preference is sent with every request, so the interface and the assistant always speak the same one.',
      },
    ],
  },

  screens: {
    telemetry: 'Telemetry',
    liveData: 'Live data',
    live: 'Live',
    engine: 'Engine',
    speed: 'Speed',
    coolant: 'Coolant',
    fuel: 'Fuel',
    battery: 'Battery',
    history: '5-min history',
    alert: 'Coolant 104 °C — over the limit',
    tabs: { garage: 'Garage', data: 'Data', ai: 'AI', profile: 'Profile' },
    chat: {
      brand: 'AI · ASSISTANT',
      title: 'OBD assistant',
      user: 'Why is the engine running hot?',
      reply:
        'Coolant is at 104 °C — above the limit you set. The ECU also has P0301 stored: cylinder 1 misfire. Check the spark plug and coil first.',
      placeholder: 'Message…',
    },
    codesScreen: {
      brand: 'ECU · MEMORY',
      title: 'Trouble codes',
      found: '3 stored codes',
      items: [
        { code: 'P0301', desc: 'Cylinder 1 misfire detected', kind: 'Fault' },
        { code: 'P0420', desc: 'Catalyst efficiency below threshold', kind: 'Warning' },
        { code: 'P0171', desc: 'System too lean (bank 1)', kind: 'Permanent' },
      ],
    },
  },

  download: {
    kicker: 'Ready?',
    title: 'Download the app',
    body: 'Plug in the adapter and ask. Next time the check-engine light comes on, you will not have to guess whether it is serious.',
    note: 'Send us a note and we will add you to the next testing wave.',
  },

  store: {
    ios: { top: 'Download on the', bottom: 'App Store' },
    android: { top: 'Get it on', bottom: 'Google Play' },
    soonIos: { top: 'Coming to the', bottom: 'App Store' },
    soonAndroid: { top: 'Coming to', bottom: 'Google Play' },
  },

  footer: {
    home: 'Home',
    rights: 'All rights reserved.',
    terms: 'Privacy',
  },

  notFound: {
    title: 'Page not found',
    body: 'The address you landed on does not exist — it may have moved, or it may never have been here.',
    cta: 'Back to the homepage',
  },

  privacyPage: {
    title: 'Privacy Policy',
    description:
      'What Auto Area reads, why, where it is stored and how to delete it.',
    effective: 'Effective',
    intro:
      'This page summarises how the app handles your data. It is the binding version; the Georgian page is a translation of it.',
    sections: [
      {
        title: 'What we collect',
        body: 'Your phone number and the name you give when you register, optional vehicle details (make, model, year, VIN), the messages you send the assistant, and the OBD readings, diagnostic trouble codes and freeze-frame data read during a session. There is no password: you sign in with a code sent by SMS.',
      },
      {
        title: 'Why we need it',
        body: 'To create and sign you into an account, to give the assistant the context it needs, to keep your session history, and to improve the stability of the app. We do not build advertising profiles.',
      },
      {
        title: 'Who we share it with',
        body: 'To produce an answer, the conversation text and the readings attached to it are sent to the Anthropic API. Your phone number is sent to sender.ge, the Georgian gateway that delivers your sign-in code, and only for that. We do not sell data and we do not share it with advertising networks.',
      },
      {
        title: 'Where it is stored',
        body: 'On your phone in a local database, with tokens in the device secure store. The synced server copy is retained only for as long as your account exists.',
      },
      {
        title: 'Your rights',
        body: 'You can view, correct or delete your data at any time. Deleting your account is done from inside the app and takes every record attached to it with it.',
      },
      {
        title: 'Children',
        body: 'The app is not intended for anyone under 16 and we do not knowingly collect data from them.',
      },
    ],
    contactTitle: 'Contact',
    contactBody: 'Questions about privacy:',
    fullDoc: 'Full policy document',
  },
} satisfies Dictionary;
