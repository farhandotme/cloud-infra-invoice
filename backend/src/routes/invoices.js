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
  parseGstOptions,
  gstOn,
  isLockedPeriod,
  isLockedInvoice,
  unlockDate,
} from "../services/billing.js";
import { releaseDueInvoices } from "../services/release.js";
import { sendInvoicesPdf } from "../services/invoicePdf.js";

const router = Router();
router.use(requireAdmin);
router.use(async (_req, _res, next) => {
  try {
    await releaseDueInvoices();
    next();
  } catch (error) {
    next(error);
  }
});

const STATUSES = new Set(["Draft", "Pending", "Paid", "Overdue", "Cancelled"]);

function finish(plan, pct, gst) {
  const sum = (key) =>
    plan.items.reduce((a, i) => a + toUnits(i[key] || 0), 0) / 100;
  return {
    ...plan,
    serviceChargePct: pct,
    lockedCount: plan.items.filter((i) => i.locked).length,
    chargeTotal: sum("charge"),
    gst: gst
      ? {
          rate: gst.rate,
          supplyType: gst.supplyType,
          supplyChoice: gst.supplyChoice,
          sac: gst.sac,
          placeOfSupply: gst.placeOfSupply,
          sellerGstin: gst.sellerGstin,
          buyerGstin: gst.buyerGstin,
        }
      : null,
    taxableTotal: gst ? sum("taxable") : 0,
    cgstTotal: sum("cgst"),
    sgstTotal: sum("sgst"),
    igstTotal: sum("igst"),
    gstTotal: sum("gstAmount"),
    grandTotal: sum("total"),
  };
}

function chargePct(body) {
  if (!body?.serviceCharge) return 0;
  const pct = Number(body.serviceChargePct);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100)
    throw httpError(
      "Enter the Mindboxx service charge as a percentage between 0 and 100.",
    );
  return pct;
}
/** Adds the service charge and (optionally) GST to each { month, amount } item. */
function priced(items, pct, gst) {
  const rows = withServiceCharge(
    items.map((i) => i.amount),
    pct,
  );
  return items.map((item, i) => {
    const taxable = rows[i].total;
    const locked = isLockedPeriod(item.month);
    if (!gst)
      return {
        ...item,
        locked,
        charge: rows[i].charge,
        taxable,
        total: taxable,
      };
    const t = gstOn(taxable, gst);
    return {
      ...item,
      locked,
      charge: rows[i].charge,
      taxable,
      cgst: t.cgst,
      sgst: t.sgst,
      igst: t.igst,
      gstAmount: t.gst,
      total: t.total,
    };
  });
}
async function loadGstContext(body, clientId) {
  if (!body?.gst?.enabled) return null;
  const [settingsDoc, client] = await Promise.all([
    Settings.findOne({ key: "main" }).lean(),
    mongoose.isValidObjectId(clientId)
      ? Record.findOne({ _id: clientId, type: "clients" }).lean()
      : null,
  ]);
  return parseGstOptions(body.gst, settingsDoc?.data || {}, client?.data || {});
}
function buildPlan(body, gst) {
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
          gst,
        ),
      },
      pct,
      gst,
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
          gst,
        ),
      },
      pct,
      gst,
    );
  }
  throw httpError("Choose Monthly or Yearly.");
}

