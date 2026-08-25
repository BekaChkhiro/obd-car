import { useEffect, useRef, useState } from 'react';

/**
 * Seconds remaining, ticking down to 0 and restarting whenever `resetKey`
 * changes.
 *
 * Used for the SMS resend gate: a disabled "Resend" with no indication of
 * when it will re-enable reads as broken, and a code that never arrives with
 * no way to ask again is the worst failure mode a code-entry screen has.
 */
export function useCountdown(seconds: number, resetKey: number): number {
  const [remaining, setRemaining] = useState(seconds);
  // Read inside the effect without retriggering it on every render — only
  // resetKey (a deliberate "restart now") should restart the interval.
  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;

  useEffect(() => {
    setRemaining(secondsRef.current);
    const id = setInterval(() => {
      setRemaining((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
    // resetKey is the intended trigger — reading `seconds` via the ref above
    // means a re-render mid-countdown does not restart the clock.
  }, [resetKey]);

  return remaining;
}
