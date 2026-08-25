import { create } from 'zustand';
import type { AuthResponse, RequestCodeResponse, UserPublic } from '../types/auth';
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
  /**
   * Sends the SMS. `names` is only passed from the register screen — the
   * server caches them against the code so verifying it can create the
   * account in the same round trip, rather than needing a second request.
   */
  requestCode: (
    phone: string,
    names?: { firstName?: string; lastName?: string },
  ) => Promise<RequestCodeResponse>;
  verifyCode: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfile: (payload: {
    firstName?: string;
    lastName?: string;
    locale?: string;
  }) => Promise<void>;
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

  requestCode: async (phone, names) => {
    set({ isLoading: true });
    try {
      return await authApi.requestCode({
        phone,
        first_name: names?.firstName ?? null,
        last_name: names?.lastName ?? null,
      });
    } catch (err) {
      throw err instanceof ApiError ? err : new ApiError(0, String(err));
    } finally {
      set({ isLoading: false });
    }
  },

  verifyCode: async (phone, code) => {
    set({ isLoading: true });
    try {
      const res = await authApi.verifyCode({ phone, code });
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

  updateProfile: async ({ firstName, lastName, locale }) => {
    // Send only what changed: the endpoint leaves omitted fields alone, so a
    // rename cannot silently reset the locale.
    const user = await authApi.updateProfile({
      ...(firstName !== undefined ? { first_name: firstName } : {}),
      ...(lastName !== undefined ? { last_name: lastName } : {}),
      ...(locale !== undefined ? { locale } : {}),
    });
    set({ user });
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
      phone: '+995555000000',
      first_name: 'E2E',
      last_name: 'Tester',
      locale: 'en',
      created_at: new Date().toISOString(),
    };
    set({ user, isLoading: false });
  },
}));
