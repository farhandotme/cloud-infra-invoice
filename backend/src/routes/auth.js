import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import Admin from "../models/Admin.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Try again later." },
});

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password)
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    const admin = await Admin.findOne({ email });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res
        .status(401)
        .json({ message: "Email or password is incorrect." });
    }
    const token = jwt.sign(
      { sub: admin.id, email: admin.email, name: admin.name, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "12h" },
    );
    res.json({
      token,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAdmin, async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.admin.sub).select("email name role");
    if (!admin)
      return res
        .status(401)
        .json({ message: "Administrator account not found." });
    res.json({
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put("/password", requireAdmin, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (newPassword.length < 12)
      return res
        .status(400)
        .json({ message: "New password must be at least 12 characters." });
    const admin = await Admin.findById(req.admin.sub);
    if (
      !admin ||
      !(await bcrypt.compare(currentPassword, admin.passwordHash))
    ) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });
    }
    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    await admin.save();
    res.json({
      message: "Password updated. Sign in again with your new password.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
