import Constants from 'expo-constants';
import type { AuthResponse, LoginPayload, RegisterPayload, TokenPair } from '../types/auth';
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
  register: (payload: RegisterPayload): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: LoginPayload): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  google: (idToken: string): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    }),
};
