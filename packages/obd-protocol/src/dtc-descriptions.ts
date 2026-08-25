// DTC descriptions: lookup over the generated tables, plus the hand-written
// Georgian we maintain ourselves.
//
// The English definitions live in `generated/` and are imported from the
// vendored SAE/manufacturer data — see scripts/import-dtc-database.ts. This
// file holds only the logic and the translations.
//
// The one rule that matters here: a manufacturer-specific code is never
// answered without a make. P1133 is "Bank 1 Fuel Control Shifted Lean" on a
// Ford and "O2 Sensor Heater Control Circuit Bank 2 Sensor 1" on a BMW. There
// is no useful middle answer between those, so when the make is unknown the
// honest return is `undefined` and the caller asks.

import { isSaeGenericCode } from './dtcs';
import { GENERIC_DTC_DESCRIPTIONS } from './generated/dtc-generic';
import { MAKE_DTC_DESCRIPTIONS } from './generated/dtc-by-make';

export type DtcLocale = 'en' | 'ka';

/** Where a description came from — callers surface this, it is not decoration. */
export type DtcDescriptionSource = 'make' | 'generic' | 'none';

export type DtcSubsystem =
  | 'fuel-air-metering'
  | 'injector-circuit'
  | 'ignition-misfire'
  | 'auxiliary-emissions'
  | 'speed-idle-auxiliary-inputs'
  | 'computer-output'
  | 'transmission'
  | 'hybrid-propulsion'
  | 'powertrain'
  | 'body'
  | 'chassis'
  | 'network'
  | 'unknown';

export interface DtcLookup {
  code: string;
  /** Undefined when nothing authoritative is known — never a guess. */
  description: string | undefined;
  source: DtcDescriptionSource;
  /** The make whose table answered, when `source` is 'make'. */
  make: string | undefined;
  isGeneric: boolean;
  /**
   * True when the code needs a make to be answerable and we do not have one.
   * The caller should ask for the vehicle rather than present a guess.
   */
  needsMake: boolean;
  subsystem: DtcSubsystem;
}

