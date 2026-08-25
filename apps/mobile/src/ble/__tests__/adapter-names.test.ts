import { looksLikeObdAdapter, rankScannedDevices } from '../adapter-names';

describe('looksLikeObdAdapter', () => {
  it('recognises the names ELM327 clones actually ship under', () => {
    for (const name of [
      'OBDII',
      'OBD-II',
      'obd2',
      'ELM327-BLE',
      'Vgate iCar Pro',
      'VEEPEAK OBDCheck',
      'Viecar 4.0',
      'V-LINK',
      'vLinker MC+',
      'KONNWEI KW902',
      'OBDLink MX+',
    ]) {
      expect(looksLikeObdAdapter(name)).toBe(true);
    }
  });

  it('ignores separators so one pattern covers a family', () => {
    // "V-LINK", "V LINK" and "VLINK" are the same product with three labels.
    expect(looksLikeObdAdapter('V LINK')).toBe(true);
    expect(looksLikeObdAdapter('V_LINK')).toBe(true);
  });

  it('does not claim unrelated peripherals', () => {
    for (const name of ['AirPods Pro', 'Mi Band 5', 'JBL Flip', 'Tile', '']) {
      expect(looksLikeObdAdapter(name)).toBe(false);
    }
    expect(looksLikeObdAdapter(null)).toBe(false);
    expect(looksLikeObdAdapter(undefined)).toBe(false);
  });
});

describe('rankScannedDevices', () => {
  it('floats likely adapters above everything else', () => {
    const ranked = rankScannedDevices([
      { name: 'AirPods', rssi: -40 },
      { name: 'OBDII', rssi: -80 },
    ]);
    expect(ranked[0]!.name).toBe('OBDII');
  });

  it('orders each group by proximity', () => {
    const ranked = rankScannedDevices([
      { name: 'OBDII far', rssi: -90 },
      { name: 'OBDII near', rssi: -45 },
      { name: 'Speaker', rssi: -50 },
    ]);
    expect(ranked.map((d) => d.name)).toEqual(['OBDII near', 'OBDII far', 'Speaker']);
  });

  it('sorts a missing reading last rather than as a strong signal', () => {
    // rssi of 0 would beat every real (negative) measurement if treated as a number.
    const ranked = rankScannedDevices([
      { name: 'Unknown signal', rssi: null },
      { name: 'Weak but real', rssi: -95 },
    ]);
    expect(ranked[0]!.name).toBe('Weak but real');
  });

  it('does not mutate the input', () => {
    const input = [{ name: 'B', rssi: -80 }, { name: 'OBD', rssi: -80 }];
    rankScannedDevices(input);
    expect(input[0]!.name).toBe('B');
  });
});
