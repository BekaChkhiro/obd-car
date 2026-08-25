// Georgian mobile numbers: +995 followed by 9 digits, the first of which is
// always 5. The country code is fixed chrome around every phone field in the
// app, so these helpers only ever deal with those 9 digits.

/** Keeps only digits and caps at 9 — trims an accidentally-pasted "995" or "+995" prefix. */
export function sanitizePhoneDigits(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.length > 9 && digits.startsWith('995')) {
    digits = digits.slice(3);
  }
  return digits.slice(0, 9);
}

/** Groups raw digits into the 3-3-3 shape Georgian numbers are usually written in. */
export function formatGeorgianPhone(digits: string): string {
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean).join(' ');
}

/** E.164 for the API. */
export function toE164(digits: string): string {
  return `+995${digits}`;
}

export function isValidGeorgianMobile(digits: string): boolean {
  return /^5\d{8}$/.test(digits);
}

/** The stored E.164 form (`+995555123456`) back into the display shape. */
export function formatE164Display(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('995') ? digits.slice(3) : digits;
  return `+995 ${formatGeorgianPhone(local)}`;
}