// Preview the split (nothing is saved).
router.post("/preview", async (req, res, next) => {
  try {
    const gst = await loadGstContext(req.body, req.body?.clientId);
    const plan = buildPlan(req.body, gst);
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
    const gst = await loadGstContext(req.body, clientId);
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
      gst,
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
          taxRate: gst ? gst.rate : 0,
          gstApplied: Boolean(gst),
          // Current and future months are Scheduled (locked) until the month ends.
          status: item.locked ? "Scheduled" : status,
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
          ...(gst
            ? {
                gstRate: gst.rate,
                gstType: gst.supplyType === "inter" ? "IGST" : "CGST+SGST",
                gstSac: gst.sac,
                placeOfSupply: gst.placeOfSupply,
                // Snapshots, so later edits in Settings never rewrite a bill already issued.
                sellerGstin: gst.sellerGstin,
                buyerGstin: gst.buyerGstin,
                sellerLegalName: settings.organizationName || "",
                sellerAddress: settings.gstAddress || "",
                taxableValue: item.taxable,
                cgst: item.cgst,
                sgst: item.sgst,
                igst: item.igst,
                gstAmount: item.gstAmount,
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
      details: {
        batchId,
        mode,
        total,
        count: created.length,
        gst: gst ? `${gst.rate}% ${gst.supplyType === "inter" ? "IGST" : "CGST+SGST"}` : "none",
      },
    });
    res.status(201).json({
      batchId,
      count: created.length,
      lockedCount: sorted.filter((i) => i.locked).length,
      invoices: created,
    });
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
    // Scheduled (current/future) months are left out of the download.
    const ready = invoices.filter((i) => !isLockedInvoice(i));
    if (!ready.length)
      throw httpError(
        `These invoices are scheduled and unlock on ${unlockDate(invoices[0].data.periodMonth)}.`,
        403,
      );
    const ctx = await loadContext(ready);
    const name = String(ready[0].data.clientName || "client").replace(
      /[^\w]+/g,
      "_",
    );
    sendInvoicesPdf(res, ready, {
      ...ctx,
      filename: `${name}_invoices_${ready[0].data.periodMonth}_to_${ready.at(-1).data.periodMonth}.pdf`,
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

// Edit the internal amount of a scheduled (still locked) invoice. Service charge
// and GST are recalculated from what the invoice was created with.
router.patch("/:id/amount", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      throw httpError("Invalid invoice ID.");
    const invoice = await Record.findOne({
      _id: req.params.id,
      type: "invoices",
    }).lean();
    if (!invoice) throw httpError("Invoice not found.", 404);
    if (!isLockedInvoice(invoice))
      throw httpError(
        "Only scheduled invoices can be edited. This month has already ended.",
        409,
      );
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      throw httpError("Enter an amount greater than zero.");
    const d = invoice.data;
    const pct = Number(d.serviceChargePct) || 0;
    const gst = d.gstApplied
      ? {
          rate: Number(d.gstRate),
          supplyType: d.gstType === "IGST" ? "inter" : "intra",
        }
      : null;
    const [row] = priced([{ month: d.periodMonth, amount }], pct, gst);
    const lineItems = [
      { ...(d.lineItems?.[0] || {}), amount },
      {
        ...(d.lineItems?.[1] || {
          description: `Mindboxx service charge (${pct}%)`,
        }),
        amount: pct ? row.charge : 0,
      },
    ];
    const set = {
      "data.amount": row.total,
      "data.lineItems": lineItems,
    };
    if (pct) {
      set["data.baseAmount"] = amount;
      set["data.serviceCharge"] = row.charge;
    }
    if (gst) {
      set["data.taxableValue"] = row.taxable;
      set["data.cgst"] = row.cgst;
      set["data.sgst"] = row.sgst;
      set["data.igst"] = row.igst;
      set["data.gstAmount"] = row.gstAmount;
    }
    await Record.updateOne({ _id: invoice._id }, { $set: set });
    if (d.batchId && d.billingCycle === "Yearly") {
      const all = await Record.find({
        type: "invoices",
        "data.batchId": d.batchId,
      })
        .select("data.lineItems")
        .lean();
      const yearly =
        all.reduce((s, r) => s + toUnits(r.data?.lineItems?.[0]?.amount), 0) /
        100;
      await Record.updateMany(
        { type: "invoices", "data.batchId": d.batchId },
        { $set: { "data.yearlyTotal": yearly } },
      );
    }
    await AuditLog.create({
      action: "edited scheduled invoice amount",
      recordType: "invoices",
      recordId: String(invoice._id),
      title: d.number,
      actor: req.admin?.email,
      details: { from: d.baseAmount ?? d.lineItems?.[0]?.amount, to: amount },
    });
    res.json({ message: "Amount updated.", total: row.total });
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
    if (isLockedInvoice(invoice))
      throw httpError(
        `This invoice is scheduled — its amount follows usage and it unlocks on ${unlockDate(invoice.data.periodMonth)}.`,
        403,
      );
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
