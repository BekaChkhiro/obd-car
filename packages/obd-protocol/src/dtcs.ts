export type DtcCategory = 'P' | 'B' | 'C' | 'U';

export interface Dtc {
  code: string;
  category: DtcCategory;
  number: number;
  isPending: boolean;
  isPermanent: boolean;
}

// OBD-II byte encoding: upper 2 bits → category, next 2 bits → subcategory, lower 12 bits → number
const BYTE_CATEGORIES: readonly DtcCategory[] = ['P', 'C', 'B', 'U'];

export function dtcFromBytes(byteA: number, byteB: number): Dtc {
  const categoryIndex = (byteA >> 6) & 0x3;
  const category = BYTE_CATEGORIES[categoryIndex] ?? 'P';
  const subcategory = (byteA >> 4) & 0x3;
  const num = ((byteA & 0x0f) << 8) | byteB;
  const code = `${category}${subcategory}${num.toString(16).padStart(3, '0').toUpperCase()}`;
  return { code, category, number: num, isPending: false, isPermanent: false };
}

const DTC_CODE_RE = /^([PBCU])(\d{4})$/i;

export function parseDtcCode(raw: string): Dtc | null {
  const match = DTC_CODE_RE.exec(raw.trim().toUpperCase());
  if (!match) return null;
  const [, letter, numStr] = match;
  const category = (letter as DtcCategory | undefined) ?? 'P';
  return {
    code: raw.trim().toUpperCase(),
    category,
    number: parseInt(numStr!, 10),
    isPending: false,
    isPermanent: false,
  };
}
