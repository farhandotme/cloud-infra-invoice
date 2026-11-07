import { Router } from "express";
import Record from "../models/Record.js";
import Settings from "../models/Settings.js";
import { sendInvoicesPdf } from "../services/invoicePdf.js";
import { isLockedInvoice, unlockDate } from "../services/billing.js";
import { releaseDueInvoices } from "../services/release.js";

const router = Router();
const publicRecordTypes = [
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
];
const recordFields = {
  clients: [
    "name",
    "code",
    "company",
    "plan",
    "provider",
    "contractAmount",
    "billingCycle",
    "monthlyCost",
    "yearlyCost",
    "estimatedCapacity",
    "currency",
    "status",
    "servers",
    "color",
    "region",
  ],
  resources: [
    "name",
    "clientCode",
    "category",
    "provider",
    "region",
    "environment",
    "specification",
    "cpuPercent",
    "memoryPercent",
    "storageGB",
    "monthlyCost",
    "status",
    "image",
    "runtime",
    "memoryUsed",
    "restarts",
    "storageUsedGB",
    "securityChecksPassed",
  ],
  costPlans: [
    "name",
    "clientCode",
    "description",
    "monthlyPrice",
    "currency",
    "billingCycle",
    "serversIncluded",
    "storageGB",
    "features",
    "overageRate",
    "status",
  ],
  invoices: [
    "number",
    "clientName",
    "clientCode",
    "issueDate",
    "dueDate",
    "amount",
    "currency",
    "taxRate",
    "status",
    "paymentTerms",
    "lineItems",
    "pdfUrl",
    "billingCycle",
    "periodMonth",
    "periodLabel",
    "batchId",
    "batchLabel",
    "generated",
    "baseAmount",
    "serviceChargePct",
    "serviceCharge",
    "gstApplied",
    "gstRate",
    "gstType",
    "gstAmount",
    "taxableValue",
  ],
  transactions: [
    "reference",
    "clientName",
    "clientCode",
    "invoiceNumber",
    "date",
    "amount",
    "currency",
    "method",
    "status",
  ],
  integrations: [
    "name",
    "clientCode",
    "provider",
    "accountName",
    "region",
    "status",
    "lastSyncedAt",
    "description",
  ],
  dashboardCards: [
    "metric",
    "label",
    "value",
    "change",
    "footnote",
    "icon",
    "order",
    "enabled",
    "clientCode",
  ],
  contentBlocks: [
    "title",
    "placement",
    "body",
    "order",
    "enabled",
    "linkLabel",
    "linkUrl",
    "clientCode",
  ],
  activities: [
    "title",
    "description",
    "clientCode",
    "severity",
    "occurredAt",
    "status",
  ],
  companyProfiles: [
    "clientCode",
    "description",
    "environment",
    "environmentName",
    "environmentStatus",
    "provider",
    "location",
    "regionName",
    "regionCode",
    "availabilityZone",
    "operatingSystem",
    "primaryResource",
    "primaryResourceType",
    "primaryIp",
    "uptime",
    "healthScore",
    "healthStatus",
    "serviceStatus",
    "vcpuAllocated",
    "memoryAllocated",
    "diskAllocation",
    "networkDescription",
    "instanceState",
    "containerRuntime",
    "deploymentStatus",
    "repositoryPath",
    "lastUpdated",
  ],
  deployments: [
    "version",
    "clientCode",
    "description",
    "branch",
    "deployedAt",
    "status",
    "buildDuration",
    "buildSuccessRate",
    "rollbackPoint",
  ],
  runtimeSpecs: ["label", "value", "clientCode", "order"],
  codebaseFiles: ["path", "clientCode", "name", "content", "encoding"],
  terminalEntries: [
    "command",
    "clientCode",
    "output",
    "message",
    "level",
    "timestamp",
  ],
};
// Money fields a client must not see while an invoice is still scheduled.
const MONEY_FIELDS = new Set([
  "amount", "baseAmount", "serviceChargePct", "serviceCharge", "lineItems",
  "taxRate", "gstRate", "gstType", "gstAmount", "taxableValue", "gstApplied",
]);
function sanitizeData(type, data = {}, locked = false) {
  const allowed = (recordFields[type] || []).filter(
    (key) => !(locked && MONEY_FIELDS.has(key)),
  );
  const out = Object.fromEntries(
    allowed
      .filter((key) => Object.hasOwn(data, key))
      .map((key) => [key, data[key]]),
  );
  if (locked) {
    out.status = "Scheduled";
    out.locked = true;
    out.unlocksOn = unlockDate(data.periodMonth);
    delete out.pdfUrl;
  }
  return out;
}

