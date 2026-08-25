import type { useTranslation } from 'react-i18next';
import { ApiError } from './api';

type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * Turns a request-code/verify-code failure into copy a person can act on.
 *
 * The raw ApiError message is a server-side detail string (or a network
 * error's message) — never something to put on screen. Every status the
 * contract defines gets its own line; anything else falls back to the
 * generic error rather than leaking the raw text.
 */
export function describeAuthError(err: unknown, t: Translate): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return t('auth.codeInvalid');
      case 422:
        return t('auth.phoneInvalid');
      case 429:
        return t('auth.rateLimited');
      // Both mean "this number has no account": 404 from request-code, which
      // says so before sending, and 409 from verify-code, which is the older
      // path now only reachable if the account went away mid-flow.
      case 404:
      case 409:
        return t('auth.registrationRequired');
      case 502:
        return t('auth.smsFailed');
      default:
        return t('auth.genericError');
    }
  }
  return t('auth.genericError');
}
