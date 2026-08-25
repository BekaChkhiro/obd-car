import { describe, it, expect } from 'vitest';
import {
  dtcSubsystem,
  getDtcDescription,
  lookupDtc,
  normalizeMake,
  KNOWN_DTC_MAKES,
} from './dtc-descriptions';
import { isSaeGenericCode } from './dtcs';
import { GENERIC_DTC_DESCRIPTIONS } from './generated/dtc-generic';
import { MAKE_DTC_DESCRIPTIONS } from './generated/dtc-by-make';

describe('isSaeGenericCode', () => {
  it('classifies by code number, not by what we happen to have stored', () => {
    // A standardised code we hold no description for is still generic.
    expect(isSaeGenericCode('P2999')).toBe(true);
    expect(GENERIC_DTC_DESCRIPTIONS.P2999).toBeUndefined();
  });

  it('follows the SAE ranges', () => {
    expect(isSaeGenericCode('P0420')).toBe(true);
    expect(isSaeGenericCode('P2195')).toBe(true);
    expect(isSaeGenericCode('U0100')).toBe(true);
    expect(isSaeGenericCode('B0001')).toBe(true);
    expect(isSaeGenericCode('C0035')).toBe(true);

    expect(isSaeGenericCode('P1133')).toBe(false);
    expect(isSaeGenericCode('U1000')).toBe(false);
    expect(isSaeGenericCode('B1200')).toBe(false);
    expect(isSaeGenericCode('C1201')).toBe(false);
  });

  it('splits the P3 range where SAE takes it back', () => {
    expect(isSaeGenericCode('P3000')).toBe(false);
    expect(isSaeGenericCode('P3399')).toBe(false);
    expect(isSaeGenericCode('P3400')).toBe(true);
    expect(isSaeGenericCode('P3999')).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isSaeGenericCode('')).toBe(false);
    expect(isSaeGenericCode('P042')).toBe(false);
    expect(isSaeGenericCode('X0420')).toBe(false);
  });
});

describe('generated tables', () => {
  it('keeps every manufacturer-range code out of the generic table', () => {
    // The vendored p/b/c/u files group by letter, not by whether the code is
    // standardised — they carry Ford-flavoured P1xxx entries. One of those in
    // the generic table is a wrong answer served to every other make.
    const leaked = Object.keys(GENERIC_DTC_DESCRIPTIONS).filter((c) => !isSaeGenericCode(c));
    expect(leaked).toEqual([]);
  });

  it('keeps every generic code out of the per-make tables', () => {
    const leaked: string[] = [];
    for (const [make, table] of Object.entries(MAKE_DTC_DESCRIPTIONS)) {
      for (const code of Object.keys(table)) {
        if (isSaeGenericCode(code)) leaked.push(`${make}:${code}`);
      }
    }
    expect(leaked).toEqual([]);
  });

  it('covers the standard ranges broadly enough to be worth having', () => {
    expect(Object.keys(GENERIC_DTC_DESCRIPTIONS).length).toBeGreaterThan(8000);
    expect(KNOWN_DTC_MAKES.length).toBeGreaterThan(25);
  });
});

describe('lookupDtc', () => {
  it('answers generic codes without knowing the vehicle', () => {
    const r = lookupDtc('P0420');
    expect(r.source).toBe('generic');
    expect(r.description).toBe('Catalyst System Efficiency Below Threshold Bank 1');
    expect(r.needsMake).toBe(false);
  });

  it('refuses a manufacturer-specific code when the make is unknown', () => {
    // The failure this guards against: the assistant confidently quoting one
    // brand's meaning at the owner of another.
    const r = lookupDtc('P1133');
    expect(r.description).toBeUndefined();
    expect(r.source).toBe('none');
    expect(r.needsMake).toBe(true);
    expect(r.subsystem).toBe('powertrain');
  });

  it('gives genuinely different answers per make for the same code', () => {
    const ford = lookupDtc('P1133', { make: 'Ford' });
    const bmw = lookupDtc('P1133', { make: 'BMW' });
    const toyota = lookupDtc('P1133', { make: 'Toyota' });

    expect(ford.description).toBe('Bank 1 Fuel Control Shifted Lean');
    expect(bmw.description).toBe('O2 Sensor Heater Control Circuit Bank 2 Sensor 1');
    expect(toyota.description).toBe('Air/Fuel Sensor Circuit Response Bank 1 Sensor 1');
    expect(new Set([ford.description, bmw.description, toyota.description]).size).toBe(3);
    for (const r of [ford, bmw, toyota]) expect(r.source).toBe('make');
  });

  it('never borrows another make’s meaning when the make has no such code', () => {
    // Honda has a table, and no P1133 in it. Returning GM's text here would be
    // the original bug wearing a lookup table.
    const r = lookupDtc('P1133', { make: 'Honda' });
    expect(r.description).toBeUndefined();
    expect(r.source).toBe('none');
    expect(r.needsMake).toBe(false);
  });

  it('treats an unknown make as unknown, not as a missing code', () => {
    const r = lookupDtc('P1133', { make: 'Hyundai' });
    expect(r.needsMake).toBe(true);
    expect(normalizeMake('Hyundai')).toBeUndefined();
  });

  it('ignores the make for generic codes', () => {
    expect(lookupDtc('P0420', { make: 'Ford' }).description).toBe(
      lookupDtc('P0420').description,
    );
  });
});

describe('normalizeMake', () => {
  it('maps the spellings a VIN decoder and a user actually produce', () => {
    expect(normalizeMake('Chevrolet')).toBe('CHEVY');
    expect(normalizeMake('MERCEDES-BENZ')).toBe('MERCEDES');
    expect(normalizeMake('vw')).toBe('VOLKSWAGEN');
    expect(normalizeMake('Scion')).toBe('TOYOTA');
    expect(normalizeMake(' toyota ')).toBe('TOYOTA');
  });

  it('returns undefined rather than a near-miss', () => {
    expect(normalizeMake(null)).toBeUndefined();
    expect(normalizeMake('')).toBeUndefined();
    expect(normalizeMake('Tesla')).toBeUndefined();
  });
});

describe('dtcSubsystem', () => {
  it('names the system even when no description exists', () => {
    expect(dtcSubsystem('P0301')).toBe('ignition-misfire');
    expect(dtcSubsystem('P0201')).toBe('injector-circuit');
    expect(dtcSubsystem('P0700')).toBe('transmission');
    expect(dtcSubsystem('P0A0F')).toBe('hybrid-propulsion');
    expect(dtcSubsystem('U0100')).toBe('network');
    expect(dtcSubsystem('B0001')).toBe('body');
    expect(dtcSubsystem('C0035')).toBe('chassis');
    expect(dtcSubsystem('nonsense')).toBe('unknown');
  });
});

describe('getDtcDescription', () => {
  it('keeps the hand-written Georgian', () => {
    expect(getDtcDescription('P0300', 'ka')).toBe('შემთხვევითი ან მრავალი ცილინდრის ანთების გაცდენა');
  });

  it('falls back to English where no translation exists', () => {
    const en = getDtcDescription('P2195', 'en');
    expect(en).toBeTruthy();
    expect(getDtcDescription('P2195', 'ka')).toBe(en);
  });

  it('stays undefined for a manufacturer code with no make', () => {
    expect(getDtcDescription('P1133', 'en')).toBeUndefined();
    expect(getDtcDescription('P1133', 'en', 'Ford')).toBe('Bank 1 Fuel Control Shifted Lean');
  });
});
