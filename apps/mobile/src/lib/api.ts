import Constants from 'expo-constants';
import type {
  AuthResponse,
  RequestCodePayload,
  RequestCodeResponse,
  TokenPair,
  VerifyCodePayload,
} from '../types/auth';
import { clearTokens, loadTokens, saveTokens } from './token-store';

const BASE_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:8000';

let accessToken: string | null = null;
let refreshToken: string | null = null;

// Queue of resolve callbacks waiting for a token refresh in progress.
let refreshingPromise: Promise<string | null> | null = null;

export async function hydrateTokens(): Promise<void> {
  const stored = await loadTokens();
  accessToken = stored.access;
  refreshToken = stored.refresh;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Refresh this many seconds before the token actually expires. */
const TOKEN_EXPIRY_SKEW_SECONDS = 60;

/** `exp` out of a JWT, or null when it can't be read. */
function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp: unknown = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/**
 * An access token that is still valid, refreshing it first when it is not.
 *
 * `getAccessToken()` returns whatever is in memory, which is enough for REST:
 * a 401 there triggers a refresh and a retry. A WebSocket has no such second
 * chance — the handshake carries the token in the URL and a stale one is
 * rejected outright — so the socket layer has to start from a fresh token.
 *
 * Returns null when there is nothing left to refresh with; the caller should
 * treat that as "signed out" rather than retrying.
 */
export async function getFreshAccessToken(forceRefresh = false): Promise<string | null> {
  const expiry = accessToken ? tokenExpiry(accessToken) : null;
  const stillValid =
    accessToken !== null &&
    expiry !== null &&
    expiry - TOKEN_EXPIRY_SKEW_SECONDS > Date.now() / 1000;

  if (!forceRefresh && stillValid) return accessToken;
  if (!refreshToken) return stillValid ? accessToken : null;

  // Share one refresh between every caller — the chat socket and an in-flight
  // request can ask at the same moment, and the backend rotates refresh
  // tokens, so a second concurrent call would present an already-spent one.
  if (!refreshingPromise) {
    refreshingPromise = refreshAccessToken().finally(() => {
      refreshingPromise = null;
    });
  }
  return refreshingPromise;
}

export function setInMemoryTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
}

export function clearInMemoryTokens(): void {
  accessToken = null;
  refreshToken = null;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshToken) return null;

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    await clearTokens();
    clearInMemoryTokens();
    return null;
  }

  const data: TokenPair = await res.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token;
  await saveTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && refreshToken) {
    // Deduplicate concurrent refreshes — all in-flight requests share one refresh.
    if (!refreshingPromise) {
      refreshingPromise = refreshAccessToken().finally(() => {
        refreshingPromise = null;
      });
    }
    const newToken = await refreshingPromise;

    if (!newToken) {
      throw new ApiError(401, 'session expired');
    }

    headers['Authorization'] = `Bearer ${newToken}`;
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore parse failure
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const authApi = {
  requestCode: (payload: RequestCodePayload): Promise<RequestCodeResponse> =>
    apiFetch<RequestCodeResponse>('/auth/request-code', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyCode: (payload: VerifyCodePayload): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  me: () => apiFetch<import('../types/auth').UserPublic>('/auth/me'),

  updateProfile: (
    payload: import('../types/auth').ProfileUpdate,
  ): Promise<import('../types/auth').UserPublic> =>
    apiFetch<import('../types/auth').UserPublic>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteAccount: (): Promise<void> =>
    apiFetch<void>('/auth/me', { method: 'DELETE' }),
};
