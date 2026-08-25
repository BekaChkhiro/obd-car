/**
 * Recognising an ELM327 adapter from its advertised BLE name.
 *
 * There is no reliable protocol-level way to do this during a scan. The right
 * signal would be the GATT service UUID, but the cheap clones this app exists
 * for mostly do not put it in the advertisement packet — it only shows up
 * after connecting, which is too late to filter a list.
 *
 * So the name is all there is, and the name is not standardised: the same
 * chipset ships as OBDII, OBD2, ELM327, Vgate, VEEPEAK, Viecar, Konnwei,
 * V-LINK and a dozen vendor brands. That is why this ranks rather than
 * filters — a hidden adapter is a user who cannot connect at all, which is far
 * worse than a list with a few extra headphones in it.
 */

/** Substrings that mark a device as very likely an OBD-II adapter. */
const ADAPTER_PATTERNS: readonly string[] = [
  'obd',
  'elm327',
  'elm 327',
  'vgate',
  'veepeak',
  'viecar',
  'vlink',
  'v-link',
  'vlinker',
  'konnwei',
  'icar',
  'carista',
  'obdlink',
  'scantool',
  'kiwi',
  'lelink',
  'panlong',
  'torque',
];

/** True when the advertised name matches a known adapter family. */
export function looksLikeObdAdapter(name: string | null | undefined): boolean {
  if (!name) return false;
  // Strip separators so "V-LINK", "V LINK" and "VLINK" all match one pattern.
  const normalised = name.toLowerCase().replace(/[\s_-]/g, '');
  return ADAPTER_PATTERNS.some((p) => normalised.includes(p.replace(/[\s_-]/g, '')));
}

/**
 * Order a scan result so likely adapters come first, each group sorted by
 * signal strength — the nearest adapter is almost always the one plugged into
 * the car in front of the user.
 */
export function rankScannedDevices<T extends { name?: string | null; rssi?: number | null }>(
  devices: readonly T[],
): T[] {
  return [...devices].sort((a, b) => {
    const aIsAdapter = looksLikeObdAdapter(a.name);
    const bIsAdapter = looksLikeObdAdapter(b.name);
    if (aIsAdapter !== bIsAdapter) return aIsAdapter ? -1 : 1;
    // Higher RSSI is closer. Missing readings sort last rather than as zero,
    // which would place them above every real (negative) measurement.
    return (b.rssi ?? -999) - (a.rssi ?? -999);
  });
}
