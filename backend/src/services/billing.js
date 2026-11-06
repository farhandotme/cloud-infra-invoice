// Billing helpers: month ranges and the random-but-exact yearly split.

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MAX_MONTHS = 60;

export function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** 'YYYY-MM' -> { year, month (1-12) } or null */
export function parseMonth(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || '').trim());
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}
export const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
export const monthLabel = key => { const m = parseMonth(key); return m ? `${MONTH_NAMES[m.month - 1]} ${m.year}` : key; };

/** Inclusive list of 'YYYY-MM' keys from start to end. */
export function monthRange(startKey, endKey) {
  const start = parseMonth(startKey);
  const end = parseMonth(endKey);
  if (!start || !end) throw httpError('Choose a valid start and end month.');
  const startIndex = start.year * 12 + start.month - 1;
  const endIndex = end.year * 12 + end.month - 1;
  if (endIndex < startIndex) throw httpError('The end month must be the same as or after the start month.');
  const count = endIndex - startIndex + 1;
  if (count > MAX_MONTHS) throw httpError(`A range can cover at most ${MAX_MONTHS} months.`);
  return Array.from({ length: count }, (_, i) => {
    const index = startIndex + i;
    return monthKey(Math.floor(index / 12), (index % 12) + 1);
  });
}

/** Add whole months to a 'YYYY-MM' key. */
export function addMonths(key, offset) {
  const m = parseMonth(key);
  const index = m.year * 12 + m.month - 1 + offset;
  return monthKey(Math.floor(index / 12), (index % 12) + 1);
}

/** Date strings are built by hand (no Date parsing) so time zones can never shift a day. */
export function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Split `total` across `count` months with natural-looking variation.
 * Each month is within roughly +/- `variance` of the average, and the parts
 * add up to EXACTLY the total (integer rupees if the total is a whole number,
 * otherwise integer paise).
 */
export function splitAmount(total, count, { variance = 0.25, rng = Math.random } = {}) {
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount <= 0) throw httpError('Enter an amount greater than zero.');
  if (!Number.isInteger(count) || count < 1) throw httpError('At least one month is required.');
  const wholeRupees = Number.isInteger(amount);
  const scale = wholeRupees ? 1 : 100;
  const units = Math.round(amount * scale);
  if (units < count) throw httpError('The amount is too small to divide across that many months.');
  if (count === 1) return [units / scale];

  const weights = Array.from({ length: count }, () => 1 + (rng() * 2 - 1) * variance);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map(w => Math.max(1, Math.floor(units * w / weightSum)));
  let diff = units - parts.reduce((a, b) => a + b, 0);
  // Spread the rounding difference one unit at a time over random months.
  while (diff !== 0) {
    const i = Math.floor(rng() * count);
    if (diff > 0) { parts[i] += 1; diff -= 1; }
    else if (parts[i] > 1) { parts[i] -= 1; diff += 1; }
  }
  return parts.map(p => p / scale);
}

export const toUnits = value => Math.round(Number(value) * 100);

/**
 * Optional "Mindboxx service charge": pct% of each month's amount, added on top.
 * Charges are rounded cumulatively (in paise) so they add up to exactly pct% of the total.
 * Returns [{ base, charge, total }] in the same order as `amounts`.
 */
export function withServiceCharge(amounts, pct) {
  const rate = Number(pct);
  if (!rate) return amounts.map(base => ({ base, charge: 0, total: base }));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw httpError('The service charge must be between 0 and 100 percent.');
  let cumBase = 0, cumCharge = 0;
  return amounts.map(base => {
    cumBase += toUnits(base);
    const target = Math.round(cumBase * rate / 100);
    const charge = (target - cumCharge) / 100;
    cumCharge = target;
    return { base, charge, total: Math.round((toUnits(base) + toUnits(charge))) / 100 };
  });
}
