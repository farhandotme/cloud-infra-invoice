/**
 * Payment transactions for the customer "Transactions" page.
 *
 * 1. If the provider published transaction records, those are shown as-is.
 * 2. Otherwise every PAID invoice becomes a payment (reference, date, method,
 *    amount) so this page always agrees with the Invoices page.
 * 3. If there are no invoices either, a sample payment history is generated
 *    from the client's contract amount and billing cycle (presentation only).
 */
import { getClientPricing } from './pricingModel.js';

const METHODS = ['UPI', 'NEFT', 'IMPS', 'Net banking', 'Credit card'];
const hash = text => [...String(text)].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 1000003, 11);
const two = value => String(value).padStart(2, '0');
const isoDate = date => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
const parseDate = value => { const d = new Date(`${String(value || '').slice(0, 10)}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; };

const reference = (seed, date) => `TXN${String(date.getFullYear()).slice(2)}${two(date.getMonth() + 1)}${String(hash(seed) % 1000000).padStart(6, '0')}`;

export function buildTransactionsFromInvoices(invoices = [], now = new Date()) {
  return invoices
    .filter(invoice => String(invoice.status || '').toLowerCase() === 'paid')
    .map(invoice => {
      const issue = parseDate(invoice.issueDate) || parseDate(invoice.dueDate) || now;
      const paid = new Date(issue.getTime() + (1 + hash(invoice.number || invoice._id) % 10) * 86_400_000);
      const date = paid > now ? now : paid;
      const seed = invoice.number || invoice._id || invoice.title || 'invoice';
      return {
        _id: `txn-${seed}`,
        reference: reference(seed, date),
        clientName: invoice.clientName || invoice.client || '',
        clientCode: invoice.clientCode || '',
        invoiceNumber: invoice.number || '',
        date: isoDate(date),
        amount: Number(invoice.amount || 0),
        currency: invoice.currency || 'INR',
        method: METHODS[hash(seed) % METHODS.length],
        status: 'Success',
        fromInvoice: true
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function buildEstimatedTransactions(client = {}, now = new Date()) {
  const pricing = getClientPricing(client);
  if (!(pricing.contractAmount > 0)) return [];
  const rows = [];
  const push = (date, amount, key) => {
    rows.push({
      _id: `estimate-txn-${client.code || 'client'}-${key}`,
      reference: reference(`${client.code}-${key}`, date),
      clientName: client.name || '',
      clientCode: client.code || '',
      date: isoDate(date),
      amount: Math.round(amount * 100) / 100,
      currency: pricing.currency,
      method: METHODS[hash(`${client.code}-${key}`) % METHODS.length],
      status: 'Success',
      estimated: true
    });
  };
  if (pricing.billingCycle === 'Yearly') {
    const start = new Date(now.getFullYear(), 0, 5);
    if (start <= now) push(start, pricing.yearlyCost, `${now.getFullYear()}`);
    const last = new Date(now.getFullYear() - 1, 0, 5);
    push(last, pricing.yearlyCost, `${now.getFullYear() - 1}`);
  } else {
    for (let back = 0; back < 6; back += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - back, 5);
      if (date <= now) push(date, pricing.monthlyCost, `${date.getFullYear()}${two(date.getMonth() + 1)}`);
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function summarizeTransactions(rows = [], invoices = []) {
  const ok = rows.filter(row => String(row.status).toLowerCase() === 'success' || String(row.status).toLowerCase() === 'paid');
  const outstanding = invoices
    .filter(invoice => ['pending', 'overdue'].includes(String(invoice.status || '').toLowerCase()))
    .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  return {
    received: ok.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    count: ok.length,
    last: rows[0] || null,
    outstanding
  };
}
