import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
  ChevronRight,
  Edit3,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Plus,
  ReceiptText,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
  Clock3,
  CircleCheck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import InvoiceManager from "./InvoiceManager.jsx";
import mindtreeLogo from "./assets/images/recta.png";
import { DEFAULT_SAC, GST_RATES, cleanGstin, gstinState, isValidGstin } from "./gst.js";

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
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const shortMonth = (key) => {
  const [y, m] = String(key).split("-").map(Number);
  return y
    ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${String(y).slice(2)}`
    : key;
};
const monthOf = (i) =>
  i.data?.periodMonth || String(i.data?.issueDate || "").slice(0, 7);

const NAV = [
  ["Dashboard", LayoutDashboard],
  ["Clients", Building2],
  ["Invoices", ReceiptText],
  ["Settings", Settings],
  ["Audit log", ShieldCheck],
];
const DESCRIPTIONS = {
  Clients:
    "Add the client companies you bill and the amount they pay, monthly or yearly.",
  Invoices:
    "Generate monthly or yearly invoices from an amount, download them as PDF, and track payment.",
  Settings:
    "Your company name and contact details appear on every invoice PDF.",
  "Audit log": "Latest changes made by signed-in administrators.",
};
const settingFields = [
  ["organizationName", "Your company name (shown on invoices)"],
  ["brandName", "Portal brand name"],
  ["supportEmail", "Support email", "email"],
  ["supportUrl", "Website (shown on invoices)"],
  ["workspaceLabel", "Tagline under company name on invoices"],
  [
    "currency",
    "Default currency",
    "select",
    ["INR", "USD", "EUR", "GBP", "SGD", "AED"],
  ],
  ["invoicePrefix", "Invoice number prefix (e.g. INV)"],
  ["footerText", "Invoice / portal footer text"],
  ["helpText", "Help text shown to customers"],
  ["logoUrl", "Logo image URL", "url"],
];
const clientFields = [
  ["name", "Company name", "text", true],
  ["billingCycle", "Billing", "select", true, ["Monthly", "Yearly"]],
  ["contractAmount", "Amount (per month or per year)", "number", true],
  ["contactName", "Contact person"],
  ["email", "Email", "email"],
  ["phone", "Phone"],
  ["gstin", "GSTIN / tax ID"],
  ["address", "Billing address", "textarea"],
];

async function api(path, { token, ...options } = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.message || `Request failed (${response.status})`);
  return payload;
}

function App() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("cloudledger_admin_token") || "",
  );
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState("Dashboard");
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState({});
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [clientEditor, setClientEditor] = useState(null);
  const [generateFor, setGenerateFor] = useState("");
  const [settingsDraft, setSettingsDraft] = useState({});
  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: "",
    newPassword: "",
  });

  const loadWorkspace = async (currentToken) => {
    setLoading(true);
    setError("");
    try {
      const [r, s, a] = await Promise.all([
        api("/api/admin/records", { token: currentToken }),
        api("/api/admin/settings", { token: currentToken }),
        api("/api/admin/audit", { token: currentToken }),
      ]);
      setRecords(r.records || []);
      setSettings(s.settings || {});
      setSettingsDraft(s.settings || {});
      setAudit(a.logs || []);
    } catch (err) {
      if (/session|sign in|expired|administrator/i.test(err.message)) logout();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setAuthReady(true);
      return undefined;
    }
    api("/api/auth/me", { token })
      .then(({ user: u }) => {
        if (!cancelled) {
          setUser(u);
          setAuthReady(true);
          loadWorkspace(token);
        }
      })
      .catch(() => {
        sessionStorage.removeItem("cloudledger_admin_token");
        if (!cancelled) {
          setToken("");
          setUser(null);
          setAuthReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const logout = () => {
    sessionStorage.removeItem("cloudledger_admin_token");
    setToken("");
    setUser(null);
    setRecords([]);
    setSettings({});
    setAudit([]);
    setPage("Dashboard");
  };
  const login = async (credentials) => {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    sessionStorage.setItem("cloudledger_admin_token", result.token);
    setUser(result.user);
    setToken(result.token);
    setAuthReady(true);
  };
  const refresh = () => loadWorkspace(token);
  const go = (next) => {
    setPage(next);
    setMobileNav(false);
    setError("");
  };
  const clients = useMemo(
    () => records.filter((r) => r.type === "clients"),
    [records],
  );
  const invoices = useMemo(
    () => records.filter((r) => r.type === "invoices"),
    [records],
  );
  const currency = settings.currency || "INR";

  const saveClient = async (values, record) => {
    const body = {
      type: "clients",
      title: values.name,
      data: { ...(record?.data || {}), ...values },
      isActive: true,
      sortOrder: 0,
    };
    if (record)
      await api(`/api/admin/records/${record._id}`, {
        token,
        method: "PUT",
        body: JSON.stringify(body),
      });
    else
      await api("/api/admin/records", {
        token,
        method: "POST",
        body: JSON.stringify(body),
      });
    setClientEditor(null);
    setNotice(record ? "Client updated." : "Client added.");
    await refresh();
  };
  const deleteRecord = async (record, label) => {
    if (
      !window.confirm(
        label || `Delete “${record.title}”? This cannot be undone.`,
      )
    )
      return;
    try {
      await api(`/api/admin/records/${record._id}`, {
        token,
        method: "DELETE",
      });
      setNotice("Deleted.");
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };
  const setInvoiceStatus = async (record, status) => {
    try {
      await api(`/api/admin/records/${record._id}`, {
        token,
        method: "PUT",
        body: JSON.stringify({
          title: record.title,
          data: { ...record.data, status },
          isActive: record.isActive,
          sortOrder: record.sortOrder,
        }),
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };
  const saveSettings = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const result = await api("/api/admin/settings", {
        token,
        method: "PUT",
        body: JSON.stringify({ settings: { ...settings, ...settingsDraft } }),
      });
      setSettings(result.settings);
      setSettingsDraft(result.settings);
      setNotice("Settings saved.");
    } catch (err) {
      setError(err.message);
    }
  };
  const changePassword = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const r = await api("/api/auth/password", {
        token,
        method: "PUT",
        body: JSON.stringify(passwordDraft),
      });
      setNotice(r.message);
      setPasswordDraft({ currentPassword: "", newPassword: "" });
    } catch (err) {
      setError(err.message);
    }
  };

  if (!authReady)
    return (
      <div className="cl-loading">
        <div className="cl-spinner" />
        <span>Checking administrator session…</span>
      </div>
    );
  if (!token || !user) return <Login onLogin={login} />;

  return (
    <div
      className="cl-shell"
      style={{ "--cl-accent": settings.accentColor || "#cdd2d9" }}
    >
      <aside className={`cl-sidebar ${mobileNav ? "is-open" : ""}`}>
        <div className={`cl-brand ${settings.logoUrl ? "" : "cl-brand-logo-mode"}`}>
          <div
            className={`cl-brand-mark ${settings.logoUrl ? "" : "cl-brand-mark-logo"}`}
          >
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="" />
            ) : (
              <img className="ml-7" src={mindtreeLogo} alt="Mindtree Communications" />
            )}
          </div>
          <div>
            {settings.logoUrl && <b>{settings.brandName || "Mindtree"}</b>}
            <span className="ml-20">ADMIN</span>
          </div>
          <button
            className="cl-mobile-close"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="cl-nav-group">
          {NAV.map(([label, Icon]) => (
            <button
              key={label}
              className={`cl-nav-item ${page === label ? "active" : ""}`}
              onClick={() => go(label)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="cl-sidebar-bottom">
          <div className="cl-user">
            <div className="cl-user-avatar">
              {(user.name || user.email || "A").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <b>{user.name || "Administrator"}</b>
              <span>{user.email}</span>
            </div>
            <button title="Sign out" onClick={logout}>
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="cl-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close menu"
        />
      )}
      <main className="cl-main">
        <header className="cl-topbar">
          <div className="cl-top-left">
            <button
              className="cl-menu-button"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={19} />
            </button>
            <span>Admin</span>
            <ChevronRight size={14} />
            <b>{page}</b>
          </div>
        </header>
        <div className="cl-page-wrap">
          <div className="cl-page-heading">
            <div>
              <h1>{page === "Dashboard" ? "Overview" : page}</h1>
              <p>
                {page === "Dashboard"
                  ? "Clients, what has been invoiced and what is still unpaid."
                  : DESCRIPTIONS[page]}
              </p>
            </div>
            <div className="cl-heading-actions">
              <button
                className="cl-button secondary"
                onClick={refresh}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? "cl-spin" : ""} />{" "}
                Refresh
              </button>
              {page === "Clients" && (
                <button
                  className="cl-button primary"
                  onClick={() => setClientEditor({ record: null })}
                >
                  <Plus size={15} /> Add client
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="cl-alert error">
              <X size={15} />
              {error}
              <button onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {notice && (
            <div className="cl-alert success">
              <Check size={15} />
              {notice}
              <button onClick={() => setNotice("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {loading && (
            <div className="cl-inline-loading">
              <div className="cl-spinner small" /> Loading…
            </div>
          )}
          {!loading && page === "Dashboard" && (
            <Dashboard
              clients={clients}
              invoices={invoices}
              currency={currency}
              go={go}
            />
          )}
          {!loading && page === "Clients" && (
            <ClientList
              clients={clients}
              invoices={invoices}
              currency={currency}
              onAdd={() => setClientEditor({ record: null })}
              onEdit={(record) => setClientEditor({ record })}
              onGenerate={(record) => {
                setGenerateFor(record._id);
                go("Invoices");
              }}
              onDelete={(record) =>
                deleteRecord(
                  record,
                  `Delete client “${record.title}”? Their invoices are kept.`,
                )
              }
            />
          )}
          {!loading && page === "Invoices" && (
            <InvoiceManager
              token={token}
              invoices={invoices}
              clients={clients}
              currency={currency}
              settings={settings}
              onOpenSettings={() => setPage("Settings")}
              preselect={generateFor}
              onPreselectUsed={() => setGenerateFor("")}
              onStatus={setInvoiceStatus}
              onDelete={(r) => deleteRecord(r)}
              refresh={refresh}
              setNotice={setNotice}
              setError={setError}
            />
          )}
          {!loading && page === "Settings" && (
            <SettingsPage
              draft={settingsDraft}
              setDraft={setSettingsDraft}
              onSave={saveSettings}
              passwordDraft={passwordDraft}
              setPasswordDraft={setPasswordDraft}
              onChangePassword={changePassword}
            />
          )}
          {!loading && page === "Audit log" && <AuditPage audit={audit} />}
        </div>
      </main>
      {clientEditor && (
        <ClientEditor
          record={clientEditor.record}
          onClose={() => setClientEditor(null)}
          onSave={saveClient}
        />
      )}
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin({ email, password });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cl-login-shell">
      <div className="cl-login-side">
        <div className="cl-login-brand">
          <span className="cl-login-logo">
            <img src={mindtreeLogo} alt="Mindtree Communications" />
          </span>
          <b>Mindtree</b>
        </div>
        <div className="cl-login-pitch">
          <div className="cl-eyebrow">
            <i /> ADMINISTRATOR ACCESS
          </div>
          <h1>
            Your operations.
            <br />
            Your data.
            <br />
            <em>One workspace.</em>
          </h1>
          <p>
            Manage client accounts, infrastructure inventory, usage, billing and
            the content shown across your console.
          </p>
        </div>
        <div className="cl-login-foot">
          Node.js API <b>·</b> MongoDB <b>·</b> Private admin workspace
        </div>
      </div>
      <div className="cl-login-form-wrap">
        <form className="cl-login-card" onSubmit={submit}>
          <div className="cl-login-icon">
            <Lock size={20} />
          </div>
          <span className="cl-eyebrow">SECURE SIGN IN</span>
          <h2>Welcome back</h2>
          <p>
            Sign in with the administrator account configured on your server.
          </p>
          {error && <div className="cl-alert error">{error}</div>}
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@yourcompany.com"
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="cl-button primary full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in to admin"}{" "}
            <ArrowUpRight size={15} />
          </button>
          <small>
            Admin access is provisioned through the server environment. There is
            no public sign-up.
          </small>
        </form>
      </div>
    </div>
  );
}

function Dashboard({ clients, invoices, currency, go }) {
  const sum = (list) =>
    list.reduce((s, r) => s + Number(r.data?.amount || 0), 0);
  const total = sum(invoices);
  const paid = sum(
    invoices.filter((r) => String(r.data?.status).toLowerCase() === "paid"),
  );
  const due = sum(
    invoices.filter((r) =>
      ["pending", "overdue"].includes(String(r.data?.status).toLowerCase()),
    ),
  );
  const byMonth = Object.entries(
    invoices.reduce((acc, r) => {
      const k = monthOf(r);
      acc[k] = (acc[k] || 0) + Number(r.data?.amount || 0);
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([k, v]) => ({ label: shortMonth(k), amount: v }));
  const recent = [...invoices]
    .sort((a, b) => monthOf(b).localeCompare(monthOf(a)))
    .slice(0, 6);
  const stats = [
    ["Clients", clients.length, "Companies billed", Building2],
    [
      "Total invoiced",
      money(total, currency),
      `${invoices.length} invoices`,
      ReceiptText,
    ],
    ["Paid", money(paid, currency), "Received", CircleCheck],
    ["Outstanding", money(due, currency), "Pending or overdue", Clock3],
  ];
  return (
    <>
      <div className="cl-stat-grid">
        {stats.map(([label, value, foot, Icon]) => (
          <div className="cl-stat-card" key={label}>
            <div className="cl-stat-top">
              <span>{label}</span>
              <span className="cl-stat-icon">
                <Icon size={16} />
              </span>
            </div>
            <strong>{value}</strong>
            <small>{foot}</small>
          </div>
        ))}
      </div>
      <div className="cl-lower-grid">
        <section className="cl-panel cl-chart-panel">
          <div className="cl-panel-head">
            <div>
              <h3>Invoiced per month</h3>
              <p>Last 12 months with invoices, all clients</p>
            </div>
          </div>
          {byMonth.length ? (
            <div className="cl-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byMonth}>
                  <CartesianGrid stroke="#252c35" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#8993a0", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#8993a0", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickFormatter={(v) =>
                      v >= 100000
                        ? `${(v / 100000).toFixed(1)}L`
                        : v >= 1000
                          ? `${Math.round(v / 1000)}k`
                          : v
                    }
                  />
                  <Tooltip
                    formatter={(v) => money(v, currency)}
                    contentStyle={{
                      background: "#151b23",
                      border: "1px solid #303944",
                      borderRadius: 8,
                      color: "#e6e9ed",
                      fontSize: 11,
                    }}
                    cursor={{ fill: "#ffffff0d" }}
                  />
                  <Bar dataKey="amount" fill="#aeb8c6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="cl-empty">
              <h3>No invoices yet</h3>
              <p>Add a client, then generate their invoices.</p>
              <button
                className="cl-button secondary small"
                onClick={() => go("Clients")}
              >
                Go to clients <ArrowUpRight size={13} />
              </button>
            </div>
          )}
        </section>
        <section className="cl-panel">
          <div className="cl-panel-head">
            <div>
              <h3>Recent invoices</h3>
            </div>
            <button className="cl-text-button" onClick={() => go("Invoices")}>
              View all <ArrowUpRight size={14} />
            </button>
          </div>
          {recent.length ? (
            <div className="cl-invoice-list">
              {recent.map((r) => (
                <div className="cl-invoice-row" key={r._id}>
                  <span className="cl-file-icon">
                    <FileText size={15} />
                  </span>
                  <span>
                    <b>{r.data?.number || r.title}</b>
                    <small>
                      {r.data?.clientName} · {r.data?.periodLabel}
                    </small>
                  </span>
                  <span className="cl-invoice-end">
                    <b>{money(r.data?.amount, r.data?.currency || currency)}</b>
                    <Status value={r.data?.status} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="cl-help-contact">Nothing yet.</p>
          )}
        </section>
      </div>
    </>
  );
}

function ClientList({
  clients,
  invoices,
  currency,
  onAdd,
  onEdit,
  onGenerate,
  onDelete,
}) {
  if (!clients.length)
    return (
      <section className="cl-panel">
        <div className="cl-empty">
          <div className="cl-empty-icon">
            <Building2 size={20} />
          </div>
          <h3>No clients yet</h3>
          <p>
            Add a company and the amount it pays (monthly or yearly). Then
            generate its invoices.
          </p>
          <button className="cl-button primary small" onClick={onAdd}>
            <Plus size={14} /> Add client
          </button>
        </div>
      </section>
    );
  return (
    <section className="cl-panel cl-table-panel">
      <div className="cl-table-scroll">
        <table className="cl-table">
          <thead>
            <tr>
              <th>COMPANY</th>
              <th>BILLING</th>
              <th>AMOUNT</th>
              <th>INVOICES</th>
              <th>INVOICED TOTAL</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((r) => {
              const mine = invoices.filter(
                (i) => i.data?.clientCode === r.data?.code,
              );
              const cycle =
                r.data?.billingCycle === "Yearly" ? "year" : "month";
              return (
                <tr key={r._id}>
                  <td>
                    <b>{r.data?.name || r.title}</b>
                    <small>{r.data?.code}</small>
                  </td>
                  <td>{r.data?.billingCycle}</td>
                  <td>
                    {money(
                      r.data?.contractAmount,
                      r.data?.currency || currency,
                    )}{" "}
                    / {cycle}
                  </td>
                  <td>{mine.length}</td>
                  <td>
                    {money(
                      mine.reduce((s, i) => s + Number(i.data?.amount || 0), 0),
                      r.data?.currency || currency,
                    )}
                  </td>
                  <td>
                    <div className="cl-row-actions">
                      <button
                        className="cl-button primary small"
                        onClick={() => onGenerate(r)}
                      >
                        <ReceiptText size={13} /> Generate invoices
                      </button>
                      <button
                        className="cl-icon-button"
                        title="Edit"
                        onClick={() => onEdit(r)}
                      >
                        <Edit3 size={14} />
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
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClientEditor({ record, onClose, onSave }) {
  const [values, setValues] = useState(() => ({
    ...Object.fromEntries(
      clientFields.map(([k]) => [k, record?.data?.[k] ?? ""]),
    ),
    billingCycle: record?.data?.billingCycle || "Monthly",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const amount = Number(values.contractAmount);
      if (!values.name.trim()) throw new Error("Enter the company name.");
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("Enter an amount greater than zero.");
      await onSave(
        { ...values, name: values.name.trim(), contractAmount: amount },
        record,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cl-modal-backdrop" onMouseDown={onClose}>
      <form
        className="cl-record-editor cl-invoice-modal"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cl-modal-head">
          <div>
            <span className="cl-eyebrow">CLIENT COMPANY</span>
            <h2>{record ? "Edit client" : "Add client"}</h2>
            <p>
              Only the first three fields are required. The rest appear on the
              invoice PDF.
            </p>
          </div>
          <button type="button" className="cl-icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {error && <div className="cl-alert error">{error}</div>}
        <div className="cl-record-fields">
          {clientFields.map(
            ([key, label, type = "text", required, options]) => (
              <label
                key={key}
                className={`cl-field ${type === "textarea" ? "wide" : ""}`}
              >
                <span>
                  {label}
                  {required && <em>*</em>}
                </span>
                {type === "select" ? (
                  <select
                    value={values[key]}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [key]: e.target.value }))
                    }
                  >
                    {options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : type === "textarea" ? (
                  <textarea
                    rows={3}
                    value={values[key]}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [key]: e.target.value }))
                    }
                  />
                ) : (
                  <input
                    type={type}
                    min={type === "number" ? 0 : undefined}
                    step={type === "number" ? "0.01" : undefined}
                    value={values[key]}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [key]: e.target.value }))
                    }
                    required={required}
                  />
                )}
              </label>
            ),
          )}
        </div>
        <div className="cl-modal-footer">
          <button
            type="button"
            className="cl-button secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="cl-button primary" disabled={busy}>
            {busy ? "Saving…" : record ? "Save changes" : "Add client"}{" "}
            <Check size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}

function GstSettings({ draft, setDraft }) {
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const on = Boolean(draft.gstRegistered);
  const gstin = cleanGstin(draft.gstin);
  const state = gstinState(gstin);
  const valid = isValidGstin(gstin);
  return (
    <div className="cl-gst-settings">
      <div className="cl-panel-head">
        <div>
          <h3>GST details</h3>
          <p>
            Your GSTIN is printed only on invoices where you switch GST on.
            Other bills never show it.
          </p>
        </div>
      </div>
      <label className="cl-check cl-gst-toggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => set("gstRegistered", e.target.checked)}
        />{" "}
        <span>My company is registered under GST</span>
      </label>
      {on && (
        <div className="cl-settings-grid">
          <label className="cl-field">
            <span>
              Your GSTIN<em>*</em>
            </span>
            <input
              value={draft.gstin || ""}
              maxLength={15}
              placeholder="27AAPFU0939F1ZV"
              onChange={(e) => set("gstin", cleanGstin(e.target.value))}
            />
            <small
              className={`cl-field-hint ${gstin.length === 15 && !valid ? "cl-bad" : ""}`}
            >
              {gstin.length < 15
                ? "15 characters. The first two digits are your state code."
                : valid
                  ? `Valid · registered in ${state.name} (${state.code})`
                  : "Not a valid GSTIN — check the state code and the last character."}
            </small>
          </label>
          <label className="cl-field">
            <span>Default SAC / HSN code</span>
            <input
              value={draft.gstSac || ""}
              placeholder={DEFAULT_SAC}
              inputMode="numeric"
              onChange={(e) => set("gstSac", e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
            <small className="cl-field-hint">
              998315 = hosting & IT infrastructure services.
            </small>
          </label>
          <label className="cl-field">
            <span>Default GST rate</span>
            <select
              value={draft.gstDefaultRate || "18"}
              onChange={(e) => set("gstDefaultRate", e.target.value)}
            >
              {GST_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
          </label>
          <label className="cl-field">
            <span>Switch GST on by default for new invoices</span>
            <select
              value={draft.gstDefaultOn ? "yes" : "no"}
              onChange={(e) => set("gstDefaultOn", e.target.value === "yes")}
            >
              <option value="no">No — I decide each time</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <label className="cl-field wide">
            <span>Registered address (printed on GST invoices)</span>
            <textarea
              rows={2}
              value={draft.gstAddress || ""}
              onChange={(e) => set("gstAddress", e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function SettingsPage({
  draft,
  setDraft,
  onSave,
  passwordDraft,
  setPasswordDraft,
  onChangePassword,
}) {
  return (
    <div className="cl-settings-layout">
      <form className="cl-panel cl-settings-form" onSubmit={onSave}>
        <div className="cl-panel-head">
          <div>
            <h3>Company details</h3>
          </div>
        </div>
        <div className="cl-settings-grid">
          {settingFields.map(([key, label, type = "text", options]) => (
            <label key={key} className="cl-field">
              <span>{label}</span>
              {type === "select" ? (
                <select
                  value={draft[key] || "INR"}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                >
                  {options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={type}
                  value={draft[key] || ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                />
              )}
            </label>
          ))}
        </div>
        <GstSettings draft={draft} setDraft={setDraft} />
        <div className="cl-form-footer">
          <span>Applies to invoices generated or downloaded from now on.</span>
          <button className="cl-button primary">
            Save settings <Check size={14} />
          </button>
        </div>
      </form>
      <form className="cl-panel cl-password-form" onSubmit={onChangePassword}>
        <div className="cl-panel-head">
          <div>
            <h3>Administrator password</h3>
          </div>
        </div>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={passwordDraft.currentPassword}
            onChange={(e) =>
              setPasswordDraft((v) => ({
                ...v,
                currentPassword: e.target.value,
              }))
            }
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={passwordDraft.newPassword}
            onChange={(e) =>
              setPasswordDraft((v) => ({ ...v, newPassword: e.target.value }))
            }
            required
          />
          <small>At least 12 characters.</small>
        </label>
        <button className="cl-button secondary">Update password</button>
      </form>
    </div>
  );
}

function AuditPage({ audit }) {
  return (
    <section className="cl-panel cl-table-panel">
      <PanelHeader
        title="Administrator audit log"
        subtitle="Latest 100 create, update, delete and settings events"
      />
      {audit.length ? (
        <div className="cl-audit-list">
          {audit.map((log) => (
            <div className="cl-audit-row" key={log._id}>
              <span className="cl-audit-icon">
                <ShieldCheck size={15} />
              </span>
              <div>
                <b>
                  {log.action}
                  {log.recordType
                    ? ` · ${typeLabels[log.recordType] || log.recordType}`
                    : ""}
                </b>
                <p>{log.title || log.actor || "Workspace settings"}</p>
                <small>
                  {log.actor || "Administrator"} ·{" "}
                  {new Date(log.createdAt).toLocaleString("en-IN")}
                </small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No administrator activity yet"
          text="Changes made through the admin manager and settings page will appear here."
        />
      )}
    </section>
  );
}

function Status({ value }) {
  const text = value || "Not set";
  return (
    <span
      className={`cl-status ${String(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`}
    >
      {text}
    </span>
  );
}
function EmptyState({ title, text }) {
  return (
    <div className="cl-empty">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export default App;
