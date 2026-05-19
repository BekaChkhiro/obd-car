import { create } from 'zustand';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'onboarding' });

interface OnboardingState {
  hasOnboarded: boolean;
  markOnboarded: () => void;
  resetOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>()((set) => ({
  hasOnboarded: storage.getBoolean('hasOnboarded') ?? false,

  markOnboarded: () => {
    storage.set('hasOnboarded', true);
    set({ hasOnboarded: true });
  },

  resetOnboarding: () => {
    storage.remove('hasOnboarded');
    set({ hasOnboarded: false });
  },
}));
