import { apiFetch } from '../lib/api';
import type { PullResponse, PushRequest, PushResponse } from './types';

export const syncApi = {
  push: (body: PushRequest): Promise<PushResponse> =>
    apiFetch<PushResponse>('/sync/push', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  pull: (since: string | null): Promise<PullResponse> => {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    return apiFetch<PullResponse>(`/sync/pull${qs}`, { method: 'GET' });
  },
};
