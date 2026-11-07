// RFC 6238 time-based one-time passwords (Google Authenticator compatible),
// built on Node's crypto so no extra library is needed.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of String(text).replace(/=+$/, "").toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const generateSecret = () => base32Encode(randomBytes(20));

function hotp(secretBase32, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code =
    ((hmac[offset] & 127) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}
export const totpAt = (secret, time = Date.now()) =>
  hotp(secret, Math.floor(time / 1000 / STEP_SECONDS));

/**
 * Returns the matched time step (a number) if `code` is valid within +/- `window`
 * steps, otherwise null. Callers store the step to refuse the same code twice.
 */
export function verifyTotp(secret, code, { time = Date.now(), window = 1, after = 0 } = {}) {
  const clean = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = Math.floor(time / 1000 / STEP_SECONDS);
  for (let drift = -window; drift <= window; drift += 1) {
    const step = current + drift;
    if (step <= after) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

export const otpauthUrl = ({ secret, account, issuer }) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

/* Secrets are encrypted at rest with a key derived from JWT_SECRET (AES-256-GCM). */
const key = () =>
  createHash("sha256").update(`portal-totp:${process.env.JWT_SECRET}`).digest();
export function encrypt(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}
export function decrypt(payload) {
  const [iv, tag, data] = String(payload).split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/* One-time recovery codes, e.g. 7K3QD-92XMA */
export function makeRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(7)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
export const hashRecovery = (code) =>
  createHash("sha256")
    .update(String(code).replace(/[\s-]/g, "").toUpperCase())
    .digest("hex");

/* Emailed one-time code used to re-enrol a lost authenticator. Stored only as a keyed hash. */
export const makeOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const hashOtp = (otp) =>
  createHmac("sha256", key()).update(`reset:${String(otp).replace(/\s+/g, "")}`).digest("hex");
export const sameHash = (a, b) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
