import { create } from 'zustand';
import { createMMKV } from 'react-native-mmkv';
import i18n from '../lib/i18n';

export type Locale = 'en' | 'ka';

const storage = createMMKV({ id: 'locale' });

function loadLocale(): Locale {
  const stored = storage.getString('locale');
  return stored === 'en' || stored === 'ka' ? stored : 'en';
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()((set) => ({
  locale: loadLocale(),

  setLocale: (locale) => {
    storage.set('locale', locale);
    void i18n.changeLanguage(locale);
    set({ locale });
  },
}));
