import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

const dsn: string | undefined = Constants.expoConfig?.extra?.sentryDsn as string | undefined;

const _SCRUBBED_KEYS = new Set(['content', 'messages', 'body', 'text']);

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = _SCRUBBED_KEYS.has(k) ? '[scrubbed]' : v;
  }
  return out;
}

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  const scrubbed = { ...crumb };
  if (scrubbed.data && typeof scrubbed.data === 'object') {
    scrubbed.data = scrubObject(scrubbed.data as Record<string, unknown>);
  }
  if (scrubbed.category === 'chat' || scrubbed.category === 'ws.message') {
    scrubbed.message = '[scrubbed]';
  }
  return scrubbed;
}

function beforeSend(event: ErrorEvent): ErrorEvent | null {
  if (event.request?.data && typeof event.request.data === 'object') {
    event.request.data = scrubObject(event.request.data as Record<string, unknown>);
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }
  return event;
}

export function initSentry(): void {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.1,
    beforeSend,
  });
}

export { Sentry };
