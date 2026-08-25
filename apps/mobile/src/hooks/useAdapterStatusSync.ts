import { useEffect } from 'react';
import { useBleStore } from '../store/ble';
import { notifyAdapterStatus } from '../store/chat';

/**
 * Push the OBD-II link state to the backend whenever it changes.
 *
 * The assistant's system prompt is rebuilt from this on every turn, so a stale
 * value is the difference between "I can't read the car, the scanner isn't
 * connected" and a confidently wrong answer. Sent as its own frame rather than
 * by reconnecting the socket, which would drop the in-flight turn.
 *
 * Mount alongside `useToolExecutor` on the screen that owns the chat session.
 */
export function useAdapterStatusSync(): void {
  const phase = useBleStore((s) => s.connectionPhase);
  const adapterKind = useBleStore((s) => s.adapterKind);
  const supportedPids = useBleStore((s) => s.supportedPids);
  const vin = useBleStore((s) => s.vin);

  useEffect(() => {
    notifyAdapterStatus();
    // supportedPids and the VIN both arrive asynchronously after the link
    // reaches 'ready', so each is a dependency in its own right — not just a
    // consequence of `phase`. Until the VIN lands the backend has no make, and
    // the assistant will (correctly) decline to define brand-specific codes.
    // `adapterKind` is what tells the backend the readings are simulated, and
    // it can flip without `phase` moving (a real dongle swapped for the demo
    // mock), so a stale one leaves the assistant reporting generated numbers
    // as the user's car — the exact failure this path exists to prevent.
  }, [phase, adapterKind, supportedPids, vin]);
}
