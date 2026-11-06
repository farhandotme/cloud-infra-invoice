import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, Download, Edit3, FileText, Plus, RefreshCw, Shuffle, Trash2, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const money = (value, currency = 'INR') => {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toLocaleString('en-IN')}`; }
};
const dateText = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const Status = ({ value }) => <span className={`cl-status ${String(value || 'Not set').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{value || 'Not set'}</span>;

async function call(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Request failed (${response.status})`);
  }
  return response;
}
async function downloadPdf(path, token) {
  const response = await call(path, { token });
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || 'invoice.pdf';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const currentMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const addMonths = (key, offset) => {
  const [y, m] = key.split('-').map(Number); const i = y * 12 + m - 1 + offset;
  return `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`;
};
const monthCount = (start, end) => { if (!start || !end) return 0; const [a, b] = start.split('-').map(Number), [c, d] = end.split('-').map(Number); return (c * 12 + d) - (a * 12 + b) + 1; };

export default function InvoiceManager({ token, invoices, clients, currency, onStatus, onDelete, preselect, onPreselectUsed, refresh, setNotice, setError }) {
  const [open, setOpen] = useState(Boolean(preselect));
  const [startClient, setStartClient] = useState(preselect || '');
  useEffect(() => { if (preselect) { setStartClient(preselect); setOpen(true); onPreselectUsed?.(); } }, [preselect]);
  const [busyId, setBusyId] = useState('');

  const sorted = useMemo(() => [...invoices].sort((a, b) =>
    String(b.data?.periodMonth || b.data?.issueDate || '').localeCompare(String(a.data?.periodMonth || a.data?.issueDate || ''))), [invoices]);

  const batches = useMemo(() => {
    const map = new Map();
    for (const r of invoices) {
      const id = r.data?.batchId; if (!id) continue;
      if (!map.has(id)) map.set(id, { id, label: r.data.batchLabel, client: r.data.clientName, count: 0, total: 0, cycle: r.data.billingCycle, currency: r.data.currency || currency });
      const b = map.get(id); b.count += 1; b.total += Number(r.data.amount || 0);
    }
    return [...map.values()].filter(b => b.count > 1).reverse();
  }, [invoices, currency]);

  const run = async (id, fn) => {
    setBusyId(id); setError('');
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };
  const removeBatch = batch => {
    if (!window.confirm(`Delete all ${batch.count} invoices for ${batch.client} (${batch.label})? This cannot be undone.`)) return;
    run(batch.id, async () => { await call(`/api/admin/invoices/batch/${batch.id}`, { token, method: 'DELETE' }); setNotice('Invoice set deleted.'); await refresh(); });
  };

  return <>
    <section className="cl-panel cl-invoice-hero">
      <div><span className="cl-eyebrow">INVOICE GENERATOR</span><h2>Create invoices from an amount</h2>
        <p>Pick a client, choose a month or a whole year, and enter the amount. For a yearly amount the app divides it across the months automatically and the invoices always add up to exactly what you entered. Works for past periods too.</p></div>
      <button className="cl-button primary" onClick={() => { setStartClient(''); setOpen(true); }} disabled={!clients.length}><Plus size={15}/> Generate invoices</button>
    </section>
    {!clients.length && <div className="cl-manager-note"><FileText size={14}/><span>Add a client company first (Clients → Add client), then come back to generate invoices.</span></div>}

    {batches.length > 0 && <section className="cl-panel cl-table-panel"><div className="cl-panel-head"><div><h3>Generated sets</h3><p>Download every month of a yearly set as one PDF</p></div></div>
      <div className="cl-table-scroll"><table className="cl-table"><thead><tr><th>CLIENT</th><th>PERIOD</th><th>INVOICES</th><th>TOTAL</th><th>ACTIONS</th></tr></thead><tbody>
        {batches.map(b => <tr key={b.id}><td><b>{b.client}</b></td><td>{b.label}</td><td>{b.count}</td><td><b>{money(b.total, b.currency)}</b></td>
          <td><div className="cl-row-actions">
            <button className="cl-button secondary small" disabled={busyId === b.id} onClick={() => run(b.id, () => downloadPdf(`/api/admin/invoices/batch/${b.id}/pdf`, token))}><Download size={13}/> All as PDF</button>
            <button className="cl-icon-button danger" title="Delete this set" onClick={() => removeBatch(b)}><Trash2 size={14}/></button>
          </div></td></tr>)}
      </tbody></table></div></section>}

    <section className="cl-panel cl-table-panel">
      <div className="cl-panel-head"><div><h3>All invoices</h3><p>{sorted.length} saved invoice{sorted.length === 1 ? '' : 's'} · newest period first</p></div>
</div>
      {sorted.length ? <div className="cl-table-scroll"><table className="cl-table"><thead><tr><th>INVOICE</th><th>CLIENT</th><th>PERIOD</th><th>DUE DATE</th><th>AMOUNT</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
        {sorted.map(r => <tr key={r._id}>
          <td><b>{r.data?.number || r.title}</b></td><td>{r.data?.clientName || '—'}</td><td>{r.data?.periodLabel || dateText(r.data?.issueDate)}</td>
          <td>{dateText(r.data?.dueDate)}</td><td><b>{money(r.data?.amount, r.data?.currency || currency)}</b></td><td><select className="cl-status-select" value={r.data?.status || 'Pending'} onChange={e => onStatus(r, e.target.value)}>{['Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled'].map(s => <option key={s}>{s}</option>)}</select></td>
          <td><div className="cl-row-actions">
            <button className="cl-icon-button" title="Download PDF" disabled={busyId === r._id} onClick={() => run(r._id, () => downloadPdf(`/api/admin/invoices/${r._id}/pdf`, token))}><Download size={14}/></button>
            <button className="cl-icon-button danger" title="Delete" onClick={() => onDelete(r)}><Trash2 size={14}/></button>
          </div></td></tr>)}
      </tbody></table></div>
        : <div className="cl-empty"><div className="cl-empty-icon"><FileText size={20}/></div><h3>No invoices yet</h3><p>Use “Generate invoices” to create them from a client and an amount.</p></div>}
    </section>

    {open && <GenerateModal token={token} clients={clients} startClient={startClient} onClose={() => setOpen(false)}
      onDone={async count => { setNotice(`${count} invoice${count === 1 ? '' : 's'} generated.`); await refresh(); }}
      onDownloadBatch={batchId => downloadPdf(`/api/admin/invoices/batch/${batchId}/pdf`, token)}/>}
  </>;
}

function GenerateModal({ token, clients, startClient, onClose, onDone, onDownloadBatch }) {
  const [clientId, setClientId] = useState(clients.find(c => c._id === startClient)?._id || clients[0]?._id || '');
  const client = clients.find(c => c._id === clientId);
  const [mode, setMode] = useState(client?.data?.billingCycle === 'Yearly' ? 'yearly' : 'monthly');
  const [amount, setAmount] = useState(client?.data?.contractAmount ? String(client.data.contractAmount) : '');
  const [month, setMonth] = useState(currentMonth());
  const [startMonth, setStartMonth] = useState(currentMonth());
  const [endMonth, setEndMonth] = useState(addMonths(currentMonth(), 11));
  const [status, setStatus] = useState('Pending');
  const [charge, setCharge] = useState(false);
  const [chargePct, setChargePct] = useState('10');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const invalidate = () => { setPlan(null); setError(''); };
  const pickClient = id => {
    setClientId(id); invalidate();
    const c = clients.find(x => x._id === id);
    if (c) { setMode(c.data?.billingCycle === 'Yearly' ? 'yearly' : 'monthly'); setAmount(c.data?.contractAmount ? String(c.data.contractAmount) : ''); }
  };
  const lastPeriod = mode === 'yearly' ? endMonth : month;
  const suggestedStatus = lastPeriod && lastPeriod < currentMonth() ? 'Paid' : 'Pending';
  const cur = client?.data?.currency || 'INR';
  const months = monthCount(startMonth, endMonth);

  const preview = async () => {
    setBusy(true); setError('');
    try {
      const body = { mode, amount: Number(amount), month, startMonth, endMonth, serviceCharge: charge, serviceChargePct: Number(chargePct) };
      const response = await call('/api/admin/invoices/preview', { token, method: 'POST', body });
      const data = await response.json();
      setPlan(data); setStatus(s => (s === 'Pending' || s === 'Paid') ? suggestedStatus : s);
    } catch (err) { setError(err.message); setPlan(null); } finally { setBusy(false); }
  };
  const generate = async () => {
    setBusy(true); setError('');
    try {
      const response = await call('/api/admin/invoices/generate', { token, method: 'POST', body: { clientId, mode: plan.mode, amount: plan.total, items: plan.items.map(({ month: m, amount: a }) => ({ month: m, amount: a })), status, serviceCharge: charge, serviceChargePct: Number(chargePct) } });
      const data = await response.json();
      setResult(data); await onDone(data.count);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const planSum = plan ? plan.items.reduce((s, i) => s + Math.round(i.amount * 100), 0) / 100 : 0;

  return <div className="cl-modal-backdrop" onMouseDown={onClose}>
    <div className="cl-record-editor cl-invoice-modal" onMouseDown={e => e.stopPropagation()}>
      <div className="cl-modal-head"><div><span className="cl-eyebrow">INVOICE GENERATOR</span><h2>Generate invoices</h2><p>Nothing is saved until you press Generate.</p></div>
        <button type="button" className="cl-icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div>
      {error && <div className="cl-alert error">{error}</div>}

      {result ? <>
        <div className="cl-alert success"><Check size={15}/>{result.count} invoice{result.count === 1 ? '' : 's'} created for {client?.data?.name}.</div>
        <div className="cl-modal-footer"><button className="cl-button secondary" onClick={onClose}>Close</button>
          <button className="cl-button primary" onClick={() => onDownloadBatch(result.batchId).catch(e => setError(e.message))}><Download size={14}/> Download {result.count > 1 ? 'all as one PDF' : 'PDF'}</button></div>
      </> : <>
        <div className="cl-record-fields">
          <label className="cl-field wide"><span>Client company<em>*</em></span>
            <select value={clientId} onChange={e => pickClient(e.target.value)}>{clients.map(c => <option key={c._id} value={c._id}>{c.data?.name || c.title} · {c.data?.code}</option>)}</select></label>
          <div className="cl-field wide"><span>Invoice for</span>
            <div className="cl-segment">
              <button type="button" className={mode === 'monthly' ? 'on' : ''} onClick={() => { setMode('monthly'); invalidate(); }}>One month</button>
              <button type="button" className={mode === 'yearly' ? 'on' : ''} onClick={() => { setMode('yearly'); invalidate(); }}>Whole year (split by month)</button>
            </div></div>
          {mode === 'monthly'
            ? <label className="cl-field"><span>Month<em>*</em></span><input type="month" value={month} onChange={e => { setMonth(e.target.value); invalidate(); }} placeholder="YYYY-MM"/></label>
            : <>
              <label className="cl-field"><span>From month<em>*</em></span><input type="month" value={startMonth} placeholder="YYYY-MM" onChange={e => { setStartMonth(e.target.value); if (/^\d{4}-\d{2}$/.test(e.target.value)) setEndMonth(addMonths(e.target.value, 11)); invalidate(); }}/></label>
              <label className="cl-field"><span>To month<em>*</em></span><input type="month" value={endMonth} placeholder="YYYY-MM" onChange={e => { setEndMonth(e.target.value); invalidate(); }}/><small className="cl-field-hint">{months > 0 ? `${months} month${months === 1 ? '' : 's'} · ` : ''}Default is 12 months from the start. Change it if you want a different range.</small></label>
            </>}
          <label className="cl-field"><span>{mode === 'yearly' ? `Total yearly amount (${cur})` : `Amount (${cur})`}<em>*</em></span><input type="number" min="0" step="0.01" value={amount} onChange={e => { setAmount(e.target.value); invalidate(); }}/></label>
          <label className="cl-field"><span>Invoice status</span><select value={status} onChange={e => setStatus(e.target.value)}>{['Pending', 'Paid', 'Draft', 'Overdue'].map(s => <option key={s}>{s}</option>)}</select>
            <small className="cl-field-hint">{suggestedStatus === 'Paid' ? 'Past period — “Paid” is usually right.' : 'Current or future period — “Pending” is usually right.'}</small></label>
          <div className="cl-field wide cl-charge-box">
            <label className="cl-check"><input type="checkbox" checked={charge} onChange={e => { setCharge(e.target.checked); invalidate(); }}/> <span>Add Mindboxx service charge</span></label>
            {charge && <div className="cl-charge-input"><input type="number" min="0.01" max="100" step="0.01" value={chargePct} onChange={e => { setChargePct(e.target.value); invalidate(); }}/><b>% on top of the amount above</b></div>}
            <small className="cl-field-hint">{charge ? 'Shown as a separate line on every invoice. The amount you enter stays as the base.' : 'Leave off and no service charge appears on the invoices.'}</small>
          </div>
        </div>

        {plan && <div className="cl-split-preview">
          <div className="cl-split-head"><b>{plan.mode === 'yearly' ? `${plan.count} monthly invoices` : '1 invoice'}</b>
            {plan.mode === 'yearly' && <button type="button" className="cl-button secondary small" onClick={preview} disabled={busy}><Shuffle size={13}/> Split again</button>}</div>
          <div className="cl-table-scroll"><table className="cl-table"><thead><tr><th>MONTH</th><th>AMOUNT</th>{plan.serviceChargePct > 0 && <><th>MINDBOXX CHARGE ({plan.serviceChargePct}%)</th><th>INVOICE TOTAL</th></>}</tr></thead><tbody>
            {plan.items.map(i => <tr key={i.month}><td>{i.label}</td><td>{money(i.amount, cur)}</td>{plan.serviceChargePct > 0 && <><td>{money(i.charge, cur)}</td><td>{money(i.total, cur)}</td></>}</tr>)}
            <tr className="cl-split-total"><td><b>Total</b></td><td><b>{money(planSum, cur)}</b>{Math.abs(planSum - plan.total) < 0.005 && <span className="cl-split-ok"><Check size={12}/> matches</span>}</td>{plan.serviceChargePct > 0 && <><td><b>{money(plan.chargeTotal, cur)}</b></td><td><b>{money(plan.grandTotal, cur)}</b></td></>}</tr>
          </tbody></table></div>
        </div>}

        <div className="cl-modal-footer">
          <button type="button" className="cl-button secondary" onClick={onClose}>Cancel</button>
          {!plan
            ? <button className="cl-button primary" onClick={preview} disabled={busy || !clientId || !(Number(amount) > 0)}>{busy ? 'Working…' : mode === 'yearly' ? 'Preview split' : 'Preview invoice'} <ArrowUpRight size={14}/></button>
            : <button className="cl-button primary" onClick={generate} disabled={busy}>{busy ? 'Generating…' : `Generate ${plan.count} invoice${plan.count === 1 ? '' : 's'}`} <Check size={14}/></button>}
        </div>
      </>}
    </div>
  </div>;
}
