// Billing helpers: month ranges and the random-but-exact yearly split.

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const MAX_MONTHS = 60;

export function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** 'YYYY-MM' -> { year, month (1-12) } or null */
export function parseMonth(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || "").trim());
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}
export const monthKey = (year, month) =>
  `${year}-${String(month).padStart(2, "0")}`;
export const monthLabel = (key) => {
  const m = parseMonth(key);
  return m ? `${MONTH_NAMES[m.month - 1]} ${m.year}` : key;
};

/** Inclusive list of 'YYYY-MM' keys from start to end. */
export function monthRange(startKey, endKey) {
  const start = parseMonth(startKey);
  const end = parseMonth(endKey);
  if (!start || !end) throw httpError("Choose a valid start and end month.");
  const startIndex = start.year * 12 + start.month - 1;
  const endIndex = end.year * 12 + end.month - 1;
  if (endIndex < startIndex)
    throw httpError(
      "The end month must be the same as or after the start month.",
    );
  const count = endIndex - startIndex + 1;
  if (count > MAX_MONTHS)
    throw httpError(`A range can cover at most ${MAX_MONTHS} months.`);
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
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Split `total` across `count` months with natural-looking variation.
 * Each month is within roughly +/- `variance` of the average, and the parts
 * add up to EXACTLY the total (integer rupees if the total is a whole number,
 * otherwise integer paise).
 */
export function splitAmount(
  total,
  count,
  { variance = 0.25, rng = Math.random } = {},
) {
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount <= 0)
    throw httpError("Enter an amount greater than zero.");
  if (!Number.isInteger(count) || count < 1)
    throw httpError("At least one month is required.");
  const wholeRupees = Number.isInteger(amount);
  const scale = wholeRupees ? 1 : 100;
  const units = Math.round(amount * scale);
  if (units < count)
    throw httpError(
      "The amount is too small to divide across that many months.",
    );
  if (count === 1) return [units / scale];

  const weights = Array.from(
    { length: count },
    () => 1 + (rng() * 2 - 1) * variance,
  );
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) =>
    Math.max(1, Math.floor((units * w) / weightSum)),
  );
  let diff = units - parts.reduce((a, b) => a + b, 0);
  // Spread the rounding difference one unit at a time over random months.
  while (diff !== 0) {
    const i = Math.floor(rng() * count);
    if (diff > 0) {
      parts[i] += 1;
      diff -= 1;
    } else if (parts[i] > 1) {
      parts[i] -= 1;
      diff += 1;
    }
  }
  return parts.map((p) => p / scale);
}

export const toUnits = (value) => Math.round(Number(value) * 100);

/**
 * Optional "Mindboxx service charge": pct% of each month's amount, added on top.
 * Charges are rounded cumulatively (in paise) so they add up to exactly pct% of the total.
 * Returns [{ base, charge, total }] in the same order as `amounts`.
 */
export function withServiceCharge(amounts, pct) {
  const rate = Number(pct);
  if (!rate) return amounts.map((base) => ({ base, charge: 0, total: base }));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100)
    throw httpError("The service charge must be between 0 and 100 percent.");
  let cumBase = 0,
    cumCharge = 0;
  return amounts.map((base) => {
    cumBase += toUnits(base);
    const target = Math.round((cumBase * rate) / 100);
    const charge = (target - cumCharge) / 100;
    cumCharge = target;
    return {
      base,
      charge,
      total: Math.round(toUnits(base) + toUnits(charge)) / 100,
    };
  });
}

/* ── GST ─────────────────────────────────────────────────────────────── */

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];
export const DEFAULT_SAC = "998315"; // hosting & IT infrastructure provisioning services

export const GST_STATES = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  10: "Bihar",
  11: "Sikkim",
  12: "Arunachal Pradesh",
  13: "Nagaland",
  14: "Manipur",
  15: "Mizoram",
  16: "Tripura",
  17: "Meghalaya",
  18: "Assam",
  19: "West Bengal",
  20: "Jharkhand",
  21: "Odisha",
  22: "Chhattisgarh",
  23: "Madhya Pradesh",
  24: "Gujarat",
  26: "Dadra & Nagar Haveli and Daman & Diu",
  27: "Maharashtra",
  29: "Karnataka",
  30: "Goa",
  31: "Lakshadweep",
  32: "Kerala",
  33: "Tamil Nadu",
  34: "Puducherry",
  35: "Andaman & Nicobar Islands",
  36: "Telangana",
  37: "Andhra Pradesh",
  38: "Ladakh",
  97: "Other Territory",
};

const GSTIN_RE = /^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const normalizeGstin = (value) =>
  String(value || "")
    .replace(/\s+/g, "")
    .toUpperCase();

/** Checks format, a known state code and the mod-36 check character. */
export function isValidGstin(value) {
  const gstin = normalizeGstin(value);
  const match = GSTIN_RE.exec(gstin);
  if (!match || !GST_STATES[match[1]]) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = GSTIN_CHARS.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}

