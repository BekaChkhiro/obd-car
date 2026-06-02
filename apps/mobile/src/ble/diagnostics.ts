// In-memory store for the most recent protocol-negotiation attempt. Lets the
// Pair screen surface the raw adapter responses when a connection fails so the
// user (or a developer over their shoulder) can see exactly what the ELM327
// returned for each probe — invaluable for diagnosing parser/timing issues on
// non-standard adapters.

export interface ProbeAttempt {
  protocol: number;
  command: string;
  response: string | null;
  error: string | null;
  durationMs: number;
}

let lastTrace: ProbeAttempt[] = [];
let lastUpdatedAt: number | null = null;

export function resetProbeTrace(): void {
  lastTrace = [];
  lastUpdatedAt = null;
}

export function recordProbeAttempt(entry: ProbeAttempt): void {
  lastTrace.push(entry);
  lastUpdatedAt = Date.now();
}

export function getProbeTrace(): { trace: ProbeAttempt[]; updatedAt: number | null } {
  return { trace: [...lastTrace], updatedAt: lastUpdatedAt };
}

/** Compact one-line summary of a single probe — used inside error messages. */
export function summarizeAttempt(a: ProbeAttempt): string {
  const tag = `ATSP${a.protocol}`;
  if (a.response !== null) {
    const r = a.response.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    return `${tag} → ${r || '(empty)'}${a.error ? ` ✗ ${a.error}` : ' ✓'}`;
  }
  return `${tag} ✗ ${a.error ?? 'no response'} (${a.durationMs}ms)`;
}

export function summarizeTrace(): string {
  if (lastTrace.length === 0) return 'No probe attempts captured.';
  return lastTrace.map(summarizeAttempt).join('\n');
}
