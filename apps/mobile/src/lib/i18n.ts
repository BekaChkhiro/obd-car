import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { createMMKV } from 'react-native-mmkv';

import en from '../locales/en.json';
import ka from '../locales/ka.json';

const _storage = createMMKV({ id: 'locale' });
const stored = _storage.getString('locale');
const lng: string = stored === 'en' || stored === 'ka' ? stored : 'en';

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
