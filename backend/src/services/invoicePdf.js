import PDFDocument from "pdfkit";
import { monthLabel } from "./billing.js";

const INK = "#1b2430";
const MUTED = "#6b7685";
const LINE = "#d9dee5";
const ACCENT = "#27425f";

const inr = (value, currency = "INR") =>
  `${currency} ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y) return String(iso);
  return `${String(d).padStart(2, "0")} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
};

function drawInvoice(doc, invoice, client = {}, settings = {}) {
  const d = invoice.data || {};
  const left = 50,
    right = doc.page.width - 50,
    width = right - left;
  const org = settings.organizationName || settings.brandName || "CloudLedger";
  const currency = d.currency || settings.currency || "INR";

  // Header
  doc.rect(0, 0, doc.page.width, 96).fill(ACCENT);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(org, left, 34, { width: width * 0.6 });
  doc
    .font("Helvetica-Bold")
    .fontSize(26)
    .text("INVOICE", left, 30, { width, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#c9d5e3")
    .text(d.number || invoice.title, left, 62, { width, align: "right" });

  // Meta (right) and Bill to (left)
  let y = 124;
  doc
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("BILLED TO", left, y);
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(d.clientName || client.name || "—", left, y + 14, { width: 250 });
  const billLines = [
    d.clientCode && `Client code: ${d.clientCode}`,
    client.contactName,
    client.email,
    client.phone,
    client.address,
    client.gstin && `GSTIN: ${client.gstin}`,
  ].filter(Boolean);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(billLines.join("\n"), left, doc.y + 4, { width: 250 });

  const metaX = left + width - 210;
  const meta = [
    ["Invoice no.", d.number || invoice.title],
    ["Issue date", fmtDate(d.issueDate)],
    ["Due date", fmtDate(d.dueDate)],
    ["Billing period", d.periodLabel || "—"],
    ["Status", d.status || "—"],
  ];
  meta.forEach(([label, value], i) => {
    const rowY = y + i * 18;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(label, metaX, rowY, { width: 80 });
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(INK)
      .text(String(value), metaX + 85, rowY, { width: 125, align: "right" });
  });

  // Line items
  const tableTop = 262;
  doc.rect(left, tableTop, width, 24).fill("#eef2f7");
  doc
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("DESCRIPTION", left + 12, tableTop + 8)
    .text("PERIOD", left + 300, tableTop + 8, { width: 90 })
    .text("AMOUNT", left, tableTop + 8, { width: width - 12, align: "right" });
  const items =
    Array.isArray(d.lineItems) && d.lineItems.length
      ? d.lineItems
      : [
          {
            description: "Cloud infrastructure & managed services",
            amount: d.amount,
          },
        ];
  let rowY = tableTop + 36;
  items.forEach((item) => {
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(10)
      .text(item.description || "Service", left + 12, rowY, { width: 270 })
      .text(d.periodLabel || "—", left + 300, rowY, { width: 100 })
      .text(inr(item.amount, currency), left, rowY, {
        width: width - 12,
        align: "right",
      });
    rowY = Math.max(doc.y, rowY + 16) + 10;
    doc
      .moveTo(left, rowY - 4)
      .lineTo(right, rowY - 4)
      .strokeColor(LINE)
      .lineWidth(0.5)
      .stroke();
  });

  // Total
  const totalY = rowY + 14;
  doc.rect(right - 230, totalY, 230, 38).fill(ACCENT);
  doc
    .fillColor("#c9d5e3")
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("INVOICE TOTAL", right - 218, totalY + 8);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(inr(d.amount, currency), right - 218, totalY + 17, {
      width: 206,
      align: "right",
    });

  // Notes
  let noteY = totalY + 70;
  doc
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("PAYMENT TERMS", left, noteY);
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(9)
    .text(
      d.paymentTerms ||
        settings.defaultPaymentTerms ||
        "Payable within 15 days of the issue date.",
      left,
      noteY + 12,
      { width: 300 },
    );
  if (d.notes) {
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("NOTES", left, doc.y + 14);
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(9)
      .text(d.notes, left, doc.y + 2, { width: 300 });
  }

  // PAID stamp
  if (String(d.status).toLowerCase() === "paid") {
    doc.save().rotate(-12, { origin: [right - 90, noteY + 20] });
    doc
      .roundedRect(right - 150, noteY, 120, 40, 6)
      .lineWidth(2)
      .strokeColor("#2f8f5b")
      .stroke();
    doc
      .fillColor("#2f8f5b")
      .font("Helvetica-Bold")
      .fontSize(22)
      .text("PAID", right - 150, noteY + 9, { width: 120, align: "center" });
    doc.restore();
  }

  // Footer
  const footY = doc.page.height - 60;
  doc
    .moveTo(left, footY)
    .lineTo(right, footY)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();
  const footer =
    [
      settings.footerText,
      settings.supportEmail && `Support: ${settings.supportEmail}`,
    ]
      .filter(Boolean)
      .join("   ·   ") || `Thank you for choosing ${org}.`;
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text(footer, left, footY + 10, {
      width,
      align: "center",
      lineBreak: false,
    });
  // doc.text('This is a computer-generated invoice.', left, footY + 24, { width, align: 'center', lineBreak: false });
}

/** Streams one PDF (one page per invoice) to an Express response. */
export function sendInvoicesPdf(
  res,
  invoices,
  { clientsByCode = {}, settings = {}, filename = "invoice.pdf" } = {},
) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, left: 50, right: 50, bottom: 10 },
    info: { Title: filename.replace(/\.pdf$/i, ""), Producer: "CloudLedger" },
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/[^\w.-]+/g, "_")}"`,
  );
  res.setHeader("Cache-Control", "no-store");
  doc.pipe(res);
  invoices.forEach((invoice, i) => {
    if (i > 0) doc.addPage();
    drawInvoice(
      doc,
      invoice,
      clientsByCode[invoice.data?.clientCode] || {},
      settings,
    );
  });
  doc.end();
}

export { monthLabel };
