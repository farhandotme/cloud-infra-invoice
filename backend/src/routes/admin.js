import { Router } from "express";
import mongoose from "mongoose";
import { randomBytes } from "crypto";
import Record from "../models/Record.js";
import Settings from "../models/Settings.js";
import { isValidGstin, normalizeGstin, gstinState } from "../services/billing.js";
import AuditLog from "../models/AuditLog.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const allowedTypes = new Set([
  "clients",
  "resources",
  "costPlans",
  "invoices",
  "transactions",
  "integrations",
  "dashboardCards",
  "contentBlocks",
  "activities",
  "companyProfiles",
  "deployments",
  "runtimeSpecs",
  "codebaseFiles",
  "terminalEntries",
]);
router.use(requireAdmin);

function checkType(type) {
  return allowedTypes.has(type);
}
function safeRecord(body, type, existingData = {}) {
  const data =
    body?.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? { ...body.data }
      : {};
  let title = String(body?.title || "").trim();
  if (type === "clients") {
    title = String(data.name || title).trim();
    if (data.gstin) data.gstin = normalizeGstin(data.gstin);
    const billingCycle =
      String(data.billingCycle || "Monthly").toLowerCase() === "yearly"
        ? "Yearly"
        : "Monthly";
    const amount = Number(
      data.contractAmount ??
        (billingCycle === "Yearly" ? data.yearlyCost : data.monthlyCost) ??
        0,
    );
    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error(
        "Enter a monthly or yearly client amount greater than zero.",
      );
      error.status = 400;
      throw error;
    }
    const slug =
      title
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 14) || "CLIENT";
    data.code = String(
      data.code ||
        existingData.code ||
        `CL-${slug}-${randomBytes(3).toString("hex").toUpperCase()}`,
    );
    data.name = title;
    data.billingCycle = billingCycle;
    data.contractAmount = amount;
    data.monthlyCost = billingCycle === "Yearly" ? amount / 12 : amount;
    data.yearlyCost = billingCycle === "Yearly" ? amount : amount * 12;
    const now = new Date();
    const daysInCurrentMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    const daysInCurrentYear =
      (new Date(now.getFullYear() + 1, 0, 1) -
        new Date(now.getFullYear(), 0, 1)) /
      86_400_000;
    data.dailyCost =
      amount /
      (billingCycle === "Yearly" ? daysInCurrentYear : daysInCurrentMonth);
    const capacityUnits = Math.min(
      64,
      Math.max(1, Math.ceil(data.monthlyCost / 2500)),
    );
    data.estimatedCapacity = {
      units: capacityUnits,
      vcpu: capacityUnits,
      memoryGb: capacityUnits * 2,
      diskGb: capacityUnits * 50,
      networkMbps: capacityUnits * 25,
      model: "budget-estimate-v1",
    };
    data.currency = String(
      data.currency || process.env.DEFAULT_CURRENCY || "INR",
    );
    data.status = String(data.status || "Active");
  }
  const isActive = body?.isActive !== false;
  const sortOrder = Number.isFinite(Number(body?.sortOrder))
    ? Number(body.sortOrder)
    : 0;
  return { title, data, isActive, sortOrder };
}
async function audit(req, action, record, details = {}) {
  await AuditLog.create({
    action,
    recordType: record?.type,
    recordId: record?._id?.toString(),
    title: record?.title,
    actor: req.admin?.email,
    details,
  });
}

router.get("/records", async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.type) {
      if (!checkType(String(req.query.type)))
        return res.status(400).json({ message: "Unknown record type." });
      filter.type = String(req.query.type);
    }
    const records = await Record.find(filter)
      .sort({ sortOrder: 1, updatedAt: -1 })
      .limit(2000)
      .lean();
    res.json({ records });
  } catch (error) {
    next(error);
  }
});

router.post("/records", async (req, res, next) => {
  try {
    const type = String(req.body?.type || "");
    if (!checkType(type))
      return res.status(400).json({ message: "Unknown record type." });
    const payload = safeRecord(req.body, type);
    if (!payload.title)
      return res.status(400).json({ message: "A record title is required." });
    const record = await Record.create({ type, ...payload });
    await audit(req, "created", record);
    res.status(201).json({ record });
  } catch (error) {
    next(error);
  }
});

router.put("/records/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid record ID." });
    const current = await Record.findById(req.params.id);
    if (!current) return res.status(404).json({ message: "Record not found." });
    const payload = safeRecord(req.body, current.type, current.data || {});
    if (!payload.title)
      return res.status(400).json({ message: "A record title is required." });
    current.title = payload.title;
    current.data = payload.data;
    current.isActive = payload.isActive;
    current.sortOrder = payload.sortOrder;
    await current.save();
    await audit(req, "updated", current);
    res.json({ record: current });
  } catch (error) {
    next(error);
  }
});

router.delete("/records/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid record ID." });
    const record = await Record.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: "Record not found." });
    await audit(req, "deleted", record);
    res.json({ message: "Record deleted." });
  } catch (error) {
    next(error);
  }
});

router.get("/settings", async (_req, res, next) => {
  try {
    const doc = await Settings.findOne({ key: "main" }).lean();
    res.json({ settings: doc?.data || {} });
  } catch (error) {
    next(error);
  }
});

router.put("/settings", async (req, res, next) => {
  try {
    const data = req.body?.settings;
    if (!data || typeof data !== "object" || Array.isArray(data))
      return res.status(400).json({ message: "Settings must be an object." });
    // Own-company GST details: a registered company needs a real GSTIN.
    data.gstRegistered = Boolean(data.gstRegistered);
    data.gstin = normalizeGstin(data.gstin);
    if (data.gstRegistered) {
      if (!isValidGstin(data.gstin))
        return res.status(400).json({
          message:
            "That GSTIN is not valid. It has 15 characters, e.g. 27AAPFU0939F1ZV — check the state code and the last character.",
        });
      data.gstStateCode = gstinState(data.gstin).code;
    } else {
      data.gstin = isValidGstin(data.gstin) ? data.gstin : "";
      delete data.gstStateCode;
    }
    if (data.gstSac && !/^\d{4,8}$/.test(String(data.gstSac).trim()))
      return res
        .status(400)
        .json({ message: "The default SAC / HSN code must be 4 to 8 digits." });
    if (data.gstDefaultRate !== undefined && data.gstDefaultRate !== "") {
      const rate = Number(data.gstDefaultRate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > 40)
        return res
          .status(400)
          .json({ message: "The default GST rate must be between 0.01 and 40." });
    }
    const doc = await Settings.findOneAndUpdate(
      { key: "main" },
      { $set: { data } },
      { new: true, upsert: true, runValidators: true },
    );
    await AuditLog.create({
      action: "updated settings",
      actor: req.admin?.email,
      details: { keys: Object.keys(data) },
    });
    res.json({ settings: doc.data });
  } catch (error) {
    next(error);
  }
});

router.get("/audit", async (req, res, next) => {
  try {
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

export default router;
