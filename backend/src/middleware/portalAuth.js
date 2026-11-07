import jwt from "jsonwebtoken";
import { createHash } from "crypto";

/** Changes whenever ADMIN_PASSWORD changes, so old portal sessions stop working. */
export const passwordVersion = () =>
  createHash("sha256")
    .update(`${process.env.JWT_SECRET}:${process.env.ADMIN_PASSWORD || ""}`)
    .digest("hex")
    .slice(0, 12);

export function requirePortal(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const deny = (message) =>
    res.status(401).json({ message, code: "PORTAL_AUTH_REQUIRED" });
  if (!token) return deny("Please sign in to view your infrastructure.");
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.purpose !== "portal" || payload.pv !== passwordVersion())
      return deny("Your session is no longer valid. Please sign in again.");
    req.portalUser = payload;
    next();
  } catch {
    return deny("Your session has expired. Please sign in again.");
  }
}
