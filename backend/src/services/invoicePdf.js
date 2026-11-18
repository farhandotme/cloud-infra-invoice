import PDFDocument from "pdfkit";
import { monthLabel } from "./billing.js";

/* ── Blue-only palette (text greys are blue-tinted slate) ─────────────── */
const NAVY = "#0b2a5b"; // headings, total bars
const BLUE = "#1d4ed8"; // accents, links, key figures
const MID = "#3b6fc4"; // secondary accents
const BAND = "#dbe7f8"; // section header bands
const TINT = "#f2f7fd"; // panels / zebra rows
const RULE = "#c5d6ee"; // hairlines
const INK = "#10264a"; // body text
const MUTED = "#5d7192"; // labels, footnotes
const WHITE = "#ffffff";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const money = (value, currency = "INR") =>
  `${currency} ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y) return String(iso);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
};
const cap = (text) => String(text || "").replace(/^./, (c) => c.toUpperCase());

/* Indian-system amount in words (INR only) */
const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];
const below100 = (n) =>
  n < 20
    ? ONES[n]
    : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
const below1000 = (n) =>
  n >= 100
    ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${below100(n % 100)}` : ""}`
    : below100(n);
function wordsIndian(n) {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}
function amountInWords(value, currency) {
  if (currency !== "INR") return "";
  const total = Math.round(Number(value || 0) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  return `Indian Rupees ${wordsIndian(rupees)}${paise ? ` and ${wordsIndian(paise)} Paise` : ""} Only`;
}

function drawInvoice(doc, invoice, client = {}, settings = {}) {
  const d = invoice.data || {};
  const L = 40;
  const W = doc.page.width - 80;
  const R = L + W;
  const org = settings.organizationName || settings.brandName || "Mindtree";
  const currency = d.currency || settings.currency || "INR";
  const number = d.number || invoice.title || "—";
  const status = String(d.status || "Pending");
  const isPaid = status.toLowerCase() === "paid";
  const startPage = doc.bufferedPageRange().count - 1;

  const text = (str, x, y, opts = {}) =>
    doc.text(String(str ?? ""), x, y, { lineBreak: false, ...opts });
  const setFont = (bold, size, color) =>
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(size)
      .fillColor(color);
  const hline = (y, color = RULE, w = 0.6, x1 = L, x2 = R) =>
    doc.moveTo(x1, y).lineTo(x2, y).lineWidth(w).strokeColor(color).stroke();
  const label = (str, x, y, opts) => {
    setFont(true, 7, MUTED);
    text(str.toUpperCase(), x, y, { characterSpacing: 0.6, ...opts });
  };
  const needSpace = (y, h) => {
    if (y + h <= doc.page.height - 58) return y;
    doc.addPage();
    return 48;
  };

  /* ── Figures ───────────────────────────────────────────────────────── */
  const items =
    Array.isArray(d.lineItems) && d.lineItems.length
      ? d.lineItems
      : [
          {
            description: "Cloud infrastructure & managed services",
            amount: d.amount,
          },
        ];
  const hasCharge =
    Number(d.serviceChargePct) > 0 && Number(d.serviceCharge) > 0;
  const itemsSum = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const base = hasCharge
    ? Number(d.baseAmount ?? itemsSum - Number(d.serviceCharge))
    : itemsSum;
  const charge = hasCharge ? Number(d.serviceCharge) : 0;
  const total = Number(d.amount || 0);
  const diff = Math.round((total - base - charge) * 100) / 100;
  // GST only appears on bills that were created as GST invoices.
  const isGst = d.gstApplied === true;
  const cgst = isGst ? Number(d.cgst || 0) : 0;
  const sgst = isGst ? Number(d.sgst || 0) : 0;
  const igst = isGst ? Number(d.igst || 0) : 0;
  const gstTotal = cgst + sgst + igst;
  const taxable = isGst ? base + charge : 0;
  const rounding =
    Math.abs(diff - gstTotal) >= 0.005
      ? Math.round((diff - gstTotal) * 100) / 100
      : 0;
  const received = isPaid ? total : 0;
  const balance = Math.max(0, total - received);
  const period =
    d.periodLabel || (d.periodMonth ? monthLabel(d.periodMonth) : "—");

  /* ── Top accent + masthead (no logo) ───────────────────────────────── */
  doc.rect(0, 0, doc.page.width, 8).fill(NAVY);
  setFont(true, 19, NAVY);
  text(org, L, 30, { width: W * 0.6 });
  setFont(false, 8.5, MUTED);
  text(
    settings.workspaceLabel || "Cloud infrastructure & managed services",
    L,
    54,
    { width: W * 0.6 },
  );
  const contactBits = [settings.supportEmail, settings.supportUrl]
    .filter(Boolean)
    .join("   ·   ");
  if (contactBits) text(contactBits, L, 67, { width: W * 0.6 });
  if (isGst) {
    setFont(true, 8.5, INK);
    text(`GSTIN: ${d.sellerGstin || settings.gstin || "—"}`, L, 79, {
      width: W * 0.6,
    });
  }

  setFont(true, isGst ? 24 : 28, BLUE);
  text(isGst ? "TAX INVOICE" : "INVOICE", L, isGst ? 29 : 26, {
    width: W,
    align: "right",
  });
  setFont(false, 9, MUTED);
  text(`Statement of cloud services  ·  ${period}`, L, 62, {
    width: W,
    align: "right",
  });
  hline(isGst ? 94 : 88, NAVY, 1.2);

  /* ── Left: account + bill-to ───────────────────────────────────────── */
  let y = isGst ? 108 : 104;
  label("Account number", L, y);
  setFont(true, 17, INK);
  text(d.clientCode || client.code || "—", L, y + 12, { width: 240 });

  y += 46;
  label("Bill to", L, y);
  setFont(true, 11, INK);
  text(d.clientName || client.name || "—", L, y + 12, { width: 245 });
  let by = y + 28;
  const billLines = [
    client.company &&
      client.company !== (d.clientName || client.name) &&
      client.company,
    client.contactName && `ATTN: ${client.contactName}`,
    client.address,
    client.email,
    client.phone,
    isGst &&
      (d.buyerGstin || client.gstin) &&
      `GSTIN: ${d.buyerGstin || client.gstin}`,
  ].filter(Boolean);
  setFont(false, 9, INK);
  for (const line of billLines) {
    const h = doc.heightOfString(String(line), { width: 245 });
    doc.text(String(line), L, by, { width: 245 });
    by += h + 2.5;
  }
  const leftBottom = by;

  /* ── Right: invoice summary box ───────────────────────────────────── */
  const bx = L + 285;
  const bw = W - 285;
  const rows = [
    ["Invoice number", number],
    ["Invoice date", fmtDate(d.issueDate)],
    ["Billing period", period],
    ["Billing cycle", d.billingCycle || client.billingCycle || "—"],
    ["Due date", fmtDate(d.dueDate)],
    ["Status", cap(status)],
    ...(isGst
      ? [
          ["Place of supply", d.placeOfSupply || "—"],
          ["SAC code", d.gstSac || "—"],
        ]
      : []),
  ];
  let ry = isGst ? 108 : 104;
  doc.rect(bx, ry, bw, 22).fill(BAND);
  setFont(true, 10, NAVY);
  text("Invoice summary", bx + 10, ry + 6.5);
  ry += 22;
  rows.forEach(([k, v], i) => {
    if (i % 2 === 1) doc.rect(bx, ry, bw, 18).fill(TINT);
    setFont(false, 8.5, MUTED);
    text(k, bx + 10, ry + 5);
    setFont(true, 8.5, INK);
    text(v, bx + 10, ry + 5, { width: bw - 20, align: "right" });
    ry += 18;
  });
  hline(ry, RULE, 0.6, bx, bx + bw);
  doc.rect(bx, ry, bw, 46).fill(NAVY);
  setFont(true, 7.5, "#a9c3ec");
  text(
    isPaid
      ? "AMOUNT PAID"
      : `TOTAL AMOUNT DUE BY ${fmtDate(d.dueDate).toUpperCase()}`,
    bx + 10,
    ry + 9,
    { characterSpacing: 0.5, width: bw - 20 },
  );
  setFont(true, 17, WHITE);
  text(money(total, currency), bx + 10, ry + 22, {
    width: bw - 20,
    align: "right",
  });
  const rightBottom = ry + 46;

  /* ── Paid stamp (left column, beside the bill-to details) ─────────── */
  if (isPaid) {
    const sy = leftBottom + 8;
    doc.save().rotate(-8, { origin: [L + 50, sy + 15] });
    doc.roundedRect(L, sy, 100, 30, 5).lineWidth(2).strokeColor(BLUE).stroke();
    setFont(true, 18, BLUE);
    text("PAID", L, sy + 7, { width: 100, align: "center" });
    doc.restore();
  }

  /* ── Intro ─────────────────────────────────────────────────────────── */
  y = Math.max(isPaid ? leftBottom + 40 : leftBottom, rightBottom) + 18;
  setFont(true, 10.5, INK);
  text(`This invoice is for the billing period ${period}.`, L, y);
  y += 16;
  setFont(false, 8.8, INK);
  doc.text(
    `Thank you for choosing ${org}. Below is a clear breakdown of the cloud infrastructure and managed services provided to ${d.clientName || client.name || "your organisation"}, followed by the total payable and how to pay.`,
    L,
    y,
    { width: W, lineGap: 2 },
  );
  y = doc.y + 14;

  /* ── Service detail ────────────────────────────────────────────────── */
  y = needSpace(y, 230);
  doc.rect(L, y, W, 24).fill(BAND);
  setFont(true, 11, NAVY);
  text("Service detail", L + 12, y + 7);
  setFont(true, 8, NAVY);
  text(`ALL AMOUNTS IN ${currency}`, L, y + 8, {
    width: W - 12,
    align: "right",
    characterSpacing: 0.4,
  });
  y += 24;
  const cx = { no: L + 12, desc: L + 40, per: L + 330 };
  setFont(true, 7, MUTED);
  text("#", cx.no, y + 7);
  text("DESCRIPTION", cx.desc, y + 7, { characterSpacing: 0.5 });
  text("PERIOD", cx.per, y + 7, { characterSpacing: 0.5 });
  text("AMOUNT", L, y + 7, {
    width: W - 12,
    align: "right",
    characterSpacing: 0.5,
  });
  y += 21;
  hline(y, RULE, 0.8);
  const lines = items.map((item) => ({
    description: item.description || "Service",
    amount: item.amount,
  }));
  // Older invoices were saved without a service-charge line: always show it, at 0.00 when none was added.
  if (!lines.some((line) => /service charge/i.test(line.description))) {
    lines.push({ description: "Mindboxx service charge (0%)", amount: 0 });
  }
  lines.forEach((item, i) => {
    const descH = doc
      .font("Helvetica")
      .fontSize(9.2)
      .heightOfString(String(item.description), { width: 275 });
    const rh = Math.max(24, descH + 14);
    y = needSpace(y, rh);
    if (i % 2 === 1) doc.rect(L, y, W, rh).fill(TINT);
    setFont(false, 9, MUTED);
    text(String(i + 1), cx.no, y + 7);
    setFont(false, 9.2, INK);
    doc.text(String(item.description), cx.desc, y + 7, { width: 275 });
    setFont(false, 9, INK);
    text(period, cx.per, y + 7, { width: 100 });
    setFont(true, 9.2, INK);
    text(money(item.amount, currency), L, y + 7, {
      width: W - 12,
      align: "right",
    });
    y += rh;
    hline(y, RULE, 0.5);
  });

  /* ── Totals ────────────────────────────────────────────────────────── */
  y = needSpace(y, isGst ? 190 : 120);
  const tx = L + W * 0.45;
  const tw = R - tx;
  const totRow = (name, value, opts = {}) => {
    setFont(opts.bold, opts.size || 9.2, INK);
    text(name, tx + 12, y + 6);
    text(value, tx, y + 6, { width: tw - 12, align: "right" });
    y += 21;
    hline(y, RULE, 0.5, tx, R);
  };
  if (isGst) {
    totRow("Taxable value", money(taxable, currency));
    const half = Number(d.gstRate || 0) / 2;
    if (igst)
      totRow(`IGST @ ${Number(d.gstRate)}%`, money(igst, currency));
    else {
      totRow(`CGST @ ${half}%`, money(cgst, currency));
      totRow(`SGST @ ${half}%`, money(sgst, currency));
    }
  }
  if (rounding) totRow("Rounding adjustment", money(rounding, currency));
  totRow("Total for this invoice", money(total, currency), {
    bold: true,
    size: 10,
  });
  totRow("Payments received", money(received, currency));
  doc.rect(tx, y, tw, 28).fill(NAVY);
  setFont(true, 10, WHITE);
  text(isPaid ? "Balance due — paid in full" : "Balance due", tx + 12, y + 9);
  text(money(balance, currency), tx, y + 8.5, {
    width: tw - 12,
    align: "right",
  });
  if (!isPaid) {
    setFont(false, 7.5, MUTED);
    text(`Pay by ${fmtDate(d.dueDate)}`, L + 12, y + 10);
  }
  y += 28;
  const words = amountInWords(total, currency);
  if (words) {
    setFont(false, 8, MUTED);
    text(`Amount in words:  ${words}`, L + 12, y + 7, { width: W - 24 });
    y += 20;
  } else y += 10;
  if (isGst && d.sellerAddress) {
    setFont(false, 8, MUTED);
    doc.text(`Registered office:  ${d.sellerAddress}`, L + 12, y, {
      width: W - 24,
    });
    y = doc.y + 6;
  }

  return { startPage, number, org, settings };
}

/** Draws the footer on every page once the page count is known. */
function drawFooters(doc, spans) {
  const range = doc.bufferedPageRange();
  spans.forEach((span, idx) => {
    const end =
      idx + 1 < spans.length
        ? spans[idx + 1].startPage
        : range.start + range.count;
    for (let p = span.startPage; p < end; p += 1) {
      doc.switchToPage(p);
      const L = 40;
      const W = doc.page.width - 80;
      const fy = doc.page.height - 44;
      doc
        .moveTo(L, fy)
        .lineTo(L + W, fy)
        .lineWidth(0.6)
        .strokeColor(RULE)
        .stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
      const left = [
        span.org,
        span.settings.supportEmail,
        span.settings.footerText,
      ]
        .filter(Boolean)
        .join("   ·   ");
      doc.text(left, L, fy + 9, { width: W * 0.65, lineBreak: false });
      doc.text(
        `${span.number}   ·   Page ${p - span.startPage + 1} of ${end - span.startPage}`,
        L,
        fy + 9,
        { width: W, align: "right", lineBreak: false },
      );
    }
  });
}

/** Streams one PDF (one invoice per page, extra pages only if needed) to an Express response. */
export function sendInvoicesPdf(
  res,
  invoices,
  { clientsByCode = {}, settings = {}, filename = "invoice.pdf" } = {},
) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, left: 40, right: 40, bottom: 10 },
    bufferPages: true,
    info: {
      Title: filename.replace(/\.pdf$/i, ""),
      Producer: settings.organizationName || "Mindtree",
    },
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/[^\w.-]+/g, "_")}"`,
  );
  res.setHeader("Cache-Control", "no-store");
  doc.pipe(res);
  const spans = [];
  invoices.forEach((invoice, i) => {
    if (i > 0) doc.addPage();
    spans.push(
      drawInvoice(
        doc,
        invoice,
        clientsByCode[invoice.data?.clientCode] || {},
        settings,
      ),
    );
  });
  drawFooters(doc, spans);
  doc.end();
}

export { monthLabel };
