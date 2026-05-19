# Maestro E2E flows

End-to-end UI tests for the Expo mobile app, driven by
[Maestro](https://maestro.mobile.dev/).

## Coverage

`happy-path.yaml` exercises the T6.4 acceptance flow:
**mock adapter → chat → DTC clear**.

1. App launches in E2E mode (`EXPO_PUBLIC_E2E=1`).
2. Bypass sign-in via the `E2E: Skip sign-in` button.
3. Navigate to the pair screen and connect the in-process mock ELM327
   adapter (no real BLE required).
4. Open the chat screen and tap the `E2E: Clear DTCs (mock)` button —
   this routes through the same `DtcReader.clearDtcs()` path the real
   chat tool executor uses.
5. Assert the status banner shows `DTCs cleared`.

The flow is hermetic: it runs against the bundled mock adapter and does
not require the backend service or a paired OBD-II dongle.

## Running locally

```bash
# 1. Install Maestro (one-time)
curl -sL https://get.maestro.mobile.dev | bash

# 2. Build a dev / preview client with E2E mode enabled
cd apps/mobile
EXPO_PUBLIC_E2E=1 pnpm android   # or `pnpm ios`

# 3. Run the flow
cd ../..
maestro test .maestro/happy-path.yaml
```

For headless / CI runs, see `.github/workflows/mobile-e2e.yml`.

## Adding flows

- Drop a new `.yaml` file in this directory.
- Add `testID="..."` props to any UI elements you want to query.
- Reference the testID in the flow with `tapOn: { id: "..." }` or
  `assertVisible: { id: "..." }` — these are stable across translations
  and styling changes, unlike text matchers.

## E2E hooks reference

The app exposes E2E-only affordances behind `isE2E()`
(`apps/mobile/src/lib/e2e.ts`):

| Surface       | Hook                                                  |
|---------------|-------------------------------------------------------|
| Sign-in       | `e2e-skip-sign-in` button → `authStore.e2eSignIn()`   |
| Pair screen   | `e2e-connect-mock-adapter` → `injectAdapter(mock)`    |
| Chat screen   | `e2e-clear-dtcs` → `adapter.dtc.clearDtcs()` direct   |

These render only when `EXPO_PUBLIC_E2E=1` at build/start time so they
are absent from production binaries.
