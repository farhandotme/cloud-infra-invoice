// GST helpers shared by the admin screens (mirrors backend/src/services/billing.js).
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
export const GST_RATES = [5, 12, 18, 28];
export const DEFAULT_SAC = "998315";

const RE = /^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const cleanGstin = (v) =>
  String(v || "")
    .replace(/\s+/g, "")
    .toUpperCase();

export function isValidGstin(value) {
  const g = cleanGstin(value);
  const m = RE.exec(g);
  if (!m || !GST_STATES[m[1]]) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const p = CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === g[14];
}
export const gstinState = (v) => {
  const code = cleanGstin(v).slice(0, 2);
  return GST_STATES[code] ? { code, name: GST_STATES[code] } : null;
};