const publicSettingKeys = [
  "brandName",
  "organizationName",
  "workspaceLabel",
  "supportEmail",
  "supportUrl",
  "currency",
  "timezone",
  "dashboardTitle",
  "dashboardSubtitle",
  "footerText",
  "logoUrl",
  "accentColor",
  "invoicePrefix",
  "defaultTaxRate",
  "defaultPaymentTerms",
  "helpText",
  "navigationLabels",
  "pageTitles",
  "pageDescriptions",
];

router.get("/portal", async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    await releaseDueInvoices();
    const [records, settingsDoc] = await Promise.all([
      Record.find({ type: { $in: publicRecordTypes }, isActive: true })
        .sort({ sortOrder: 1, updatedAt: -1 })
        .limit(5000)
        .lean(),
      Settings.findOne({ key: "main" }).lean(),
    ]);
    const publicClientCode = String(
      process.env.PUBLIC_CLIENT_CODE || "",
    ).trim();
    const visibleRecords = publicClientCode
      ? records.filter((record) => {
          if (record.type === "clients")
            return (
              String(record.data?.code || "")
                .trim()
                .toLowerCase() === publicClientCode.toLowerCase()
            );
          const recordClientCode = String(record.data?.clientCode || "").trim();
          return (
            !recordClientCode ||
            recordClientCode.toLowerCase() === publicClientCode.toLowerCase()
          );
        })
      : records;
    const grouped = Object.fromEntries(
      publicRecordTypes.map((type) => [type, []]),
    );
    for (const record of visibleRecords)
      grouped[record.type].push({
        _id: record._id,
        type: record.type,
        title: record.title,
        isActive: record.isActive,
        sortOrder: record.sortOrder,
        updatedAt: record.updatedAt,
        data: sanitizeData(
          record.type,
          record.data,
          record.type === "invoices" && isLockedInvoice(record),
        ),
      });
    const rawSettings = settingsDoc?.data || {};
    const settings = Object.fromEntries(
      publicSettingKeys
        .filter((key) => Object.hasOwn(rawSettings, key))
        .map((key) => [key, rawSettings[key]]),
    );
    res.json({
      records: grouped,
      settings,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Customer download of one invoice, limited to the portal's own client.
router.get("/invoices/:id/pdf", async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id))
      return res.status(400).json({ message: "Invalid invoice ID." });
    const invoice = await Record.findOne({
      _id: req.params.id,
      type: "invoices",
      isActive: true,
    }).lean();
    const scope = String(process.env.PUBLIC_CLIENT_CODE || "")
      .trim()
      .toLowerCase();
    const code = String(invoice?.data?.clientCode || "")
      .trim()
      .toLowerCase();
    if (!invoice || (scope && code && code !== scope))
      return res.status(404).json({ message: "Invoice not found." });
    if (isLockedInvoice(invoice))
      return res.status(403).json({
        message: `This invoice is not final yet. It follows your usage and is available from ${unlockDate(invoice.data.periodMonth)}.`,
      });
    const [client, settingsDoc] = await Promise.all([
      Record.findOne({
        type: "clients",
        "data.code": invoice.data?.clientCode,
      }).lean(),
      Settings.findOne({ key: "main" }).lean(),
    ]);
    sendInvoicesPdf(res, [invoice], {
      clientsByCode: client ? { [client.data.code]: client.data } : {},
      settings: settingsDoc?.data || {},
      filename: `${invoice.data?.number || "invoice"}.pdf`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
