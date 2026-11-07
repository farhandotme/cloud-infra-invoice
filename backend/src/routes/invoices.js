import { Router } from "express";
import mongoose from "mongoose";
import { randomBytes } from "crypto";
import Record from "../models/Record.js";
import Settings from "../models/Settings.js";
import AuditLog from "../models/AuditLog.js";
import { requireAdmin } from "../middleware/auth.js";
import {
  httpError,
  parseMonth,
  monthLabel,
  monthRange,
  addMonths,
  addDays,
  splitAmount,
  toUnits,
  withServiceCharge,
} from "../services/billing.js";
import { sendInvoicesPdf } from "../services/invoicePdf.js";

const router = Router();
router.use(requireAdmin);

const STATUSES = new Set(["Draft", "Pending", "Paid", "Overdue", "Cancelled"]);

function finish(plan, pct) {
  const chargeTotal =
    plan.items.reduce((a, i) => a + toUnits(i.charge), 0) / 100;
  return {
    ...plan,
    serviceChargePct: pct,
    chargeTotal,
    grandTotal: Math.round(toUnits(plan.total) + toUnits(chargeTotal)) / 100,
  };
}

/** Works out the list of { month, label, amount } for a request. */
function chargePct(body) {
  if (!body?.serviceCharge) return 0;
  const pct = Number(body.serviceChargePct);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100)
    throw httpError(
      "Enter the Mindboxx service charge as a percentage between 0 and 100.",
    );
  return pct;
}
function priced(items, pct) {
  const rows = withServiceCharge(
    items.map((i) => i.amount),
    pct,
  );
  return items.map((item, i) => ({
    ...item,
    charge: rows[i].charge,
    total: rows[i].total,
  }));
}
function buildPlan(body) {
  const pct = chargePct(body);
  const mode = String(body?.mode || "").toLowerCase();
  const total = Number(body?.amount);
  if (!Number.isFinite(total) || total <= 0)
    throw httpError("Enter an amount greater than zero.");
  if (mode === "monthly") {
    if (!parseMonth(body.month))
      throw httpError("Choose the month to invoice.");
    return finish(
      {
        mode: "monthly",
        total,
        items: priced(
          [{ month: body.month, label: monthLabel(body.month), amount: total }],
          pct,
        ),
      },
      pct,
    );
  }
  if (mode === "yearly") {
    const start = body.startMonth;
    if (!parseMonth(start)) throw httpError("Choose the starting month.");
    // Default: 12 months starting at `start`; admin may pick any end month.
    const end =
      body.endMonth && parseMonth(body.endMonth)
        ? body.endMonth
        : addMonths(start, 11);
    const months = monthRange(start, end);
    const amounts = splitAmount(total, months.length);
    return finish(
      {
        mode: "yearly",
        total,
        items: priced(
          months.map((month, i) => ({
            month,
            label: monthLabel(month),
            amount: amounts[i],
          })),
          pct,
        ),
      },
      pct,
    );
  }
  throw httpError("Choose Monthly or Yearly.");
}

// Preview the split (nothing is saved).
router.post("/preview", (req, res, next) => {
  try {
    const plan = buildPlan(req.body);
    res.json({ ...plan, count: plan.items.length });
  } catch (error) {
    next(error);
  }
});

