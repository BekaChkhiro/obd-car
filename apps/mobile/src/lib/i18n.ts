import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { createMMKV } from 'react-native-mmkv';

import en from '../locales/en.json';
import ka from '../locales/ka.json';

const _storage = createMMKV({ id: 'locale' });
const stored = _storage.getString('locale');

/**
 * The language to open in before anyone has chosen one.
 *
 * Falling back to English meant every first run in the launch market started
 * in the wrong language, and stayed there until the user found the switch in
 * their profile — on a screen written in a language they may not read.
 *
 * `Intl` is read rather than a native module: Hermes ships full ICU, so the
 * device's language is already here without another dependency. It is wrapped
 * because a JS engine built without ICU would throw, and a missing locale is
 * not worth failing to start over.
 */
function deviceLanguage(): 'en' | 'ka' {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale;
    return tag.toLowerCase().startsWith('ka') ? 'ka' : 'en';
  } catch {
    return 'en';
  }
}

const lng: string = stored === 'en' || stored === 'ka' ? stored : deviceLanguage();

void i18n.use(initReactI18next).init({
  lng,
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
    ka: { translation: ka },
  },
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