// Georgian for the codes a driver actually meets. Everything else falls back to
// English: translating 15,000 entries by machine would degrade the one thing
// this table is for — being right — and the assistant translates in its reply
// anyway. A translation is not a fact, so it carries no fabrication risk.
const KA_DESCRIPTIONS: Readonly<Record<string, string>> = {
  B0001: "უსაფრთხოების ბალიშის გაშლის კონტროლი",
  C0035: "მარცხენა წინა თვლის სიჩქარის სენსორი — წრე",
  C0040: "მარჯვენა წინა თვლის სიჩქარის სენსორი — წრე",
  C0045: "მარცხენა უკანა თვლის სიჩქარის სენსორი — წრე",
  C0050: "მარჯვენა უკანა თვლის სიჩქარის სენსორი — წრე",
  P0100: "ჰაერის მასის სენსორის წრის გაუმართაობა",
  P0101: "ჰაერის მასის სენსორი — მუშაობის დიაპაზონი",
  P0102: "ჰაერის მასის სენსორი — დაბალი სიგნალი",
  P0103: "ჰაერის მასის სენსორი — მაღალი სიგნალი",
  P0104: "ჰაერის მასის სენსორი — წყვეტილი სიგნალი",
  P0110: "სასუნთქი ჰაერის ტემპერატურის სენსორი — გაუმართაობა",
  P0111: "სასუნთქი ჰაერის ტემპ. სენსორი — დიაპაზონი",
  P0112: "სასუნთქი ჰაერის ტემპ. სენსორი — დაბალი სიგნალი",
  P0113: "სასუნთქი ჰაერის ტემპ. სენსორი — მაღალი სიგნალი",
  P0120: "გასარქვავის პოზიციის სენსორი A — წრის გაუმართაობა",
  P0121: "გასარქვავის პოზიციის სენსორი — მუშაობის დიაპაზონი",
  P0122: "გასარქვავის სენსორი — დაბალი სიგნალი",
  P0123: "გასარქვავის სენსორი — მაღალი სიგნალი",
  P0125: "საგრილო სითხე არ არის გათბობილი — საწვავის კონტროლი შეუძლებელია",
  P0128: "სათბობელი თერმოსტატი — სარეგულაციო ტემპ. ქვემოთ",
  P0130: "ჟანგბადის სენსორი (ბანკი 1, სენსორი 1) — გაუმართაობა",
  P0131: "ჟანგბადის სენსორი B1S1 — დაბალი ძაბვა",
  P0132: "ჟანგბადის სენსორი B1S1 — მაღალი ძაბვა",
  P0133: "ჟანგბადის სენსორი B1S1 — ნელი რეაქცია",
  P0134: "ჟანგბადის სენსორი B1S1 — არ მუშაობს",
  P0135: "ჟანგბადის სენსორი B1S1 — გათბობის წრე",
  P0136: "ჟანგბადის სენსორი (ბანკი 1, სენსორი 2) — გაუმართაობა",
  P0137: "ჟანგბადის სენსორი B1S2 — დაბალი ძაბვა",
  P0138: "ჟანგბადის სენსორი B1S2 — მაღალი ძაბვა",
  P0140: "ჟანგბადის სენსორი B1S2 — არ მუშაობს",
  P0141: "ჟანგბადის სენსორი B1S2 — გათბობის წრე",
  P0150: "ჟანგბადის სენსორი (ბანკი 2, სენსორი 1) — გაუმართაობა",
  P0151: "ჟანგბადის სენსორი B2S1 — დაბალი ძაბვა",
  P0152: "ჟანგბადის სენსორი B2S1 — მაღალი ძაბვა",
  P0155: "ჟანგბადის სენსორი B2S1 — გათბობის წრე",
  P0171: "ნარევი ძალიან გაღარიბებულია (ბანკი 1)",
  P0172: "ნარევი ძალიან გამდიდრებულია (ბანკი 1)",
  P0174: "ნარევი ძალიან გაღარიბებულია (ბანკი 2)",
  P0175: "ნარევი ძალიან გამდიდრებულია (ბანკი 2)",
  P0200: "ინჟექტორის წრის გაუმართაობა",
  P0201: "ინჟექტორი — 1-ლი ცილინდრი",
  P0202: "ინჟექტორი — მე-2 ცილინდრი",
  P0203: "ინჟექტორი — მე-3 ცილინდრი",
  P0204: "ინჟექტორი — მე-4 ცილინდრი",
  P0205: "ინჟექტორი — მე-5 ცილინდრი",
  P0206: "ინჟექტორი — მე-6 ცილინდრი",
  P0207: "ინჟექტორი — მე-7 ცილინდრი",
  P0208: "ინჟექტორი — მე-8 ცილინდრი",
  P0300: "შემთხვევითი ან მრავალი ცილინდრის ანთების გაცდენა",
  P0301: "1-ლი ცილინდრის ანთების გაცდენა",
  P0302: "მე-2 ცილინდრის ანთების გაცდენა",
  P0303: "მე-3 ცილინდრის ანთების გაცდენა",
  P0304: "მე-4 ცილინდრის ანთების გაცდენა",
  P0305: "მე-5 ცილინდრის ანთების გაცდენა",
  P0306: "მე-6 ცილინდრის ანთების გაცდენა",
  P0307: "მე-7 ცილინდრის ანთების გაცდენა",
  P0308: "მე-8 ცილინდრის ანთების გაცდენა",
  P0320: "ანთების/დისტრიბუტორის სიჩქარის სენსორის წრე",
  P0325: "დარტყმის სენსორი 1 — წრის გაუმართაობა (ბანკი 1)",
  P0326: "დარტყმის სენსორი 1 — მუშაობის დიაპაზონი",
  P0330: "დარტყმის სენსორი 2 — წრის გაუმართაობა (ბანკი 2)",
  P0335: "კოლოფკის ბრუნვის სენსორი A — წრის გაუმართაობა",
  P0336: "კოლოფკის ბრუნვის სენსორი A — მუშაობის დიაპაზონი",
  P0340: "გამომრთველი ლილვის სენსორი A — წრის გაუმართაობა",
  P0341: "გამომრთველი ლილვის სენსორი A — მუშაობის დიაპაზონი",
  P0345: "გამომრთველი ლილვის სენსორი A — გაუმართაობა (ბანკი 2)",
  P0400: "გამონაბოლქვის რეცირკულაციის (EGR) ნაკადის გაუმართაობა",
  P0401: "EGR — ნაკადი არასაკმარისია",
  P0402: "EGR — ნაკადი ზედმეტია",
  P0411: "დამხმარე ჰაერის ინჟექცია — არასწორი ნაკადი",
  P0420: "კატალიზური სისტემის ეფექტიანობა დაბალია (ბანკი 1)",
  P0421: "კატალიზატორის გათბობის ეფექტიანობა დაბალია (ბანკი 1)",
  P0430: "კატალიზური სისტემის ეფექტიანობა დაბალია (ბანკი 2)",
  P0431: "კატალიზატორის გათბობის ეფექტიანობა დაბალია (ბანკი 2)",
  P0440: "აორთქლებითი ემისიის კონტროლის სისტემა — გაუმართაობა",
  P0441: "EVAP სისტემა — არასწორი გაწმენდის ნაკადი",
  P0442: "EVAP სისტემა — პატარა გაჟონვა",
  P0443: "EVAP კონდენსატორის გაწმენდის კონტროლის წრე",
  P0446: "EVAP სისტემის სავენტილაციო კონტროლის წრე",
  P0455: "EVAP სისტემა — დიდი გაჟონვა",
  P0456: "EVAP სისტემა — ძალიან პატარა გაჟონვა",
  P0500: "სატრანსპორტო საშუალების სიჩქარის სენსორი — გაუმართაობა",
  P0501: "სიჩქარის სენსორი — მუშაობის დიაპაზონი",
  P0505: "ნეიტრალური სვლის კონტროლის სისტემა — გაუმართაობა",
  P0506: "ნეიტრალური სვლა — ბრ./წთ. დაბალია",
  P0507: "ნეიტრალური სვლა — ბრ./წთ. მაღალია",
  P0560: "სისტემის ძაბვა — გაუმართაობა",
  P0562: "სისტემის ძაბვა — დაბალია",
  P0563: "სისტემის ძაბვა — მაღალია",
  P0600: "სერიული საკომუნიკაციო კავშირი — გაუმართაობა",
  P0601: "PCM — მეხსიერების შეცდომა",
  P0602: "PCM — პროგრამირების შეცდომა",
  P0603: "PCM — KAM მეხსიერების შეცდომა",
  P0604: "PCM — RAM-ის შეცდომა",
  P0606: "PCM — პროცესორის გაუმართაობა",
  P0700: "გადაცემათა კოლოფის მართვის სისტემა — გაუმართაობა",
  P0705: "გადაცემათა კოლოფის დიაპაზონის სენსორი — წრე",
  P0711: "გადაცემათა კოლოფის ზეთის ტემპ. სენსორი — წრე",
  P0720: "გამომავალი სიჩქარის სენსორი — წრის გაუმართაობა",
  P0730: "გადაცემათა კოლოფი — მცდარი გადაცემის თანაფარდობა",
  P0740: "ჰიდროტრანსფორმატორის კავშირის წრე — გაუმართაობა",
  P0750: "გადართვის სოლენოიდი A — გაუმართაობა",
  P0755: "გადართვის სოლენოიდი B — გაუმართაობა",
  U0001: "CAN კომუნიკაციის სწრაფი სალტე",
  U0100: "ECM/PCM-თან კომუნიკაცია დაიკარგა",
  U0155: "საბორტო პანელთან კომუნიკაცია დაიკარგა",
};

