import mongoose from "mongoose";

// Google Authenticator (TOTP) enrolment for the customer portal sign-in.
// Secrets are stored encrypted (see services/totp.js). One document, key "portal".
const portalAuthSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "portal" },
    enrolled: { type: Boolean, default: false },
    secret: { type: String, default: "" }, // encrypted, confirmed secret
    pendingSecret: { type: String, default: "" }, // encrypted, awaiting first code
    lastUsedStep: { type: Number, default: 0 }, // blocks re-using a code
    recoveryHashes: { type: [String], default: [] },
    enrolledAt: { type: Date },
    // Lost-authenticator reset by email code (see routes/portalAuth.js)
    resetHash: { type: String, default: "" }, // HMAC of the emailed code
    resetExpires: { type: Date },
    resetAttempts: { type: Number, default: 0 },
    resetSentAt: { type: Date },
  },
  { timestamps: true },
);

export default mongoose.model("PortalAuth", portalAuthSchema);
