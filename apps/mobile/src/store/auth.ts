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
  /**
   * Stub-sign-in for E2E tests. Bypasses the backend by injecting a fake
   * user and tokens directly into the store. Callers should gate this on
   * isE2E() — production code paths must never invoke it.
   */
  e2eSignIn: () => void;
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
    try {
      const user = await authApi.me();
      set({ user, isHydrated: true });
    } catch {
      clearInMemoryTokens();
      await clearTokens();
      set({ user: null, isHydrated: true });
    }
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

  e2eSignIn: () => {
    setInMemoryTokens('e2e-access-token', 'e2e-refresh-token');
    const user: UserPublic = {
      id: 1,
      email: 'e2e@example.com',
      locale: 'en',
      created_at: new Date().toISOString(),
    };
    set({ user, isLoading: false });
  },
}));
