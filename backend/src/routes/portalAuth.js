import { Router } from "express";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import rateLimit from "express-rate-limit";
import { createHash, timingSafeEqual } from "crypto";
import PortalAuth from "../models/PortalAuth.js";
import { passwordVersion, requirePortal } from "../middleware/portalAuth.js";
import {
  decrypt,
  encrypt,
  generateSecret,
  hashOtp,
  hashRecovery,
  makeOtp,
  makeRecoveryCodes,
  otpauthUrl,
  sameHash,
  verifyTotp,
} from "../services/totp.js";
import { mailConfigured, sendMail } from "../services/mailer.js";

// Sign-in to the customer infrastructure portal.
//   1. email + password  -> must equal ADMIN_EMAIL / ADMIN_PASSWORD from .env
//   2. Google Authenticator code (first time: scan a QR code to enrol)
//   Lost the phone? A 6-digit code is emailed to ADMIN_EMAIL; entering it lets
//   the user scan a new QR code. The old authenticator keeps working until the
//   new one is confirmed.
// Completely separate from the /admin sign-in and its tokens.
const router = Router();
const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many attempts. Please wait 15 minutes and try again." },
  });
const loginLimiter = limiter(10);
const codeLimiter = limiter(15);
const resetLimiter = limiter(5);
const RESET_MINUTES = 10;
const RESET_RESEND_SECONDS = 60;
const RESET_MAX_ATTEMPTS = 5;

const digest = (v) => createHash("sha256").update(String(v)).digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));
const issuer = () => process.env.PORTAL_2FA_ISSUER || "CloudLedger";
const bad = (res, status, message) => res.status(status).json({ message });

const temp = (purpose, minutes, extra = {}) =>
  jwt.sign({ purpose, pv: passwordVersion(), ...extra }, process.env.JWT_SECRET, {
    expiresIn: `${minutes}m`,
  });
function readTemp(token, purpose) {
  try {
    const p = jwt.verify(String(token || ""), process.env.JWT_SECRET);
    return p.purpose === purpose && p.pv === passwordVersion() ? p : null;
  } catch {
    return null;
  }
}
const session = () => {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return {
    token: jwt.sign(
      { sub: "portal", email, purpose: "portal", pv: passwordVersion() },
      process.env.JWT_SECRET,
      { expiresIn: `${Number(process.env.PORTAL_SESSION_HOURS) || 8}h` },
    ),
    user: { email },
  };
};
const getDoc = async () =>
  (await PortalAuth.findOne({ key: "portal" })) ||
  (await PortalAuth.create({ key: "portal" }));

// Step 1: email + password from the .env file.
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const wantEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const wantPassword = String(process.env.ADMIN_PASSWORD || "");
    if (!wantEmail || !wantPassword)
      return bad(res, 503, "Portal sign-in is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD on the server.");
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const okEmail = same(email, wantEmail);
    const okPassword = same(password, wantPassword);
    if (!(okEmail && okPassword))
      return bad(res, 401, "Email or password is incorrect.");
    const doc = await getDoc();
    if (doc.enrolled)
      return res.json({ step: "totp", challengeToken: temp("portal-2fa", 5) });
    res.json({ step: "setup", setupToken: temp("portal-setup", 15) });
  } catch (error) {
    next(error);
  }
});

// Step 2a (first sign-in only): create a secret and return the QR code.
router.post("/setup", codeLimiter, async (req, res, next) => {
  try {
    const setup = readTemp(req.body?.setupToken, "portal-setup");
    if (!setup) return bad(res, 401, "Setup session expired. Sign in again.");
    const doc = await getDoc();
    if (doc.enrolled && !setup.rotate)
      return bad(res, 409, "Google Authenticator is already set up for this portal.");
    const secret = generateSecret();
    doc.pendingSecret = encrypt(secret);
    await doc.save();
    const account = String(process.env.ADMIN_EMAIL).trim().toLowerCase();
    const url = otpauthUrl({ secret, account, issuer: issuer() });
    res.json({
      secret,
      otpauthUrl: url,
      qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }),
    });
  } catch (error) {
    next(error);
  }
});

// Step 2b: the first code proves the app is set up; returns recovery codes.
router.post("/confirm", codeLimiter, async (req, res, next) => {
  try {
    const setup = readTemp(req.body?.setupToken, "portal-setup");
    if (!setup) return bad(res, 401, "Setup session expired. Sign in again.");
    const doc = await getDoc();
    if (doc.enrolled && !setup.rotate)
      return bad(res, 409, "Google Authenticator is already set up for this portal.");
    if (!doc.pendingSecret)
      return bad(res, 400, "Scan the QR code first.");
    const step = verifyTotp(decrypt(doc.pendingSecret), req.body?.code);
    if (step === null)
      return bad(res, 401, "That code is not correct. Check the code in your app and try again.");
    const recoveryCodes = makeRecoveryCodes();
    doc.secret = doc.pendingSecret;
    doc.pendingSecret = "";
    doc.enrolled = true;
    doc.enrolledAt = new Date();
    doc.lastUsedStep = step;
    doc.recoveryHashes = recoveryCodes.map(hashRecovery);
    await doc.save();
    res.json({ ...session(), recoveryCodes });
  } catch (error) {
    next(error);
  }
});

