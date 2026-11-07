// Use when the authenticator phone is lost and recovery codes are gone:
//   npm run portal:reset-2fa
// The next portal sign-in will show a fresh QR code to scan.
import "dotenv/config";
import mongoose from "mongoose";
import PortalAuth from "../src/models/PortalAuth.js";

await mongoose.connect(process.env.MONGODB_URI);
const result = await PortalAuth.deleteMany({ key: "portal" });
console.log(
  result.deletedCount
    ? "Portal authenticator removed. Sign in to the portal to set it up again."
    : "Nothing to reset — the authenticator was not set up.",
);
await mongoose.disconnect();