/** Makes with their own table, as keys of MAKE_DTC_DESCRIPTIONS. */
export const KNOWN_DTC_MAKES: readonly string[] = Object.keys(MAKE_DTC_DESCRIPTIONS).sort();

// NHTSA's VIN decoder and the user both spell makes differently from our table
// keys. Anything not listed falls through to a normalised exact match.
const MAKE_ALIASES: Readonly<Record<string, string>> = {
  CHEVROLET: 'CHEVY',
  MERCEDESBENZ: 'MERCEDES',
  MERCEDESBENZAG: 'MERCEDES',
  VW: 'VOLKSWAGEN',
  GENERALMOTORS: 'GM',
  GMCTRUCK: 'GMC',
  // Scion was Toyota's badge and shares its diagnostic tables.
  SCION: 'TOYOTA',
  // Vauxhall/Opel are GM-era siblings; their P-code tables track GM's.
  VAUXHALL: 'GM',
};

/**
 * Map a free-form make ("Chevrolet", "MERCEDES-BENZ", "vw") onto a table key.
 * Returns undefined when we hold no table for it — callers must treat that as
 * "unknown make", not as "no such code".
 */
export function normalizeMake(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const squashed = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (!squashed) return undefined;
  const key = MAKE_ALIASES[squashed] ?? squashed;
  return key in MAKE_DTC_DESCRIPTIONS ? key : undefined;
}