// Step 2 (every later sign-in): authenticator code, or a one-time recovery code.
router.post("/verify", codeLimiter, async (req, res, next) => {
  try {
    if (!readTemp(req.body?.challengeToken, "portal-2fa"))
      return bad(res, 401, "Sign-in expired. Enter your email and password again.");
    const doc = await getDoc();
    if (!doc.enrolled) return bad(res, 409, "Authenticator is not set up yet.");

    if (req.body?.recoveryCode) {
      const hash = hashRecovery(req.body.recoveryCode);
      if (!doc.recoveryHashes.includes(hash))
        return bad(res, 401, "That recovery code is not valid or was already used.");
      doc.recoveryHashes = doc.recoveryHashes.filter((h) => h !== hash);
      await doc.save();
      return res.json({ ...session(), recoveryCodesLeft: doc.recoveryHashes.length });
    }
    const step = verifyTotp(decrypt(doc.secret), req.body?.code, {
      after: doc.lastUsedStep,
    });
    if (step === null)
      return bad(res, 401, "That code is not correct or was already used. Wait for the next code and try again.");
    doc.lastUsedStep = step;
    await doc.save();
    res.json(session());
  } catch (error) {
    next(error);
  }
});

// Lost authenticator, step 1: email a 6-digit code to ADMIN_EMAIL.
// Needs the password step to have passed (challengeToken).
router.post("/reset/request", resetLimiter, async (req, res, next) => {
  try {
    if (!readTemp(req.body?.challengeToken, "portal-2fa"))
      return bad(res, 401, "Sign-in expired. Enter your email and password again.");
    const dev = process.env.NODE_ENV !== "production";
    if (!mailConfigured() && !dev)
      return bad(res, 503, "Email reset is not set up on this server. Ask the administrator to reset it.");
    const doc = await getDoc();
    if (!doc.enrolled) return bad(res, 409, "Authenticator is not set up yet.");
    const wait = doc.resetSentAt
      ? Math.ceil((doc.resetSentAt.getTime() + RESET_RESEND_SECONDS * 1000 - Date.now()) / 1000)
      : 0;
    if (wait > 0)
      return bad(res, 429, `Please wait ${wait} seconds before requesting another code.`);

    const to = String(process.env.ADMIN_EMAIL).trim().toLowerCase();
    const otp = makeOtp();
    doc.resetHash = hashOtp(otp);
    doc.resetExpires = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
    doc.resetAttempts = 0;
    doc.resetSentAt = new Date();
    await doc.save();
    try {
      if (mailConfigured())
        await sendMail({
          to,
          subject: `${issuer()} authenticator reset code`,
          text: `Your ${issuer()} verification code is ${otp}.\n\nIt expires in ${RESET_MINUTES} minutes. Use it to set up a new authenticator app.\nIf you did not ask for this, ignore this email and consider changing ADMIN_PASSWORD.`,
        });
      else console.log(`[dev] portal reset code for ${to}: ${otp}`);
    } catch (error) {
      console.error("Could not send portal reset email:", error.message);
      doc.resetHash = "";
      doc.resetSentAt = undefined;
      await doc.save();
      return bad(res, 502, "The email could not be sent. Please try again later.");
    }
    const [name, domain] = to.split("@");
    res.json({
      resetToken: temp("portal-reset", RESET_MINUTES),
      sentTo: `${name[0]}***@${domain}`,
      resendAfter: RESET_RESEND_SECONDS,
    });
  } catch (error) {
    next(error);
  }
});

// Lost authenticator, step 2: check the emailed code, then allow a new QR setup.
router.post("/reset/confirm", codeLimiter, async (req, res, next) => {
  try {
    if (!readTemp(req.body?.resetToken, "portal-reset"))
      return bad(res, 401, "Reset session expired. Start again.");
    // Count the try first and atomically so parallel guesses can't beat the limit.
    const doc = await PortalAuth.findOneAndUpdate(
      { key: "portal" },
      { $inc: { resetAttempts: 1 } },
      { new: true },
    );
    if (!doc?.resetHash || !doc.resetExpires || doc.resetExpires < new Date())
      return bad(res, 400, "That code has expired. Request a new one.");
    if (doc.resetAttempts > RESET_MAX_ATTEMPTS) {
      doc.resetHash = "";
      await doc.save();
      return bad(res, 429, "Too many wrong codes. Request a new one.");
    }
    if (!sameHash(doc.resetHash, hashOtp(req.body?.code)))
      return bad(res, 401, "That code is not correct.");
    doc.resetHash = "";
    doc.resetExpires = undefined;
    doc.resetAttempts = 0;
    await doc.save();
    // rotate: lets /setup + /confirm replace the existing authenticator.
    res.json({ setupToken: temp("portal-setup", 15, { rotate: true }) });
    if (mailConfigured())
      sendMail({
        to: String(process.env.ADMIN_EMAIL).trim().toLowerCase(),
        subject: `${issuer()} authenticator reset started`,
        text: "Someone verified the email code to set up a new authenticator for the portal. If this was not you, change ADMIN_PASSWORD now.",
      }).catch(() => {});
  } catch (error) {
    next(error);
  }
});

router.get("/session", requirePortal, (req, res) =>
  res.json({ user: { email: req.portalUser.email } }),
);

export default router;
