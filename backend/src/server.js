import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import Admin from "./models/Admin.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import invoiceRoutes from "./routes/invoices.js";
import publicRoutes from "./routes/public.js";
import portalAuthRoutes from "./routes/portalAuth.js";
import { requirePortal } from "./middleware/portalAuth.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);

if (!process.env.MONGODB_URI)
  throw new Error(
    "MONGODB_URI is required. Copy .env.example to .env and configure it.",
  );
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  throw new Error("JWT_SECRET must be at least 32 characters.");

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      return callback(new Error("Origin not allowed by CORS."));
    },
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) =>
  res.json({
    status: "ok",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  }),
);
app.use("/api/auth", authRoutes);
app.use("/api/portal-auth", portalAuthRoutes);
// Customer infrastructure data now needs a portal sign-in (password + authenticator).
app.use("/api/public", requirePortal, publicRoutes);
app.use("/api/admin/invoices", invoiceRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err.name === "ValidationError" ? 400 : 500);
  res
    .status(status)
    .json({
      message:
        status >= 500 ? "An unexpected server error occurred." : err.message,
    });
});

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");
  if (
    process.env.NODE_ENV === "production" &&
    !String(process.env.PUBLIC_CLIENT_CODE || "").trim()
  ) {
    console.warn(
      "PUBLIC_CLIENT_CODE is not set. The customer portal will return all active client records. Set it before sharing the portal with customers.",
    );
  }

  // Create the first administrator only when credentials are explicitly supplied.
  const adminEmail = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");
  if (adminEmail && adminPassword) {
    const existing = await Admin.findOne({ email: adminEmail });
    if (!existing) {
      if (adminPassword.length < 12)
        throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
      await Admin.create({
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        name: process.env.ADMIN_NAME || "Administrator",
      });
      console.log(`Initial administrator created for ${adminEmail}.`);
    }
  }

  app.listen(PORT, () =>
    console.log(`CloudLedger API listening on http://localhost:${PORT}`),
  );
}

start().catch((error) => {
  console.error("API startup failed:", error);
  process.exit(1);
});
