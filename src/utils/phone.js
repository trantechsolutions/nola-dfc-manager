// Formats US phone numbers as (000) 000-0000.
//
// NON-DESTRUCTIVE: the canonical format is only imposed when the value maps
// cleanly to 10 significant digits (or 11 with a leading country code "1").
// Anything else — partial numbers, extensions, international, vanity numbers —
// is returned unchanged. This keeps formatPhone idempotent and safe to run on
// every save (including the delete-and-reinsert guardian path) and on display.

// Strip everything but digits.
export function phoneDigits(value) {
  return (value || '').replace(/\D/g, '');
}

// The 10 significant digits if this is a clean US number, otherwise null.
function usTenDigits(value) {
  const d = phoneDigits(value);
  if (d.length === 10) return d;
  if (d.length === 11 && d[0] === '1') return d.slice(1);
  return null;
}

// Display / storage formatter. Idempotent; passes non-conforming input through
// byte-for-byte.
export function formatPhone(value) {
  if (value == null) return value;
  // Any letter signals a value we must not reshape: vanity numbers
  // (1-800-FLOWERS) or extensions ("555-1234 x203", "ext 5"). Pass through so a
  // coincidental 10-digit total isn't misformatted.
  if (/[a-z]/i.test(value)) return value;
  const ten = usTenDigits(value);
  if (!ten) return value;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

// Progressive formatter for live typing. Builds the mask as digits are entered
// and ignores anything past 10 digits. Intended for personal-mobile fields.
export function formatPhoneInput(value) {
  const d = phoneDigits(value).slice(0, 10);
  if (d.length === 0) return '';
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// tel: href target — always raw digits, safe for dialing.
export function phoneHref(value) {
  return `tel:${phoneDigits(value)}`;
}
