import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Copy,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { authCall, getPortalToken, setPortalToken } from "./portalSession.js";
import "./portal-login.css";
import mindtreeLogo from "./assets/images/recta.png";

/**
 * Wraps the customer portal. Without a valid sign-in only the login screen is
 * shown, so no infrastructure data is requested or displayed.
 *   1. email + password (ADMIN_EMAIL / ADMIN_PASSWORD from the server .env)
 *   2. Google Authenticator code (first time: scan the QR code)
 *   Lost phone: a code is emailed to the admin address, then a new QR is shown.
 */
export default function PortalGate({ children }) {
  const [signedIn, setSignedIn] = useState(Boolean(getPortalToken()));
  useEffect(() => {
    const out = () => setSignedIn(false);
    window.addEventListener("portal-signed-out", out);
    return () => window.removeEventListener("portal-signed-out", out);
  }, []);
  if (signedIn) return children;
  return <LoginFlow onDone={() => setSignedIn(true)} />;
}

function LoginFlow({ onDone }) {
  const [step, setStep] = useState("password"); // password | setup | codes | totp | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [qr, setQr] = useState(null);
  const [codes, setCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [wait, setWait] = useState(0); // seconds until "send again" is allowed

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const guard = (fn) => async (event) => {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = guard(async () => {
    const result = await authCall("/login", { email, password });
    setPassword("");
    if (result.step === "setup") {
      setSetupToken(result.setupToken);
      setQr(await authCall("/setup", { setupToken: result.setupToken }));
      setStep("setup");
    } else {
      setChallengeToken(result.challengeToken);
      setStep("totp");
    }
    setCode("");
  });
  const submitSetup = guard(async () => {
    const result = await authCall("/confirm", { setupToken, code });
    setPortalToken(result.token);
    setCodes(result.recoveryCodes || []);
    setStep("codes");
  });
  const submitTotp = guard(async () => {
    const result = await authCall(
      "/verify",
      recovery
        ? { challengeToken, recoveryCode: code }
        : { challengeToken, code },
    );
    setPortalToken(result.token);
    onDone();
  });
  const sendResetCode = guard(async () => {
    const result = await authCall("/reset/request", { challengeToken });
    setResetToken(result.resetToken);
    setSentTo(result.sentTo);
    setWait(result.resendAfter || 60);
    setCode("");
    setStep("reset");
  });
  const submitReset = guard(async () => {
    const result = await authCall("/reset/confirm", { resetToken, code });
    setSetupToken(result.setupToken);
    setQr(await authCall("/setup", { setupToken: result.setupToken }));
    setCode("");
    setStep("setup");
  });
  const back = () => {
    setStep("password");
    setCode("");
    setError("");
    setRecovery(false);
  };

  return (
    <div className="pl-shell">
      <div className="pl-side">
        <div className="pl-brand">
          <span className="pl-logo">
            <img src={mindtreeLogo} alt="Mindtree Communications" />
          </span>
          {/* <b>Mindtree</b> */}
        </div>
        <div className="pl-pitch">
          <div className="pl-eyebrow">
            <i /> CUSTOMER PORTAL
          </div>
          <h1>
            Your infrastructure.
            <br />
            Your usage.
            <br />
            <em>One dashboard.</em>
          </h1>
          <p>
            View your cloud infrastructure, usage and invoices in one secure
            place.
          </p>
        </div>
        <div className="pl-foot">
          Password <b>·</b> Two-step verification <b>·</b> Private portal
        </div>
      </div>

      <div className="pl-form-wrap">
        <div className="pl-card">
          {step === "password" && (
            <form onSubmit={submitPassword}>
              <Head
                icon={Lock}
                eyebrow="SECURE SIGN IN"
                title="Welcome back"
                text="Sign in to view your cloud infrastructure dashboard."
              />
              {error && <div className="pl-alert">{error}</div>}
              <label className="pl-field">
                Email address
                <input
                  type="email"
                  autoComplete="username"
                  autoFocus
                  required
                  placeholder="you@yourcompany.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="pl-field">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="pl-button" disabled={busy}>
                {busy ? "Checking…" : "Continue"} <ArrowUpRight size={15} />
              </button>
              <small className="pl-note">
                Access is limited to authorised users. There is no public
                sign-up.
              </small>
            </form>
          )}

          {step === "setup" && qr && (
            <form onSubmit={submitSetup}>
              <Head
                icon={Smartphone}
                eyebrow="AUTHENTICATOR SETUP"
                title="Set up Google Authenticator"
                text="Scan this QR code with Google Authenticator (or any authenticator app), then enter the 6-digit code it shows."
              />
              {error && <div className="pl-alert">{error}</div>}
              <div className="pl-qr">
                <img
                  src={qr.qr}
                  alt="Authenticator QR code"
                  width="200"
                  height="200"
                />
              </div>
              <details className="pl-manual">
                <summary>Can't scan? Enter the key manually</summary>
                <code>{qr.secret.match(/.{1,4}/g).join(" ")}</code>
              </details>
              <CodeInput value={code} onChange={setCode} />
              <button className="pl-button" disabled={busy || code.length < 6}>
                {busy ? "Verifying…" : "Verify and finish"}{" "}
                <ArrowUpRight size={15} />
              </button>
              <div className="pl-row">
                <button type="button" className="pl-link" onClick={back}>
                  Back
                </button>
              </div>
            </form>
          )}

          {step === "codes" && (
            <div>
              <Head
                icon={ShieldCheck}
                eyebrow="RECOVERY CODES"
                title="Save your recovery codes"
                text="If you lose your phone, each of these codes can be used once instead of an authenticator code. Store them somewhere safe — they won't be shown again."
              />
              <div className="pl-codes">
                {codes.map((c) => (
                  <code key={c}>{c}</code>
                ))}
              </div>
              <button
                type="button"
                className="pl-button ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(codes.join("\n"));
                  setCopied(true);
                }}
              >
                <Copy size={15} /> {copied ? "Copied" : "Copy codes"}
              </button>
              <button type="button" className="pl-button" onClick={onDone}>
                I've saved them — open dashboard <ArrowUpRight size={15} />
              </button>
            </div>
          )}

          {step === "totp" && (
            <form onSubmit={submitTotp}>
              <Head
                icon={KeyRound}
                eyebrow="TWO-STEP VERIFICATION"
                title="Enter your code"
                text={
                  recovery
                    ? "Enter one of your unused recovery codes."
                    : "Open Google Authenticator and enter the 6-digit code."
                }
              />
              {error && <div className="pl-alert">{error}</div>}
              {recovery ? (
                <label className="pl-field">
                  Recovery code
                  <input
                    autoFocus
                    autoComplete="off"
                    placeholder="XXXXX-XXXXX"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                </label>
              ) : (
                <CodeInput value={code} onChange={setCode} />
              )}
              <button
                className="pl-button"
                disabled={busy || code.length < (recovery ? 10 : 6)}
              >
                {busy ? "Verifying…" : "Verify"} <ArrowUpRight size={15} />
              </button>
              <div className="pl-row">
                <button
                  type="button"
                  className="pl-link"
                  onClick={() => {
                    setRecovery(!recovery);
                    setCode("");
                    setError("");
                  }}
                >
                  {recovery ? "Use authenticator code" : "Use a recovery code"}
                </button>
                <button type="button" className="pl-link" onClick={back}>
                  Start over
                </button>
              </div>
              <div className="pl-row">
                <button
                  type="button"
                  className="pl-link"
                  disabled={busy}
                  onClick={sendResetCode}
                >
                  Lost your authenticator? Reset by email
                </button>
              </div>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={submitReset}>
              <Head
                icon={Mail}
                eyebrow="RESET AUTHENTICATOR"
                title="Check your email"
                text={`We sent a 6-digit code to ${sentTo}. Enter it to set up a new authenticator. The code expires in 10 minutes.`}
              />
              {error && <div className="pl-alert">{error}</div>}
              <CodeInput value={code} onChange={setCode} />
              <button className="pl-button" disabled={busy || code.length < 6}>
                {busy ? "Checking…" : "Verify code"} <ArrowUpRight size={15} />
              </button>
              <div className="pl-row">
                <button
                  type="button"
                  className="pl-link"
                  disabled={busy || wait > 0}
                  onClick={sendResetCode}
                >
                  {wait > 0 ? `Send again in ${wait}s` : "Send a new code"}
                </button>
                <button type="button" className="pl-link" onClick={back}>
                  Start over
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Head({ icon: Icon, eyebrow, title, text }) {
  return (
    <>
      <div className="pl-icon">
        <Icon size={20} />
      </div>
      <span className="pl-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p className="pl-sub">{text}</p>
    </>
  );
}

function CodeInput({ value, onChange }) {
  return (
    <label className="pl-field">
      6-digit code
      <input
        className="pl-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={7}
        placeholder="000000"
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, 6))
        }
      />
    </label>
  );
}
