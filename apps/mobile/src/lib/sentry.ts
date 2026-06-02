// Sentry disabled — native integration crashes on iOS 18 with Hermes new arch.
// TODO: re-enable when @sentry/react-native fixes Hermes compat.

export function initSentry(): void {}

export const Sentry = {
  wrap: <T>(component: T): T => component,
  captureException: (_e: unknown) => {},
  captureMessage: (_m: string) => {},
  addBreadcrumb: (_c: unknown) => {},
  setUser: (_u: unknown) => {},
  setContext: (_k: string, _v: unknown) => {},
  setTag: (_k: string, _v: string) => {},
  withScope: (_fn: (scope: unknown) => void) => {},
};