export const gstinState = (value) => {
  const code = normalizeGstin(value).slice(0, 2);
  return GST_STATES[code] ? { code, name: GST_STATES[code] } : null;
};

/**
 * Works out whether GST is CGST+SGST (same state) or IGST (different state).
 * `choice` is "auto" | "intra" | "inter". Auto compares the state codes of the
 * two GSTINs; when the client has no valid GSTIN it falls back to intra-state.
 */
export function resolveSupplyType(choice, sellerGstin, buyerGstin) {
  if (choice === "intra" || choice === "inter") return choice;
  const seller = gstinState(sellerGstin);
  const buyer = isValidGstin(buyerGstin) ? gstinState(buyerGstin) : null;
  if (seller && buyer) return seller.code === buyer.code ? "intra" : "inter";
  return "intra";
}

/** Validates the admin's GST choices for one invoice run. Returns null when GST is off. */
export function parseGstOptions(input, settings = {}, client = {}) {
  if (!input?.enabled) return null;
  if (!settings.gstRegistered || !isValidGstin(settings.gstin))
    throw httpError(
      "Add your company's GSTIN under Settings → GST details before adding GST to invoices.",
    );
  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 40)
    throw httpError("Enter a GST rate between 0.01 and 40 percent.");
  const choice = ["auto", "intra", "inter"].includes(input.supplyType)
    ? input.supplyType
    : "auto";
  const sac = String(input.sac || settings.gstSac || DEFAULT_SAC)
    .replace(/\s+/g, "")
    .slice(0, 8);
  if (!/^\d{4,8}$/.test(sac))
    throw httpError("The SAC / HSN code must be 4 to 8 digits.");
  const sellerGstin = normalizeGstin(settings.gstin);
  const buyerGstin = normalizeGstin(client.gstin);
  const supplyType = resolveSupplyType(choice, sellerGstin, buyerGstin);
  const placeCode = isValidGstin(buyerGstin)
    ? gstinState(buyerGstin)
    : gstinState(sellerGstin);
  return {
    rate,
    supplyType,
    supplyChoice: choice,
    sac,
    sellerGstin,
    buyerGstin: buyerGstin || "",
    placeOfSupply: placeCode
      ? `${placeCode.name} (${placeCode.code})`
      : "",
  };
}

/**
 * GST on one invoice's taxable value (paise maths so nothing drifts).
 * Same state: CGST + SGST each at half the rate. Other state: IGST at the full rate.
 */
export function gstOn(taxable, { rate, supplyType }) {
  const paise = toUnits(taxable);
  const out = { cgst: 0, sgst: 0, igst: 0 };
  if (supplyType === "inter") {
    out.igst = Math.round((paise * rate) / 100) / 100;
  } else {
    const half = Math.round((paise * rate) / 200) / 100;
    out.cgst = half;
    out.sgst = half;
  }
  const gst = Math.round(toUnits(out.cgst) + toUnits(out.sgst) + toUnits(out.igst)) / 100;
  return { ...out, gst, total: Math.round(paise + toUnits(gst)) / 100 };
}

/* ── Future-invoice locking ──────────────────────────────────────────────
 * A generated invoice stays "Scheduled" (locked: no PDF for admin or client,
 * amount hidden from the client) through the last day of its billing month,
 * because the real bill follows usage. It unlocks on the 1st of the next month.
 */
export const billingTimeZone = () => process.env.BILLING_TZ || "Asia/Kolkata";

/** Current 'YYYY-MM' in the billing time zone. */
export function currentMonthKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: billingTimeZone(),
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}`;
}
export const isLockedPeriod = (periodMonth, nowKey = currentMonthKey()) =>
  Boolean(parseMonth(periodMonth)) && periodMonth >= nowKey;
export const isLockedInvoice = (invoice) =>
  invoice?.data?.generated === true && isLockedPeriod(invoice.data.periodMonth);
/** First day the invoice can be downloaded, 'YYYY-MM-DD'. */
export const unlockDate = (periodMonth) => `${addMonths(periodMonth, 1)}-01`;

/**
 * Dates for an invoice that is generated BEFORE its month has ended: issued the day it unlocks (the 1st of the next
 * month) and due the same day, so a November invoice reads "01 Dec 2026" for both.
 */
export const scheduledDates = (periodMonth) => {
  const issueDate = unlockDate(periodMonth);
  return { issueDate, dueDate: issueDate };
};
/**
 * True when an invoice still carries dates that earlier versions set automatically, i.e. nobody changed them by hand:
 *  - issued on the 1st of its own month, due 15 days later, or
 *  - issued on the unlock date, due 15 days after that.
 */
export const hasAutoDates = (data = {}) => {
  if (!parseMonth(data.periodMonth)) return false;
  const first = `${data.periodMonth}-01`;
  const unlock = unlockDate(data.periodMonth);
  return (
    (data.issueDate === first && data.dueDate === addDays(first, 15)) ||
    (data.issueDate === unlock && data.dueDate === addDays(unlock, 15))
  );
};