/**
 * The vehicle system a code belongs to, derived from the number alone.
 *
 * Useful precisely when no description is available: "we do not know this
 * code, but it is a transmission code" is a real answer, and it cannot be
 * wrong the way an invented definition can.
 */
export function dtcSubsystem(code: string): DtcSubsystem {
  const upper = code.trim().toUpperCase();
  if (!/^[PBCU][0-9A-F]{4}$/.test(upper)) return 'unknown';

  switch (upper[0]) {
    case 'B':
      return 'body';
    case 'C':
      return 'chassis';
    case 'U':
      return 'network';
  }

  // Powertrain. Only the P0xxx block has a segmentation stable enough to state.
  if (upper[1] !== '0') return 'powertrain';

  const group = upper[2]!;
  switch (group) {
    case '0':
    case '1':
      return 'fuel-air-metering';
    case '2':
      return 'injector-circuit';
    case '3':
      return 'ignition-misfire';
    case '4':
      return 'auxiliary-emissions';
    case '5':
      return 'speed-idle-auxiliary-inputs';
    case '6':
      return 'computer-output';
    case '7':
    case '8':
    case '9':
      return 'transmission';
    default:
      // P0A-P0F: hybrid and electric propulsion.
      return 'hybrid-propulsion';
  }
}

/**
 * Resolve one code, optionally for a known make.
 *
 * Generic codes answer without a make. Manufacturer-specific codes answer only
 * from that make's table — we never fall back to another make's meaning, and
 * never to a "typical" one.
 */
export function lookupDtc(
  code: string,
  options: { make?: string | null; locale?: DtcLocale } = {},
): DtcLookup {
  const upper = code.trim().toUpperCase();
  const { make: rawMake, locale = 'en' } = options;
  const isGeneric = isSaeGenericCode(upper);
  const subsystem = dtcSubsystem(upper);
  const make = normalizeMake(rawMake);

  const localise = (english: string | undefined): string | undefined => {
    if (english === undefined) return undefined;
    return locale === 'ka' ? (KA_DESCRIPTIONS[upper] ?? english) : english;
  };

  if (isGeneric) {
    const english = GENERIC_DTC_DESCRIPTIONS[upper];
    return {
      code: upper,
      description: localise(english),
      source: english === undefined ? 'none' : 'generic',
      make: undefined,
      isGeneric: true,
      needsMake: false,
      subsystem,
    };
  }

  if (make === undefined) {
    return {
      code: upper,
      description: undefined,
      source: 'none',
      make: undefined,
      isGeneric: false,
      needsMake: true,
      subsystem,
    };
  }

  const english = MAKE_DTC_DESCRIPTIONS[make]?.[upper];
  return {
    code: upper,
    description: localise(english),
    source: english === undefined ? 'none' : 'make',
    make: english === undefined ? undefined : make,
    isGeneric: false,
    // We hold a table for this make and it has no such code — asking for the
    // make again would not help.
    needsMake: false,
    subsystem,
  };
}

/**
 * Description for a code, or undefined when none is known.
 *
 * Pass `make` whenever it is known: without it, manufacturer-specific codes
 * return undefined by design rather than a plausible wrong answer.
 */
export function getDtcDescription(
  code: string,
  locale: DtcLocale,
  make?: string | null,
): string | undefined {
  return lookupDtc(code, { locale, make }).description;
}
