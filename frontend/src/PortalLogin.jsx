import React, { useEffect, useState } from "react";
import { Cloud, Copy, KeyRound, Lock, Mail, ShieldCheck, Smartphone } from "lucide-react";
import {
  authCall,
  getPortalToken,
  setPortalToken,
} from "./portalSession.js";

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
    <div className="pg-wrap">
      <div className="pg-card">
        <div className="pg-brand">
          <span className="pg-mark">
            <Cloud size={20} />
          </span>
          <b>CloudLedger</b>
        </div>

        {step === "password" && (
          <form onSubmit={submitPassword}>
            <h1>Sign in</h1>
            <p className="pg-sub">
              Sign in to view your cloud infrastructure dashboard.
            </p>
            {error && <div className="pg-error">{error}</div>}
            <label className="pg-field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="pg-field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="pg-button" disabled={busy}>
              <Lock size={15} /> {busy ? "Checking…" : "Continue"}
            </button>
          </form>
        )}

        {step === "setup" && qr && (
          <form onSubmit={submitSetup}>
            <h1>Set up Google Authenticator</h1>
            <p className="pg-sub">
              One-time setup. Scan this QR code with Google Authenticator (or
              any authenticator app), then enter the 6-digit code it shows.
            </p>
            {error && <div className="pg-error">{error}</div>}
            <div className="pg-qr">
              <img src={qr.qr} alt="Authenticator QR code" width="200" height="200" />
            </div>
            <details className="pg-manual">
              <summary>Can't scan? Enter the key manually</summary>
              <code>{qr.secret.match(/.{1,4}/g).join(" ")}</code>
            </details>
            <CodeInput value={code} onChange={setCode} />
            <button className="pg-button" disabled={busy || code.length < 6}>
              <Smartphone size={15} /> {busy ? "Verifying…" : "Verify and finish"}
            </button>
            <button type="button" className="pg-link" onClick={back}>
              Back
            </button>
          </form>
        )}

        {step === "codes" && (
          <div>
            <h1>Save your recovery codes</h1>
            <p className="pg-sub">
              If you lose your phone, each of these codes can be used once
              instead of an authenticator code. Store them somewhere safe — they
              won't be shown again.
            </p>
            <div className="pg-codes">
              {codes.map((c) => (
                <code key={c}>{c}</code>
              ))}
            </div>
            <button
              type="button"
              className="pg-button ghost"
              onClick={() => {
                navigator.clipboard?.writeText(codes.join("\n"));
                setCopied(true);
              }}
            >
              <Copy size={15} /> {copied ? "Copied" : "Copy codes"}
            </button>
            <button type="button" className="pg-button" onClick={onDone}>
              <ShieldCheck size={15} /> I've saved them — open dashboard
            </button>
          </div>
        )}

        {step === "totp" && (
          <form onSubmit={submitTotp}>
            <h1>Two-step verification</h1>
            <p className="pg-sub">
              {recovery
                ? "Enter one of your unused recovery codes."
                : "Open Google Authenticator and enter the 6-digit code."}
            </p>
            {error && <div className="pg-error">{error}</div>}
            {recovery ? (
              <label className="pg-field">
                <span>Recovery code</span>
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
              className="pg-button"
              disabled={busy || code.length < (recovery ? 10 : 6)}
            >
              <KeyRound size={15} /> {busy ? "Verifying…" : "Verify"}
            </button>
            <div className="pg-row">
              <button
                type="button"
                className="pg-link"
                onClick={() => {
                  setRecovery(!recovery);
                  setCode("");
                  setError("");
                }}
              >
                {recovery ? "Use authenticator code" : "Use a recovery code"}
              </button>
              <button type="button" className="pg-link" onClick={back}>
                Start over
              </button>
            </div>
            <div className="pg-row">
              <button
                type="button"
                className="pg-link"
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
            <h1>Check your email</h1>
            <p className="pg-sub">
              We sent a 6-digit code to {sentTo}. Enter it to set up a new
              authenticator. The code expires in 10 minutes.
            </p>
            {error && <div className="pg-error">{error}</div>}
            <CodeInput value={code} onChange={setCode} />
            <button className="pg-button" disabled={busy || code.length < 6}>
              <Mail size={15} /> {busy ? "Checking…" : "Verify code"}
            </button>
            <div className="pg-row">
              <button
                type="button"
                className="pg-link"
                disabled={busy || wait > 0}
                onClick={sendResetCode}
              >
                {wait > 0 ? `Send again in ${wait}s` : "Send a new code"}
              </button>
              <button type="button" className="pg-link" onClick={back}>
                Start over
              </button>
            </div>
          </form>
        )}
      </div>
      <p className="pg-foot">Access is limited to authorised users.</p>
    </div>
  );
}

function CodeInput({ value, onChange }) {
  return (
    <label className="pg-field">
      <span>6-digit code</span>
      <input
        className="pg-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={7}
        placeholder="000000"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
    </label>
  );
}