// Create the invoices. The items the admin previewed are saved as-is, but the
// server re-checks that a yearly split adds up exactly to the yearly total.
router.post("/generate", async (req, res, next) => {
  try {
    const { clientId, status = "Pending" } = req.body || {};
    if (!mongoose.isValidObjectId(clientId))
      throw httpError("Choose a client.");
    if (!STATUSES.has(status)) throw httpError("Invalid invoice status.");
    const client = await Record.findOne({ _id: clientId, type: "clients" });
    if (!client) throw httpError("Client not found.", 404);
    const cd = client.data || {};

    const mode = String(req.body.mode || "").toLowerCase();
    const total = Number(req.body.amount);
    if (!["monthly", "yearly"].includes(mode))
      throw httpError("Choose Monthly or Yearly.");
    if (!Number.isFinite(total) || total <= 0)
      throw httpError("Enter an amount greater than zero.");

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length || items.length > 60)
      throw httpError("Preview the invoices before generating them.");
    if (mode === "monthly" && items.length !== 1)
      throw httpError("A monthly invoice covers exactly one month.");
    const seen = new Set();
    for (const item of items) {
      if (!parseMonth(item?.month))
        throw httpError("One of the months is invalid.");
      if (seen.has(item.month)) throw httpError("A month appears twice.");
      seen.add(item.month);
      if (!Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0)
        throw httpError("Every invoice needs an amount greater than zero.");
    }
    const pct = chargePct(req.body);
    const sum = items.reduce((acc, item) => acc + toUnits(item.amount), 0);
    if (sum !== toUnits(total))
      throw httpError(
        "The monthly amounts do not add up to the total. Preview again.",
      );

    // Refuse to double-invoice a month that already has one for this client.
    const months = items.map((item) => item.month);
    const clash = await Record.find({
      type: "invoices",
      "data.clientCode": cd.code,
      "data.periodMonth": { $in: months },
    })
      .select("data.periodMonth")
      .lean();
    if (clash.length) {
      throw httpError(
        `This client already has invoices for: ${clash.map((r) => monthLabel(r.data.periodMonth)).join(", ")}. Delete them first or choose other months.`,
        409,
      );
    }

    const settingsDoc = await Settings.findOne({ key: "main" }).lean();
    const settings = settingsDoc?.data || {};
    const prefix = String(settings.invoicePrefix || "INV").trim() || "INV";
    const currency = String(cd.currency || settings.currency || "INR");
    const short = String(cd.code || "CLIENT").replace(/^CL-/, "");
    const batchId = randomBytes(6).toString("hex");
    const sorted = priced(
      [...items]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((i) => ({ month: i.month, amount: Number(i.amount) })),
      pct,
    );
    const first = sorted[0].month,
      last = sorted.at(-1).month;
    const batchLabel =
      mode === "yearly"
        ? `${monthLabel(first)} – ${monthLabel(last)}`
        : monthLabel(first);

    const docs = sorted.map((item) => {
      const { year, month } = parseMonth(item.month);
      const issueDate = `${item.month}-01`;
      const base = Number(item.amount);
      const amount = item.total;
      const brand = "Mindboxx";
      const lineItems = [
        {
          description: `Cloud infrastructure & managed services — ${monthLabel(item.month)}`,
          amount: base,
        },
      ];
      // Always list the service charge — shown as 0.00 when none was added.
      lineItems.push({
        description: `${brand} service charge (${pct || 0}%)`,
        amount: pct ? item.charge : 0,
      });
      return {
        type: "invoices",
        title: `${prefix}-${short}-${year}${String(month).padStart(2, "0")}`,
        isActive: true,
        sortOrder: 0,
        data: {
          number: `${prefix}-${short}-${year}${String(month).padStart(2, "0")}`,
          clientName: cd.name || client.title,
          clientCode: cd.code,
          issueDate,
          dueDate: addDays(issueDate, 15),
          amount,
          currency,
          taxRate: 0,
          status,
          paymentTerms: "Payable within 15 days of the issue date.",
          billingCycle: mode === "yearly" ? "Yearly" : "Monthly",
          periodMonth: item.month,
          periodLabel: monthLabel(item.month),
          lineItems,
          ...(pct
            ? {
                baseAmount: base,
                serviceChargePct: pct,
                serviceCharge: item.charge,
              }
            : {}),
          batchId,
          batchLabel,
          yearlyTotal: mode === "yearly" ? total : undefined,
          generated: true,
        },
      };
    });
    const created = await Record.insertMany(docs);
    await AuditLog.create({
      action: "generated invoices",
      recordType: "invoices",
      title: `${cd.name || client.title} · ${batchLabel}`,
      actor: req.admin?.email,
      details: { batchId, mode, total, count: created.length },
    });
    res.status(201).json({ batchId, count: created.length, invoices: created });
  } catch (error) {
    next(error);
  }
});

async function loadContext(invoices) {
  const codes = [
    ...new Set(invoices.map((i) => i.data?.clientCode).filter(Boolean)),
  ];
  const [clients, settingsDoc] = await Promise.all([
    Record.find({ type: "clients", "data.code": { $in: codes } }).lean(),
    Settings.findOne({ key: "main" }).lean(),
  ]);
  return {
    clientsByCode: Object.fromEntries(
      clients.map((c) => [c.data.code, c.data]),
    ),
    settings: settingsDoc?.data || {},
  };
}

router.get("/batch/:batchId/pdf", async (req, res, next) => {
  try {
    const invoices = await Record.find({
      type: "invoices",
      "data.batchId": req.params.batchId,
    })
      .sort({ "data.periodMonth": 1 })
      .lean();
    if (!invoices.length)
      throw httpError("No invoices found for that batch.", 404);
    const ctx = await loadContext(invoices);
    const name = String(invoices[0].data.clientName || "client").replace(
      /[^\w]+/g,
      "_",
    );
    sendInvoicesPdf(res, invoices, {
      ...ctx,
      filename: `${name}_invoices_${invoices[0].data.periodMonth}_to_${invoices.at(-1).data.periodMonth}.pdf`,
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/batch/:batchId", async (req, res, next) => {
  try {
    const invoices = await Record.find({
      type: "invoices",
      "data.batchId": req.params.batchId,
    }).lean();
    if (!invoices.length)
      throw httpError("No invoices found for that batch.", 404);
    await Record.deleteMany({
      type: "invoices",
      "data.batchId": req.params.batchId,
    });
    await AuditLog.create({
      action: "deleted invoice batch",
      recordType: "invoices",
      title: invoices[0].data.batchLabel,
      actor: req.admin?.email,
      details: { batchId: req.params.batchId, count: invoices.length },
    });
    res.json({ message: `${invoices.length} invoice(s) deleted.` });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      throw httpError("Invalid invoice ID.");
    const invoice = await Record.findOne({
      _id: req.params.id,
      type: "invoices",
    }).lean();
    if (!invoice) throw httpError("Invoice not found.", 404);
    const ctx = await loadContext([invoice]);
    sendInvoicesPdf(res, [invoice], {
      ...ctx,
      filename: `${invoice.data?.number || "invoice"}.pdf`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
