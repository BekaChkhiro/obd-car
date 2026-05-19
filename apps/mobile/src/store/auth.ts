import { create } from 'zustand';
import type { AuthResponse, UserPublic } from '../types/auth';
import {
  ApiError,
  authApi,
  clearInMemoryTokens,
  hydrateTokens,
  setInMemoryTokens,
} from '../lib/api';
import { clearTokens, saveTokens } from '../lib/token-store';
import { clearAllLocalData } from '../lib/clear-local-data';

interface AuthState {
  user: UserPublic | null;
  isLoading: boolean;
  isHydrated: boolean;

  hydrate: () => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  googleSignIn: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

function applyAuthResponse(set: (partial: Partial<AuthState>) => void, res: AuthResponse): void {
  setInMemoryTokens(res.tokens.access_token, res.tokens.refresh_token);
  saveTokens(res.tokens.access_token, res.tokens.refresh_token).catch(() => {});
  set({ user: res.user, isLoading: false });
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isHydrated: false,

  hydrate: async () => {
    await hydrateTokens();
    set({ isHydrated: true });
  },

  register: async (email, password) => {
    set({ isLoading: true });
    try {
      const res = await authApi.register({ email, password });
      applyAuthResponse(set, res);
    } catch (err) {
      set({ isLoading: false });
      throw err instanceof ApiError ? err : new ApiError(0, String(err));
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const res = await authApi.login({ email, password });
      applyAuthResponse(set, res);
    } catch (err) {
      set({ isLoading: false });
      throw err instanceof ApiError ? err : new ApiError(0, String(err));
    }
  },

  googleSignIn: async (idToken) => {
    set({ isLoading: true });
    try {
      const res = await authApi.google(idToken);
      applyAuthResponse(set, res);
    } catch (err) {
      set({ isLoading: false });
      throw err instanceof ApiError ? err : new ApiError(0, String(err));
    }
  },

  logout: async () => {
    clearInMemoryTokens();
    await clearTokens();
    set({ user: null, isLoading: false });
  },

  deleteAccount: async () => {
    set({ isLoading: true });
    try {
      await authApi.deleteAccount();
    } finally {
      clearInMemoryTokens();
      await clearTokens();
      await clearAllLocalData();
      set({ user: null, isLoading: false });
    }
  },
}));
