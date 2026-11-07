import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  Edit3,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { DEFAULT_SAC, GST_RATES, gstinState, isValidGstin } from "./gst.js";

const API = import.meta.env.VITE_API_URL || "";
const money = (value, currency = "INR") => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toLocaleString("en-IN")}`;
  }
};
const dateText = (value) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
        "en-IN",
        { day: "2-digit", month: "short", year: "numeric" },
      )
    : "—";
const Status = ({ value }) => (
  <span
    className={`cl-status ${String(value || "Not set")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`}
  >
    {value || "Not set"}
  </span>
);

async function call(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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
  const disposition = response.headers.get("Content-Disposition") || "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || "invoice.pdf";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const addMonths = (key, offset) => {
  const [y, m] = key.split("-").map(Number);
  const i = y * 12 + m - 1 + offset;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};
const monthCount = (start, end) => {
  if (!start || !end) return 0;
  const [a, b] = start.split("-").map(Number),
    [c, d] = end.split("-").map(Number);
  return c * 12 + d - (a * 12 + b) + 1;
};

export default function InvoiceManager({
  token,
  invoices,
  clients,
  currency,
  settings = {},
  onOpenSettings,
  onStatus,
  onDelete,
  preselect,
  onPreselectUsed,
  refresh,
  setNotice,
  setError,
}) {
  const [open, setOpen] = useState(Boolean(preselect));
  const [startClient, setStartClient] = useState(preselect || "");
  useEffect(() => {
    if (preselect) {
      setStartClient(preselect);
      setOpen(true);
      onPreselectUsed?.();
    }
  }, [preselect]);
  const [busyId, setBusyId] = useState("");

  const sorted = useMemo(
    () =>
      [...invoices].sort((a, b) =>
        String(b.data?.periodMonth || b.data?.issueDate || "").localeCompare(
          String(a.data?.periodMonth || a.data?.issueDate || ""),
        ),
      ),
    [invoices],
  );

  // Filters for the "All invoices" table
  const emptyFilters = {
    search: "",
    client: "",
    status: "",
    from: "",
    to: "",
    order: "newest",
  };
  const [filters, setFilters] = useState(emptyFilters);
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const filtersActive = Object.keys(emptyFilters).some(
    (k) => filters[k] !== emptyFilters[k],
  );
  const periodKey = (r) =>
    String(r.data?.periodMonth || r.data?.issueDate || "").slice(0, 7);
  const clientOptions = useMemo(
    () =>
      [
        ...new Set(invoices.map((r) => r.data?.clientName).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b)),
    [invoices],
  );
  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const rows = sorted.filter((r) => {
      const d = r.data || {};
      if (filters.client && d.clientName !== filters.client) return false;
      if (filters.status && (d.status || "Pending") !== filters.status)
        return false;
      const key = periodKey(r);
      if (filters.from && (!key || key < filters.from)) return false;
      if (filters.to && (!key || key > filters.to)) return false;
      if (
        q &&
        !`${d.number || ""} ${r.title || ""} ${d.clientName || ""} ${d.periodLabel || ""} ${d.status || ""} ${d.amount ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
    if (filters.order === "oldest") rows.reverse();
    else if (filters.order === "high")
      rows.sort(
        (a, b) => Number(b.data?.amount || 0) - Number(a.data?.amount || 0),
      );
    else if (filters.order === "low")
      rows.sort(
        (a, b) => Number(a.data?.amount || 0) - Number(b.data?.amount || 0),
      );
    return rows;
  }, [sorted, filters]);
  const visibleTotal = visible.reduce(
    (sum, r) => sum + Number(r.data?.amount || 0),
    0,
  );

  const batches = useMemo(() => {
    const map = new Map();
    for (const r of invoices) {
      const id = r.data?.batchId;
      if (!id) continue;
      if (!map.has(id))
        map.set(id, {
          id,
          label: r.data.batchLabel,
          client: r.data.clientName,
          count: 0,
          total: 0,
          cycle: r.data.billingCycle,
          currency: r.data.currency || currency,
        });
      const b = map.get(id);
      b.count += 1;
      b.total += Number(r.data.amount || 0);
    }
    return [...map.values()].filter((b) => b.count > 1).reverse();
  }, [invoices, currency]);

  const run = async (id, fn) => {
    setBusyId(id);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  };
  const removeBatch = (batch) => {
    if (
      !window.confirm(
        `Delete all ${batch.count} invoices for ${batch.client} (${batch.label})? This cannot be undone.`,
      )
    )
      return;
    run(batch.id, async () => {
      await call(`/api/admin/invoices/batch/${batch.id}`, {
        token,
        method: "DELETE",
      });
      setNotice("Invoice set deleted.");
      await refresh();
    });
  };

  return (
    <>
      <section className="cl-panel cl-invoice-hero">
        <div>
          <span className="cl-eyebrow">INVOICE GENERATOR</span>
          <h2>Create invoices from an amount</h2>
          <p>
            Pick a client, choose a month or a whole year, and enter the amount.
            For a yearly amount the app divides it across the months
            automatically and the invoices always add up to exactly what you
            entered. Works for past periods too.
          </p>
        </div>
        <button
          className="cl-button primary"
          onClick={() => {
            setStartClient("");
            setOpen(true);
          }}
          disabled={!clients.length}
        >
          <Plus size={15} /> Generate invoices
        </button>
      </section>
      {!clients.length && (
        <div className="cl-manager-note">
          <FileText size={14} />
          <span>
            Add a client company first (Clients → Add client), then come back to
            generate invoices.
          </span>
        </div>
      )}

      {batches.length > 0 && (
        <section className="cl-panel cl-table-panel">
          <div className="cl-panel-head">
            <div>
              <h3>Generated sets</h3>
              <p>Download every month of a yearly set as one PDF</p>
            </div>
          </div>
          <div className="cl-table-scroll">
            <table className="cl-table">
              <thead>
                <tr>
                  <th>CLIENT</th>
                  <th>PERIOD</th>
                  <th>INVOICES</th>
                  <th>TOTAL</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <b>{b.client}</b>
                    </td>
                    <td>{b.label}</td>
                    <td>{b.count}</td>
                    <td>
                      <b>{money(b.total, b.currency)}</b>
                    </td>
                    <td>
                      <div className="cl-row-actions">
                        <button
                          className="cl-button secondary small"
                          disabled={busyId === b.id}
                          onClick={() =>
                            run(b.id, () =>
                              downloadPdf(
                                `/api/admin/invoices/batch/${b.id}/pdf`,
                                token,
                              ),
                            )
                          }
                        >
                          <Download size={13} /> All as PDF
                        </button>
                        <button
                          className="cl-icon-button danger"
                          title="Delete this set"
                          onClick={() => removeBatch(b)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="cl-panel cl-table-panel">
        <div className="cl-panel-head">
          <div>
            <h3>All invoices</h3>
            <p>
              {filtersActive
                ? `Showing ${visible.length} of ${sorted.length} invoice${sorted.length === 1 ? "" : "s"} · total ${money(visibleTotal, currency)}`
                : `${sorted.length} saved invoice${sorted.length === 1 ? "" : "s"} · total ${money(visibleTotal, currency)}`}
            </p>
          </div>
        </div>
        {sorted.length > 0 && (
          <div className="cl-filter-bar">
            <label className="cl-filter search">
              <Search size={13} />
              <input
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                placeholder="Search invoice no., company, period, amount…"
              />
            </label>
            <label className="cl-filter">
              <span>Company</span>
              <select
                value={filters.client}
                onChange={(e) => setFilter("client", e.target.value)}
              >
                <option value="">All companies</option>
                {clientOptions.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="cl-filter">
              <span>Status</span>
              <select
                value={filters.status}
                onChange={(e) => setFilter("status", e.target.value)}
              >
                <option value="">All statuses</option>
                {["Draft", "Pending", "Paid", "Overdue", "Cancelled"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
            <label className="cl-filter">
              <span>Period from</span>
              <input
                type="month"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => setFilter("from", e.target.value)}
              />
            </label>
            <label className="cl-filter">
              <span>Period to</span>
              <input
                type="month"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => setFilter("to", e.target.value)}
              />
            </label>
            <label className="cl-filter">
              <span>Sort by</span>
              <select
                value={filters.order}
                onChange={(e) => setFilter("order", e.target.value)}
              >
                <option value="newest">Newest period</option>
                <option value="oldest">Oldest period</option>
                <option value="high">Amount: high to low</option>
                <option value="low">Amount: low to high</option>
              </select>
            </label>
            {filtersActive && (
              <button
                type="button"
                className="cl-button secondary small cl-filter-clear"
                onClick={() => setFilters(emptyFilters)}
              >
                <X size={13} /> Clear filters
              </button>
            )}
          </div>
        )}
        {sorted.length && !visible.length ? (
          <div className="cl-empty">
            <div className="cl-empty-icon">
              <Search size={20} />
            </div>
            <h3>No invoices match these filters</h3>
            <p>
              Try a different company, status or period, or clear the filters.
            </p>
          </div>
        ) : sorted.length ? (
          <div className="cl-table-scroll">
            <table className="cl-table">
              <thead>
                <tr>
                  <th>INVOICE</th>
                  <th>CLIENT</th>
                  <th>PERIOD</th>
                  <th>DUE DATE</th>
                  <th>AMOUNT</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <b>{r.data?.number || r.title}</b>
                      {r.data?.gstApplied && (
                        <span className="cl-gst-badge" title={`${r.data.gstType} @ ${r.data.gstRate}%`}>
                          GST
                        </span>
                      )}
                    </td>
                    <td>{r.data?.clientName || "—"}</td>
                    <td>
                      {r.data?.periodLabel || dateText(r.data?.issueDate)}
                    </td>
                    <td>{dateText(r.data?.dueDate)}</td>
                    <td>
                      <b>
                        {money(r.data?.amount, r.data?.currency || currency)}
                      </b>
                    </td>
                    <td>
                      <select
                        className="cl-status-select"
                        value={r.data?.status || "Pending"}
                        onChange={(e) => onStatus(r, e.target.value)}
                      >
                        {[
                          "Draft",
                          "Pending",
                          "Paid",
                          "Overdue",
                          "Cancelled",
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="cl-row-actions">
                        <button
                          className="cl-icon-button"
                          title="Download PDF"
                          disabled={busyId === r._id}
                          onClick={() =>
                            run(r._id, () =>
                              downloadPdf(
                                `/api/admin/invoices/${r._id}/pdf`,
                                token,
                              ),
                            )
                          }
                        >
                          <Download size={14} />
                        </button>
                        <button
                          className="cl-icon-button danger"
                          title="Delete"
                          onClick={() => onDelete(r)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="cl-empty">
            <div className="cl-empty-icon">
              <FileText size={20} />
            </div>
            <h3>No invoices yet</h3>
            <p>
              Use “Generate invoices” to create them from a client and an
              amount.
            </p>
          </div>
        )}
      </section>

      {open && (
        <GenerateModal
          token={token}
          settings={settings}
          onOpenSettings={onOpenSettings}
          clients={clients}
          startClient={startClient}
          onClose={() => setOpen(false)}
          onDone={async (count) => {
            setNotice(`${count} invoice${count === 1 ? "" : "s"} generated.`);
            await refresh();
          }}
          onDownloadBatch={(batchId) =>
            downloadPdf(`/api/admin/invoices/batch/${batchId}/pdf`, token)
          }
        />
      )}
    </>
  );
}

function GenerateModal({
  settings = {},
  onOpenSettings,
  token,
  clients,
  startClient,
  onClose,
  onDone,
  onDownloadBatch,
}) {
  const [clientId, setClientId] = useState(
    clients.find((c) => c._id === startClient)?._id || clients[0]?._id || "",
  );
  const client = clients.find((c) => c._id === clientId);
  const [mode, setMode] = useState(
    client?.data?.billingCycle === "Yearly" ? "yearly" : "monthly",
  );
  const [amount, setAmount] = useState(
    client?.data?.contractAmount ? String(client.data.contractAmount) : "",
  );
  const [month, setMonth] = useState(currentMonth());
  const [startMonth, setStartMonth] = useState(currentMonth());
  const [endMonth, setEndMonth] = useState(addMonths(currentMonth(), 11));
  const [status, setStatus] = useState("Pending");
  const [charge, setCharge] = useState(false);
  const [chargePct, setChargePct] = useState("10");
  const gstReady = Boolean(settings.gstRegistered && isValidGstin(settings.gstin));
  const [gstOn, setGstOn] = useState(gstReady && Boolean(settings.gstDefaultOn));
  const [gstRate, setGstRate] = useState(String(settings.gstDefaultRate || "18"));
  const [supplyType, setSupplyType] = useState("auto");
  const [sac, setSac] = useState(settings.gstSac || DEFAULT_SAC);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const invalidate = () => {
    setPlan(null);
    setError("");
  };
  const pickClient = (id) => {
    setClientId(id);
    invalidate();
    const c = clients.find((x) => x._id === id);
    if (c) {
      setMode(c.data?.billingCycle === "Yearly" ? "yearly" : "monthly");
      setAmount(c.data?.contractAmount ? String(c.data.contractAmount) : "");
    }
  };
  const lastPeriod = mode === "yearly" ? endMonth : month;
  const suggestedStatus =
    lastPeriod && lastPeriod < currentMonth() ? "Paid" : "Pending";
  const cur = client?.data?.currency || "INR";
  const months = monthCount(startMonth, endMonth);
  const gstBody = {
    enabled: gstOn,
    rate: Number(gstRate),
    supplyType,
    sac,
  };
  const clientGstin = client?.data?.gstin;
  const clientState = isValidGstin(clientGstin) ? gstinState(clientGstin) : null;
  const sellerState = gstinState(settings.gstin);
  const autoType =
    clientState && sellerState
      ? clientState.code === sellerState.code
        ? "intra"
        : "inter"
      : "intra";
  const effectiveType = supplyType === "auto" ? autoType : supplyType;

  const preview = async () => {
    setBusy(true);
    setError("");
    try {
      const body = {
        clientId,
        gst: gstBody,
        mode,
        amount: Number(amount),
        month,
        startMonth,
        endMonth,
        serviceCharge: charge,
        serviceChargePct: Number(chargePct),
      };
      const response = await call("/api/admin/invoices/preview", {
        token,
        method: "POST",
        body,
      });
      const data = await response.json();
      setPlan(data);
      setStatus((s) => (s === "Pending" || s === "Paid" ? suggestedStatus : s));
    } catch (err) {
      setError(err.message);
      setPlan(null);
    } finally {
      setBusy(false);
    }
  };
  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await call("/api/admin/invoices/generate", {
        token,
        method: "POST",
        body: {
          clientId,
          mode: plan.mode,
          amount: plan.total,
          items: plan.items.map(({ month: m, amount: a }) => ({
            month: m,
            amount: a,
          })),
          status,
          serviceCharge: charge,
          serviceChargePct: Number(chargePct),
          gst: gstBody,
        },
      });
      const data = await response.json();
      setResult(data);
      await onDone(data.count);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const planSum = plan
    ? plan.items.reduce((s, i) => s + Math.round(i.amount * 100), 0) / 100
    : 0;

  return (
    <div className="cl-modal-backdrop" onMouseDown={onClose}>
      <div
        className="cl-record-editor cl-invoice-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cl-modal-head">
          <div>
            <span className="cl-eyebrow">INVOICE GENERATOR</span>
            <h2>Generate invoices</h2>
            <p>Nothing is saved until you press Generate.</p>
          </div>
          <button
            type="button"
            className="cl-icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {error && <div className="cl-alert error">{error}</div>}

        {result ? (
          <>
            <div className="cl-alert success">
              <Check size={15} />
              {result.count} invoice{result.count === 1 ? "" : "s"} created for{" "}
              {client?.data?.name}.
            </div>
            <div className="cl-modal-footer">
              <button className="cl-button secondary" onClick={onClose}>
                Close
              </button>
              <button
                className="cl-button primary"
                onClick={() =>
                  onDownloadBatch(result.batchId).catch((e) =>
                    setError(e.message),
                  )
                }
              >
                <Download size={14} /> Download{" "}
                {result.count > 1 ? "all as one PDF" : "PDF"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="cl-record-fields">
              <label className="cl-field wide">
                <span>
                  Client company<em>*</em>
                </span>
                <select
                  value={clientId}
                  onChange={(e) => pickClient(e.target.value)}
                >
                  {clients.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.data?.name || c.title} · {c.data?.code}
                    </option>
                  ))}
                </select>
              </label>
              <div className="cl-field wide">
                <span>Invoice for</span>
                <div className="cl-segment">
                  <button
                    type="button"
                    className={mode === "monthly" ? "on" : ""}
                    onClick={() => {
                      setMode("monthly");
                      invalidate();
                    }}
                  >
                    One month
                  </button>
                  <button
                    type="button"
                    className={mode === "yearly" ? "on" : ""}
                    onClick={() => {
                      setMode("yearly");
                      invalidate();
                    }}
                  >
                    Whole year (split by month)
                  </button>
                </div>
              </div>
              {mode === "monthly" ? (
                <label className="cl-field">
                  <span>
                    Month<em>*</em>
                  </span>
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => {
                      setMonth(e.target.value);
                      invalidate();
                    }}
                    placeholder="YYYY-MM"
                  />
                </label>
              ) : (
                <>
                  <label className="cl-field">
                    <span>
                      From month<em>*</em>
                    </span>
                    <input
                      type="month"
                      value={startMonth}
                      placeholder="YYYY-MM"
                      onChange={(e) => {
                        setStartMonth(e.target.value);
                        if (/^\d{4}-\d{2}$/.test(e.target.value))
                          setEndMonth(addMonths(e.target.value, 11));
                        invalidate();
                      }}
                    />
                  </label>
                  <label className="cl-field">
                    <span>
                      To month<em>*</em>
                    </span>
                    <input
                      type="month"
                      value={endMonth}
                      placeholder="YYYY-MM"
                      onChange={(e) => {
                        setEndMonth(e.target.value);
                        invalidate();
                      }}
                    />
                    <small className="cl-field-hint">
                      {months > 0
                        ? `${months} month${months === 1 ? "" : "s"} · `
                        : ""}
                      Default is 12 months from the start. Change it if you want
                      a different range.
                    </small>
                  </label>
                </>
              )}
              <label className="cl-field">
                <span>
                  {mode === "yearly"
                    ? `Total yearly amount (${cur})`
                    : `Amount (${cur})`}
                  <em>*</em>
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    invalidate();
                  }}
                />
              </label>
              <label className="cl-field">
                <span>Invoice status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {["Pending", "Paid", "Draft", "Overdue"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <small className="cl-field-hint">
                  {suggestedStatus === "Paid"
                    ? "Past period — “Paid” is usually right."
                    : "Current or future period — “Pending” is usually right."}
                </small>
              </label>
              <div className="cl-field wide cl-charge-box">
                <label className="cl-check">
                  <input
                    type="checkbox"
                    checked={charge}
                    onChange={(e) => {
                      setCharge(e.target.checked);
                      invalidate();
                    }}
                  />{" "}
                  <span>Add Mindboxx service charge</span>
                </label>
                {charge && (
                  <div className="cl-charge-input">
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={chargePct}
                      onChange={(e) => {
                        setChargePct(e.target.value);
                        invalidate();
                      }}
                    />
                    <b>% on top of the amount above</b>
                  </div>
                )}
                <small className="cl-field-hint">
                  {charge
                    ? "Shown as a separate line on every invoice. The amount you enter stays as the base."
                    : "Leave off and no service charge appears on the invoices."}
                </small>
              </div>
              <div className="cl-field wide cl-charge-box cl-gst-box">
                <label className="cl-check">
                  <input
                    type="checkbox"
                    checked={gstOn}
                    disabled={!gstReady}
                    onChange={(e) => {
                      setGstOn(e.target.checked);
                      invalidate();
                    }}
                  />{" "}
                  <span>Add GST to these invoices (Tax Invoice)</span>
                </label>
                {!gstReady && (
                  <small className="cl-field-hint">
                    Add your company GSTIN first.{" "}
                    {onOpenSettings && (
                      <button
                        type="button"
                        className="cl-link"
                        onClick={() => {
                          onClose();
                          onOpenSettings();
                        }}
                      >
                        Open Settings → GST details
                      </button>
                    )}
                  </small>
                )}
                {gstOn && (
                  <>
                    <div className="cl-gst-grid">
                      <label className="cl-field">
                        <span>GST rate</span>
                        <select
                          value={GST_RATES.includes(Number(gstRate)) ? gstRate : "custom"}
                          onChange={(e) => {
                            setGstRate(e.target.value === "custom" ? "" : e.target.value);
                            invalidate();
                          }}
                        >
                          {GST_RATES.map((r) => (
                            <option key={r} value={r}>
                              {r}%
                            </option>
                          ))}
                          <option value="custom">Custom…</option>
                        </select>
                        {!GST_RATES.includes(Number(gstRate)) && (
                          <input
                            type="number"
                            min="0.01"
                            max="40"
                            step="0.01"
                            placeholder="Rate %"
                            value={gstRate}
                            onChange={(e) => {
                              setGstRate(e.target.value);
                              invalidate();
                            }}
                          />
                        )}
                      </label>
                      <label className="cl-field">
                        <span>Tax type</span>
                        <select
                          value={supplyType}
                          onChange={(e) => {
                            setSupplyType(e.target.value);
                            invalidate();
                          }}
                        >
                          <option value="auto">
                            Auto ({autoType === "inter" ? "IGST" : "CGST + SGST"})
                          </option>
                          <option value="intra">CGST + SGST (same state)</option>
                          <option value="inter">IGST (other state)</option>
                        </select>
                      </label>
                      <label className="cl-field">
                        <span>SAC / HSN code</span>
                        <input
                          value={sac}
                          inputMode="numeric"
                          onChange={(e) => {
                            setSac(e.target.value.replace(/\D/g, "").slice(0, 8));
                            invalidate();
                          }}
                        />
                      </label>
                    </div>
                    <small className="cl-field-hint">
                      GST is added on top of the amount{charge ? " plus the service charge" : ""}. Your GSTIN
                      {clientGstin ? " and the client's GSTIN appear" : " appears"} on the
                      invoices.
                      {supplyType === "auto" &&
                        !clientState &&
                        " Client has no valid GSTIN, so same-state tax is assumed — change Tax type if they are in another state."}
                      {effectiveType === "inter" ? " Charged as IGST." : " Charged as CGST + SGST."}
                    </small>
                  </>
                )}
                {!gstOn && gstReady && (
                  <small className="cl-field-hint">
                    Off: a plain invoice with no GST and no GSTIN on it.
                  </small>
                )}
              </div>
            </div>

            {plan && (
              <div className="cl-split-preview">
                <div className="cl-split-head">
                  <b>
                    {plan.mode === "yearly"
                      ? `${plan.count} monthly invoices`
                      : "1 invoice"}
                  </b>
                  {plan.mode === "yearly" && (
                    <button
                      type="button"
                      className="cl-button secondary small"
                      onClick={preview}
                      disabled={busy}
                    >
                      <Shuffle size={13} /> Split again
                    </button>
                  )}
                </div>
                <div className="cl-table-scroll">
                  <table className="cl-table">
                    <thead>
                      <tr>
                        <th>MONTH</th>
                        <th>AMOUNT</th>
                        {plan.serviceChargePct > 0 && (
                          <th>MINDBOXX CHARGE ({plan.serviceChargePct}%)</th>
                        )}
                        {plan.gst && (
                          <th>
                            {plan.gst.supplyType === "inter"
                              ? `IGST (${plan.gst.rate}%)`
                              : `CGST + SGST (${plan.gst.rate}%)`}
                          </th>
                        )}
                        {(plan.serviceChargePct > 0 || plan.gst) && (
                          <th>INVOICE TOTAL</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.items.map((i) => (
                        <tr key={i.month}>
                          <td>{i.label}</td>
                          <td>{money(i.amount, cur)}</td>
                          {plan.serviceChargePct > 0 && (
                            <td>{money(i.charge, cur)}</td>
                          )}
                          {plan.gst && <td>{money(i.gstAmount, cur)}</td>}
                          {(plan.serviceChargePct > 0 || plan.gst) && (
                            <td>{money(i.total, cur)}</td>
                          )}
                        </tr>
                      ))}
                      <tr className="cl-split-total">
                        <td>
                          <b>Total</b>
                        </td>
                        <td>
                          <b>{money(planSum, cur)}</b>
                          {Math.abs(planSum - plan.total) < 0.005 && (
                            <span className="cl-split-ok">
                              <Check size={12} /> matches
                            </span>
                          )}
                        </td>
                        {plan.serviceChargePct > 0 && (
                          <td>
                            <b>{money(plan.chargeTotal, cur)}</b>
                          </td>
                        )}
                        {plan.gst && (
                          <td>
                            <b>{money(plan.gstTotal, cur)}</b>
                          </td>
                        )}
                        {(plan.serviceChargePct > 0 || plan.gst) && (
                          <td>
                            <b>{money(plan.grandTotal, cur)}</b>
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="cl-modal-footer">
              <button
                type="button"
                className="cl-button secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              {!plan ? (
                <button
                  className="cl-button primary"
                  onClick={preview}
                  disabled={busy || !clientId || !(Number(amount) > 0)}
                >
                  {busy
                    ? "Working…"
                    : mode === "yearly"
                      ? "Preview split"
                      : "Preview invoice"}{" "}
                  <ArrowUpRight size={14} />
                </button>
              ) : (
                <button
                  className="cl-button primary"
                  onClick={generate}
                  disabled={busy}
                >
                  {busy
                    ? "Generating…"
                    : `Generate ${plan.count} invoice${plan.count === 1 ? "" : "s"}`}{" "}
                  <Check size={14} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
