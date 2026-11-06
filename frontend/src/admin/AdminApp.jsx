import React, { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cloud,
  CreditCard,
  Database,
  Edit3,
  FileText,
  Gauge,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { makeLiveUsageSeries } from "../shared/liveTelemetry.js";
import {
  getClientPricing,
  getBillingAccrual,
  estimateCapacity,
  buildEstimatedResources,
} from "../shared/pricingModel.js";

const API = import.meta.env.VITE_API_URL || "";
const money = (value, currency = "INR") => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-IN")}`;
  }
};
const asText = (value) =>
  value === null || value === undefined || value === ""
    ? "—"
    : Array.isArray(value)
      ? value.join(", ")
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
const dateText = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const typeLabels = {
  clients: "Clients",
  resources: "Infrastructure",
  costPlans: "Cost plans",
  invoices: "Invoices",
  transactions: "Transactions",
  integrations: "Integrations",
  dashboardCards: "Dashboard cards",
  contentBlocks: "Content blocks",
  activities: "Activity entries",
  companyProfiles: "Client environment profiles",
  deployments: "Deployments",
  runtimeSpecs: "Runtime specifications",
  codebaseFiles: "Codebase files",
  terminalEntries: "Console output",
};
const typeIcons = {
  clients: Building2,
  resources: Server,
  costPlans: Wallet,
  invoices: ReceiptText,
  transactions: CreditCard,
  integrations: Cloud,
  dashboardCards: Gauge,
  contentBlocks: FileText,
  activities: CalendarDays,
  companyProfiles: Building2,
  deployments: Activity,
  runtimeSpecs: Server,
  codebaseFiles: FileText,
  terminalEntries: Activity,
};
const typeConfigs = {
  clients: {
    titleField: "name",
    columns: ["billingCycle", "contractAmount", "monthlyCost", "dailyCost"],
    fields: [
      f("name", "Client / company name", "text", true),
      f("billingCycle", "Billing cycle", "select", true, "Monthly", [
        "Monthly",
        "Yearly",
      ]),
      f("contractAmount", "Monthly / yearly amount (INR)", "number", true, 0),
    ],
  },
  resources: {
    titleField: "name",
    columns: ["clientCode", "category", "provider", "region", "status"],
    fields: [
      f("name", "Resource / instance name", "text", true),
      f("clientCode", "Client code"),
      f("category", "Resource type"),
      f("provider", "Provider"),
      f("region", "Region / location"),
      f("environment", "Environment"),
      f("specification", "Configuration / specification"),
      f("cpuPercent", "CPU utilization (%)", "number"),
      f("memoryPercent", "Memory utilization (%)", "number"),
      f("storageGB", "Storage (GB)", "number"),
      f("monthlyCost", "Monthly cost", "number"),
      f("status", "Resource status", "select", false, "Running", [
        "Running",
        "Stopped",
        "Warning",
        "Maintenance",
        "Unknown",
      ]),
      f("endpoint", "Hostname / endpoint"),
      f("ipAddress", "IP address"),
      f("image", "Container image"),
      f("runtime", "Runtime"),
      f("memoryUsed", "Memory used / limit"),
      f("restarts", "Restart count", "number"),
      f("storageUsedGB", "Storage used (GB)", "number"),
      f("securityChecksPassed", "Security checks passed", "number"),
      f("notes", "Notes", "textarea"),
    ],
  },
  costPlans: {
    titleField: "name",
    columns: ["monthlyPrice", "billingCycle", "serversIncluded", "status"],
    fields: [
      f("name", "Plan name", "text", true),
      f("clientCode", "Client code (optional)"),
      f("description", "Description", "textarea"),
      f("monthlyPrice", "Monthly price", "number"),
      f("currency", "Currency", "text", false, "INR"),
      f("billingCycle", "Billing cycle", "select", false, "Monthly", [
        "Monthly",
        "Quarterly",
        "Yearly",
        "Custom",
      ]),
      f("serversIncluded", "Included servers", "number"),
      f("storageGB", "Included storage (GB)", "number"),
      f("features", "Plan features (comma separated)", "array"),
      f("overageRate", "Overage rate", "number"),
      f("status", "Status", "select", false, "Active", [
        "Active",
        "Draft",
        "Archived",
      ]),
    ],
  },
  invoices: {
    titleField: "number",
    columns: [
      "clientName",
      "billingCycle",
      "issueDate",
      "dueDate",
      "amount",
      "status",
    ],
    fields: [
      f("number", "Invoice number", "text", true),
      f("clientName", "Client name"),
      f("clientCode", "Client code"),
      f("billingCycle", "Billing cycle", "select", false, "Monthly", [
        "Weekly",
        "Monthly",
        "Yearly",
      ]),
      f("issueDate", "Issue date", "date"),
      f("dueDate", "Due date", "date"),
      f("amount", "Total amount", "number"),
      f("currency", "Currency", "text", false, "INR"),
      f("taxRate", "Tax rate (%)", "number"),
      f("status", "Invoice status", "select", false, "Draft", [
        "Draft",
        "Pending",
        "Paid",
        "Overdue",
        "Cancelled",
      ]),
      f("paymentTerms", "Payment terms"),
      f("pdfUrl", "Invoice PDF / document URL", "url"),
      f("lineItems", "Line items (JSON)", "json"),
      f("notes", "Notes", "textarea"),
    ],
  },
  transactions: {
    titleField: "reference",
    columns: [
      "clientName",
      "invoiceNumber",
      "date",
      "amount",
      "method",
      "status",
    ],
    fields: [
      f("reference", "Transaction reference", "text", true),
      f("clientName", "Client name"),
      f("clientCode", "Client code"),
      f("invoiceNumber", "Invoice number"),
      f("date", "Transaction date", "date"),
      f("amount", "Amount", "number"),
      f("currency", "Currency", "text", false, "INR"),
      f("method", "Payment method"),
      f("status", "Status", "select", false, "Completed", [
        "Completed",
        "Pending",
        "Failed",
        "Refunded",
      ]),
      f("notes", "Notes", "textarea"),
    ],
  },
  integrations: {
    titleField: "name",
    columns: ["provider", "accountName", "region", "status"],
    fields: [
      f("name", "Integration name", "text", true),
      f("clientCode", "Client code (optional)"),
      f("provider", "Provider"),
      f("accountName", "Account / workspace"),
      f("region", "Region"),
      f("status", "Connection status", "select", false, "Not connected", [
        "Connected",
        "Not connected",
        "Error",
        "Paused",
      ]),
      f("lastSyncedAt", "Last synced", "datetime-local"),
      f("description", "Description", "textarea"),
      f("notes", "Configuration notes", "textarea"),
    ],
  },
  dashboardCards: {
    titleField: "label",
    columns: ["clientCode"],
    fields: [
      f(
        "metric",
        "Choose a dashboard metric",
        "select",
        true,
        "contractAmount",
        [
          {
            value: "contractAmount",
            label: "Agreed contract amount (monthly / yearly)",
          },
          {
            value: "todayAccruedCost",
            label: "Today's accrued cost (updates live)",
          },
          { value: "cpuUtilization", label: "Average CPU utilization" },
          { value: "memoryUsage", label: "Average memory usage" },
          { value: "networkThroughput", label: "Network throughput" },
          { value: "storageCapacity", label: "Storage capacity" },
          { value: "runningResources", label: "Running resources" },
          { value: "invoiceCount", label: "Invoice count" },
          { value: "outstandingAmount", label: "Outstanding invoice amount" },
          { value: "connectedIntegrations", label: "Connected integrations" },
        ],
      ),
      f("clientCode", "Client assignment (optional)"),
    ],
  },
  contentBlocks: {
    titleField: "title",
    columns: ["placement", "order", "enabled"],
    fields: [
      f("title", "Block title", "text", true),
      f("clientCode", "Client code (optional)"),
      f("placement", "Show on", "select", false, "Dashboard", [
        "Dashboard",
        "Client overview",
        "Help / support",
        "Footer",
      ]),
      f("body", "Content", "textarea", true),
      f("order", "Display order", "number"),
      f("enabled", "Visible", "select", false, "Yes", ["Yes", "No"]),
      f("linkLabel", "Link label"),
      f("linkUrl", "Link URL", "url"),
    ],
  },
  activities: {
    titleField: "title",
    columns: ["clientCode", "severity", "occurredAt"],
    fields: [
      f("title", "Activity title", "text", true),
      f("description", "Description", "textarea"),
      f("clientCode", "Client code"),
      f("severity", "Severity", "select", false, "Info", [
        "Info",
        "Success",
        "Warning",
        "Critical",
      ]),
      f("occurredAt", "Date / time", "datetime-local"),
    ],
  },
  companyProfiles: {
    titleField: "clientCode",
    columns: ["provider", "regionName", "environment", "healthStatus"],
    fields: [
      f("clientCode", "Client code", "text", true),
      f("description", "Environment description", "textarea"),
      f("environment", "Environment", "select", false, "Production", [
        "Production",
        "Staging",
        "Development",
      ]),
      f("environmentName", "Environment label"),
      f("environmentStatus", "Environment status"),
      f("provider", "Cloud provider"),
      f("location", "Location"),
      f("regionName", "Region name"),
      f("regionCode", "Region code"),
      f("availabilityZone", "Availability zone"),
      f("operatingSystem", "Operating system"),
      f("primaryResource", "Primary resource name"),
      f("primaryResourceType", "Primary resource configuration"),
      f("primaryIp", "Primary IP / hostname"),
      f("uptime", "Uptime"),
      f("healthScore", "Health score", "number"),
      f("healthStatus", "Health status"),
      f("serviceStatus", "Service status"),
      f("vcpuAllocated", "Allocated vCPU"),
      f("memoryAllocated", "Memory allocation"),
      f("diskAllocation", "Disk allocation"),
      f("networkDescription", "Network description"),
      f("instanceState", "Instance state"),
      f("containerRuntime", "Container runtime"),
      f("deploymentStatus", "Deployment status"),
      f("repositoryPath", "Repository path"),
      f("lastUpdated", "Last updated", "datetime-local"),
    ],
  },
  deployments: {
    titleField: "version",
    columns: ["clientCode", "description", "deployedAt", "status"],
    fields: [
      f("version", "Release / version", "text", true),
      f("clientCode", "Client code"),
      f("description", "Release description", "textarea"),
      f("branch", "Branch"),
      f("deployedAt", "Deployment date", "datetime-local"),
      f("status", "Deployment status", "select", false, "Deployed", [
        "Deployed",
        "Building",
        "Failed",
        "Rolled back",
      ]),
      f("buildDuration", "Build duration"),
      f("buildSuccessRate", "Build success rate (%)", "number"),
      f("rollbackPoint", "Rollback point"),
    ],
  },
  runtimeSpecs: {
    titleField: "label",
    columns: ["clientCode", "value"],
    fields: [
      f("label", "Specification label", "text", true),
      f("value", "Specification value", "text", true),
      f("clientCode", "Client code"),
      f("order", "Display order", "number"),
    ],
  },
  codebaseFiles: {
    titleField: "path",
    columns: ["clientCode", "encoding"],
    fields: [
      f("path", "File path", "text", true),
      f("clientCode", "Client code"),
      f("name", "File name"),
      f("content", "File contents / preview", "textarea"),
      f("encoding", "Encoding"),
    ],
  },
  terminalEntries: {
    titleField: "command",
    columns: ["clientCode", "level", "timestamp"],
    fields: [
      f("command", "Command / label", "text", true),
      f("clientCode", "Client code"),
      f("output", "Output text", "textarea"),
      f("message", "Event message", "textarea"),
      f("level", "Level", "select", false, "INFO", [
        "INFO",
        "WARN",
        "ERROR",
        "DEBUG",
      ]),
      f("timestamp", "Date / time", "datetime-local"),
    ],
  },
};

const dashboardMetricMeta = {
  contractAmount: {
    label: "Agreed contract amount",
    icon: "wallet",
    footnote: "Exact amount entered by the administrator",
    description:
      "Displays the agreed contract amount and its monthly or yearly billing cycle.",
  },
  todayAccruedCost: {
    label: "Today's accrued cost",
    icon: "wallet",
    footnote: "Time-based amount accrued today",
    description:
      "Starts at zero each day and increases in proportion to elapsed time.",
  },
  cpuUtilization: {
    label: "Average CPU utilization",
    icon: "cpu",
    footnote: "Rolling simulated utilization",
    description: "Uses the automatically generated rolling CPU telemetry.",
  },
  memoryUsage: {
    label: "Average memory usage",
    icon: "activity",
    footnote: "Rolling simulated utilization",
    description: "Uses the automatically generated rolling memory telemetry.",
  },
  networkThroughput: {
    label: "Network throughput",
    icon: "network",
    footnote: "Average network I/O",
    description: "Uses the automatically generated rolling network telemetry.",
  },
  storageCapacity: {
    label: "Storage capacity",
    icon: "storage",
    footnote: "Estimated provisioned storage",
    description: "Calculated from the client’s price-based storage allocation.",
  },
  runningResources: {
    label: "Running resources",
    icon: "server",
    footnote: "Active provisioned resources",
    description:
      "Counts the resources currently shown as running for this client.",
  },
  invoiceCount: {
    label: "Invoice count",
    icon: "database",
    footnote: "Published billing records",
    description: "Counts invoices assigned to the selected client.",
  },
  outstandingAmount: {
    label: "Outstanding invoice amount",
    icon: "wallet",
    footnote: "Pending and overdue invoices",
    description: "Adds the amounts of pending and overdue invoices.",
  },
  connectedIntegrations: {
    label: "Connected integrations",
    icon: "zap",
    footnote: "Active service connections",
    description: "Counts integrations marked as connected.",
  },
};
function inferDashboardMetric(record = {}) {
  if (record.metric === "monthlyCost") return "contractAmount";
  if (record.metric === "dailyCost") return "todayAccruedCost";
  if (dashboardMetricMeta[record.metric]) return record.metric;
  const label = String(record.label || record.title || "").toLowerCase();
  if (label.includes("daily")) return "todayAccruedCost";
  if (label.includes("cpu")) return "cpuUtilization";
  if (label.includes("memory")) return "memoryUsage";
  if (label.includes("network")) return "networkThroughput";
  if (label.includes("storage")) return "storageCapacity";
  if (label.includes("resource") || label.includes("instance"))
    return "runningResources";
  if (
    label.includes("invoice") &&
    (label.includes("outstanding") || label.includes("due"))
  )
    return "outstandingAmount";
  if (label.includes("invoice")) return "invoiceCount";
  if (label.includes("integration")) return "connectedIntegrations";
  return "contractAmount";
}
function f(
  key,
  label,
  type = "text",
  required = false,
  defaultValue = "",
  options = [],
) {
  return { key, label, type, required, defaultValue, options };
}
const settingFields = [
  f("brandName", "Product / brand name"),
  f("organizationName", "Organization name"),
  f("workspaceLabel", "Workspace label"),
  f("adminDisplayName", "Administrator display name"),
  f("supportEmail", "Support email", "email"),
  f("supportUrl", "Support URL", "url"),
  f("currency", "Default currency", "select", false, "INR", [
    "INR",
    "USD",
    "EUR",
    "GBP",
    "SGD",
    "AED",
  ]),
  f("timezone", "Timezone", "text", false, "Asia/Kolkata"),
  f("dashboardTitle", "Dashboard heading"),
  f("dashboardSubtitle", "Dashboard description", "textarea"),
  f("footerText", "Footer text"),
  f("logoUrl", "Logo image URL", "url"),
  f("accentColor", "Accent color", "color", false, "#cdd2d9"),
  f("invoicePrefix", "Invoice number prefix"),
  f("defaultTaxRate", "Default tax rate (%)", "number"),
  f("defaultPaymentTerms", "Default payment terms"),
  f("helpText", "Help / support text", "textarea"),
  f("navigationLabels", "Sidebar labels (JSON)", "json"),
  f("pageTitles", "Page headings (JSON)", "json"),
  f("pageDescriptions", "Page descriptions (JSON)", "json"),
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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [managerType, setManagerType] = useState("clients");
  const [editor, setEditor] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [settingsDraft, setSettingsDraft] = useState({});
  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadWorkspace = async (currentToken) => {
    setLoading(true);
    setError("");
    try {
      const [recordResult, settingResult, auditResult] = await Promise.all([
        api("/api/admin/records", { token: currentToken }),
        api("/api/admin/settings", { token: currentToken }),
        api("/api/admin/audit", { token: currentToken }),
      ]);
      setRecords(recordResult.records || []);
      setSettings(settingResult.settings || {});
      setSettingsDraft(settingResult.settings || {});
      setAudit(auditResult.logs || []);
      setLoaded(true);
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
      .then(({ user: currentUser }) => {
        if (cancelled) return;
        setUser(currentUser);
        setAuthReady(true);
        loadWorkspace(token);
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
    setLoaded(false);
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
    return result;
  };
  const refresh = () => loadWorkspace(token);
  const go = (next) => {
    setPage(next);
    setMobileNav(false);
    setSearch("");
    setError("");
  };
  const recordsOf = (type) =>
    records
      .filter((r) => r.type === type && r.isActive !== false)
      .sort(
        (a, b) =>
          Number(a.sortOrder || a.data?.order || 0) -
          Number(b.sortOrder || b.data?.order || 0),
      );
  const allRecordsOf = (type) => records.filter((r) => r.type === type);
  const clients = recordsOf("clients");
  const filteredClients = clients.filter((r) =>
    `${r.title} ${JSON.stringify(r.data)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const visibleRecordsOf = (type) =>
    recordsOf(type).filter(
      (r) =>
        !search ||
        `${r.title} ${JSON.stringify(r.data)}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const selected = selectedClient
    ? clients.find((c) => c._id === selectedClient)
    : null;
  const currentTitle =
    page === "Client overview" && selected ? selected.data.name : page;
  const currency = settings.currency || "INR";
  const footerBlocks = recordsOf("contentBlocks").filter(
    (r) => r.data?.placement === "Footer" && r.data?.enabled !== "No",
  );

  const openNew = (type) => {
    setManagerType(type);
    setEditor({ type, record: null });
  };
  const openEdit = (record) => {
    setManagerType(record.type);
    setEditor({ type: record.type, record });
  };
  const saveRecord = async (type, values, isActive, sortOrder) => {
    const config = typeConfigs[type];
    const cleanValues = { ...values };
    if (Object.hasOwn(cleanValues, "order"))
      cleanValues.order = Number(sortOrder) || 0;
    if (Object.hasOwn(cleanValues, "enabled"))
      cleanValues.enabled = isActive ? "Yes" : "No";
    if (type === "dashboardCards") {
      const metric = dashboardMetricMeta[cleanValues.metric]
        ? cleanValues.metric
        : "contractAmount";
      const definition = dashboardMetricMeta[metric];
      cleanValues.metric = metric;
      cleanValues.label = definition.label;
      cleanValues.icon = definition.icon;
      cleanValues.value = "";
      cleanValues.change = "Automatically calculated";
      cleanValues.footnote = definition.footnote;
      cleanValues.order = Number(sortOrder) || 0;
      cleanValues.enabled = isActive ? "Yes" : "No";
    }
    // Blank optional fields are dropped so they never show up as 0, % or "undefined" in the customer portal.
    for (const key of Object.keys(cleanValues))
      if (
        cleanValues[key] === "" ||
        cleanValues[key] === null ||
        cleanValues[key] === undefined
      )
        delete cleanValues[key];
    const title = String(cleanValues[config.titleField] || "").trim();
    if (!title)
      throw new Error(
        `${config.fields.find((x) => x.key === config.titleField)?.label || "Title"} is required.`,
      );
    const body = { type, title, data: cleanValues, isActive, sortOrder };
    if (editor?.record?._id)
      await api(`/api/admin/records/${editor.record._id}`, {
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
    setEditor(null);
    setNotice(`${typeLabels[type]} ${editor?.record ? "updated" : "created"}.`);
    await refresh();
  };
  const deleteRecord = async (record) => {
    if (!window.confirm(`Delete “${record.title}”? This cannot be undone.`))
      return;
    try {
      await api(`/api/admin/records/${record._id}`, {
        token,
        method: "DELETE",
      });
      setNotice("Record deleted.");
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };
  const saveSettings = async (event) => {
    event.preventDefault();
    setSavingSettings(true);
    setError("");
    try {
      const normalized = { ...settingsDraft };
      for (const field of settingFields.filter(
        (item) => item.type === "json",
      )) {
        const value = normalized[field.key];
        if (typeof value === "string") {
          try {
            normalized[field.key] = value.trim() ? JSON.parse(value) : {};
          } catch {
            throw new Error(`${field.label} must contain valid JSON.`);
          }
        }
      }
      const result = await api("/api/admin/settings", {
        token,
        method: "PUT",
        body: JSON.stringify({ settings: normalized }),
      });
      setSettings(result.settings);
      setSettingsDraft(result.settings);
      setNotice("Organization settings saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSettings(false);
    }
  };
  const changePassword = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const result = await api("/api/auth/password", {
        token,
        method: "PUT",
        body: JSON.stringify(passwordDraft),
      });
      setPasswordDraft({ currentPassword: "", newPassword: "" });
      logout();
      setNotice(result.message);
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

  const navGroups = [
    {
      label: "WORKSPACE",
      items: [
        ["Dashboard", LayoutDashboard],
        ["Client overview", Building2],
        ["Infrastructure", Server],
        ["Usage analytics", Activity],
      ],
    },
    {
      label: "BUSINESS DATA",
      items: [
        ["Clients", Building2],
        ["Cost plans", Wallet],
        ["Invoices", ReceiptText],
        ["Transactions", CreditCard],
        ["Integrations", Cloud],
      ],
    },
    {
      label: "ADMINISTRATION",
      items: [
        ["Admin manager", SlidersHorizontal],
        ["Help & support", CircleHelp],
        ["Settings", Settings],
        ["Audit log", ShieldCheck],
      ],
    },
  ];
  const iconFor = (name) =>
    ({
      Dashboard: LayoutDashboard,
      "Client overview": Building2,
      Infrastructure: Server,
      "Usage analytics": Activity,
      Clients: Building2,
      "Cost plans": Wallet,
      Invoices: ReceiptText,
      Transactions: CreditCard,
      Integrations: Cloud,
      "Admin manager": SlidersHorizontal,
      "Help & support": CircleHelp,
      Settings,
      "Audit log": ShieldCheck,
    })[name] || LayoutDashboard;

  return (
    <div
      className="cl-shell"
      style={{ "--cl-accent": settings.accentColor || "#cdd2d9" }}
    >
      <aside className={`cl-sidebar ${mobileNav ? "is-open" : ""}`}>
        <div className="cl-brand">
          <div className="cl-brand-mark">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="" />
            ) : (
              <Cloud size={19} />
            )}
          </div>
          <div>
            <b>{settings.brandName || "CloudLedger"}</b>
            <span>OPERATIONS CONSOLE</span>
          </div>
          <button
            className="cl-mobile-close"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="cl-workspace">
          <div className="cl-workspace-icon">
            {(settings.organizationName || "O").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <b>{settings.organizationName || "Organization"}</b>
            <span>{settings.workspaceLabel || "Workspace"}</span>
          </div>
          <ChevronDown size={14} />
        </div>
        {navGroups.map((group) => (
          <div className="cl-nav-group" key={group.label}>
            <div className="cl-nav-label">{group.label}</div>
            {group.items.map(([label, Icon]) => (
              <button
                key={label}
                className={`cl-nav-item ${page === label ? "active" : ""}`}
                onClick={() => go(label)}
              >
                <Icon size={16} />
                <span>{settings.navigationLabels?.[label] || label}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="cl-sidebar-bottom">
          <div className="cl-support-card">
            <CircleHelp size={17} />
            <b>Support</b>
            <p>
              {settings.helpText ||
                "Manage client accounts, billing records and operational data from the admin workspace."}
            </p>
            {settings.supportEmail && (
              <a href={`mailto:${settings.supportEmail}`}>
                {settings.supportEmail}
              </a>
            )}
          </div>
          <div className="cl-user">
            <div className="cl-user-avatar">
              {(user.name || user.email || "A").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <b>{settings.adminDisplayName || user.name || "Administrator"}</b>
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
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{settings.navigationLabels?.[currentTitle] || currentTitle}</b>
          </div>
          <div className="cl-top-actions">
            <div className="cl-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search records…"
              />
              <kbd>/</kbd>
            </div>
            <span className="cl-db-indicator">
              <i /> MongoDB workspace
            </span>
            <div className="cl-top-avatar">
              {(user.name || "A").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <div className="cl-page-wrap">
          <div className="cl-page-heading">
            <div>
              <div className="cl-eyebrow">
                <i /> ADMIN WORKSPACE <span>/</span> DATABASE CONNECTED
              </div>
              <h1>
                {settings.pageTitles?.[page] ||
                  (page === "Dashboard"
                    ? settings.dashboardTitle || "Operations overview"
                    : settings.navigationLabels?.[currentTitle] ||
                      currentTitle)}
              </h1>
              <p>
                {settings.pageDescriptions?.[page] ||
                  (page === "Dashboard"
                    ? settings.dashboardSubtitle ||
                      "A live view of the records configured in your MongoDB workspace."
                    : pageDescription(page))}
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
                  onClick={() => openNew("clients")}
                >
                  <Plus size={15} /> Add client
                </button>
              )}
              {page === "Infrastructure" && (
                <button
                  className="cl-button primary"
                  onClick={() => openNew("resources")}
                >
                  <Plus size={15} /> Add resource
                </button>
              )}
              {page === "Invoices" && (
                <button
                  className="cl-button primary"
                  onClick={() => openNew("invoices")}
                >
                  <Plus size={15} /> Add invoice
                </button>
              )}
              {page === "Admin manager" && (
                <button
                  className="cl-button primary"
                  onClick={() => openNew(managerType)}
                >
                  <Plus size={15} /> Add record
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
          {loading && !loaded && (
            <div className="cl-inline-loading">
              <div className="cl-spinner small" /> Loading MongoDB records…
            </div>
          )}
          {loaded && page === "Dashboard" && (
            <Dashboard
              records={records}
              settings={settings}
              onNavigate={go}
              onSelectClient={(id) => {
                setSelectedClient(id);
                go("Client overview");
              }}
              currency={currency}
            />
          )}
          {loaded && page === "Clients" && (
            <ClientList
              records={filteredClients}
              currency={currency}
              onSelect={(client) => {
                setSelectedClient(client._id);
                go("Client overview");
              }}
              onEdit={openEdit}
              onAdd={() => openNew("clients")}
            />
          )}
          {loaded && page === "Client overview" && (
            <ClientOverview
              client={selected}
              records={records}
              currency={currency}
              onEdit={openEdit}
              onNavigate={go}
            />
          )}
          {loaded && page === "Infrastructure" && (
            <Infrastructure
              records={visibleRecordsOf("resources")}
              clients={clients}
              currency={currency}
              onEdit={openEdit}
              onAdd={() => openNew("resources")}
            />
          )}
          {loaded && page === "Usage analytics" && (
            <UsageAnalytics records={records} />
          )}
          {loaded && page === "Cost plans" && (
            <SimpleRecords
              type="costPlans"
              records={visibleRecordsOf("costPlans")}
              currency={currency}
              onEdit={openEdit}
              onAdd={() => openNew("costPlans")}
            />
          )}
          {loaded && page === "Invoices" && (
            <SimpleRecords
              type="invoices"
              records={visibleRecordsOf("invoices")}
              currency={currency}
              onEdit={openEdit}
              onAdd={() => openNew("invoices")}
            />
          )}
          {loaded && page === "Transactions" && (
            <SimpleRecords
              type="transactions"
              records={visibleRecordsOf("transactions")}
              currency={currency}
              onEdit={openEdit}
              onAdd={() => openNew("transactions")}
            />
          )}
          {loaded && page === "Integrations" && (
            <SimpleRecords
              type="integrations"
              records={visibleRecordsOf("integrations")}
              currency={currency}
              onEdit={openEdit}
              onAdd={() => openNew("integrations")}
            />
          )}
          {loaded && page === "Help & support" && (
            <ContentBlocksPage
              blocks={recordsOf("contentBlocks").filter(
                (r) => (r.data?.placement || "Dashboard") === "Help / support",
              )}
              settings={settings}
              onManage={() => {
                setManagerType("contentBlocks");
                go("Admin manager");
              }}
            />
          )}
          {loaded && page === "Admin manager" && (
            <AdminManager
              records={allRecordsOf(managerType).filter(
                (r) =>
                  !search ||
                  `${r.title} ${JSON.stringify(r.data)}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )}
              allRecords={records}
              type={managerType}
              setType={setManagerType}
              onEdit={openEdit}
              onAdd={() => openNew(managerType)}
              onDelete={deleteRecord}
              onRefresh={refresh}
            />
          )}
          {loaded && page === "Settings" && (
            <SettingsPage
              settingsDraft={settingsDraft}
              setSettingsDraft={setSettingsDraft}
              onSave={saveSettings}
              saving={savingSettings}
              passwordDraft={passwordDraft}
              setPasswordDraft={setPasswordDraft}
              onChangePassword={changePassword}
            />
          )}
          {loaded && page === "Audit log" && <AuditPage audit={audit} />}
        </div>
        <footer className="cl-footer">
          <span>
            {settings.footerText ||
              `© ${new Date().getFullYear()} ${settings.organizationName || settings.brandName || "CloudLedger"}`}
          </span>
          {footerBlocks.map((block) => (
            <span className="cl-footer-content" key={block._id}>
              {block.data.body}
              {block.data.linkUrl && (
                <a href={block.data.linkUrl} target="_blank" rel="noreferrer">
                  {block.data.linkLabel || "More"} <ArrowUpRight size={11} />
                </a>
              )}
            </span>
          ))}
          <span>
            <i /> Authenticated administrator <b>·</b> Node.js API <b>·</b>{" "}
            MongoDB
          </span>
        </footer>
      </main>
      {editor && (
        <RecordEditor
          key={`${editor.type}-${editor.record?._id || "new"}`}
          type={editor.type}
          record={editor.record}
          clients={allRecordsOf("clients")}
          onClose={() => setEditor(null)}
          onSave={saveRecord}
        />
      )}
    </div>
  );
}

function pageDescription(page) {
  return (
    {
      "Client overview":
        "Client account details, related infrastructure, invoices and automatically generated animated telemetry.",
      Clients:
        "Manage client organizations and their billing and contact details.",
      Infrastructure:
        "Review saved provider inventory and automatically estimated compute, storage and network capacity based on each client contract.",
      "Usage analytics":
        "Preview the automatically animated telemetry shown in customer workspaces. No data entry is required.",
      "Cost plans": "Configure service tiers, pricing and included resources.",
      Invoices: "Manage invoice records and payment status.",
      Transactions: "Track customer payments and financial transactions.",
      Integrations:
        "Configure and track connected cloud and service providers.",
      "Admin manager":
        "Create, update, hide and delete the records that populate every workspace screen.",
      Settings:
        "Customize organization identity, dashboard copy, invoice defaults and administrator security.",
      "Audit log": "Review changes made by signed-in administrators.",
    }[page] || ""
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
          <span>
            <Cloud size={21} />
          </span>
          <b>CloudLedger</b>
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

function Dashboard({
  records,
  settings,
  onNavigate,
  onSelectClient,
  currency,
}) {
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setLiveTick((value) => value + 1),
      12000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const clients = records.filter(
    (r) => r.type === "clients" && r.isActive !== false,
  );
  const resources = records.filter(
    (r) => r.type === "resources" && r.isActive !== false,
  );
  const invoices = records.filter(
    (r) => r.type === "invoices" && r.isActive !== false,
  );
  const running = resources.filter(
    (r) => String(r.data?.status || "").toLowerCase() === "running",
  ).length;
  const clientsWithInventory = new Set(
    resources.map((r) => r.data?.clientCode).filter(Boolean),
  );
  const estimatedResourceCount =
    clients.filter(
      (r) => r.data?.code && !clientsWithInventory.has(r.data.code),
    ).length * 3;
  const displayedResourceCount = resources.length + estimatedResourceCount;
  const displayedRunningCount = running + estimatedResourceCount;
  const outstanding = invoices
    .filter((r) =>
      ["pending", "overdue", "draft"].includes(
        String(r.data?.status || "").toLowerCase(),
      ),
    )
    .reduce((sum, r) => sum + Number(r.data?.amount || 0), 0);
  const monthlyCost = clients.reduce(
    (sum, r) => sum + getClientPricing(r.data || {}).monthlyCost,
    0,
  );
  const customCards = records
    .filter(
      (r) =>
        r.type === "dashboardCards" &&
        r.isActive !== false &&
        r.data?.enabled !== "No",
    )
    .sort((a, b) => Number(a.data?.order || 0) - Number(b.data?.order || 0));
  const usage = makeLiveUsageSeries(
    liveTick,
    "24 hours",
    "admin-dashboard",
    monthlyCost,
  ).map((point) => ({ ...point, label: point.time }));
  const meanOf = (key) =>
    usage.length
      ? usage.reduce((sum, point) => sum + Number(point[key] || 0), 0) /
        usage.length
      : 0;
  const todayAccruedTotal = clients.reduce(
    (sum, r) => sum + getBillingAccrual(r.data || {}, new Date()).todayAccrued,
    0,
  );
  const connectedCount = records.filter(
    (r) =>
      r.type === "integrations" &&
      r.isActive !== false &&
      String(r.data?.status || "").toLowerCase() === "connected",
  ).length;
  const storageTotal =
    resources.reduce((sum, r) => sum + Number(r.data?.storageGB || 0), 0) ||
    clients.reduce(
      (sum, r) =>
        sum +
        Number(getClientPricing(r.data || {}).estimatedCapacity?.diskGb || 0),
      0,
    );
  const metricValue = (metric) =>
    ({
      contractAmount: [
        money(monthlyCost, currency),
        "Monthly-equivalent total across active clients",
      ],
      todayAccruedCost: [
        money(todayAccruedTotal, currency),
        "Accrued today across active clients",
      ],
      cpuUtilization: [
        `${meanOf("cpu").toFixed(1)}%`,
        "Rolling simulated utilization",
      ],
      memoryUsage: [
        `${meanOf("memory").toFixed(1)}%`,
        "Rolling simulated utilization",
      ],
      networkThroughput: [
        `${meanOf("network").toFixed(1)} Mbps`,
        "Average network I/O",
      ],
      storageCapacity: [
        storageTotal ? `${storageTotal.toLocaleString("en-IN")} GB` : "—",
        "Provisioned storage",
      ],
      runningResources: [
        String(displayedRunningCount),
        `${displayedResourceCount} resources in total`,
      ],
      invoiceCount: [String(invoices.length), "Invoice records"],
      outstandingAmount: [
        money(outstanding, currency),
        "Draft, pending and overdue",
      ],
      connectedIntegrations: [String(connectedCount), "Connected integrations"],
    })[metric] || ["—", ""];
  const cards = customCards.length
    ? customCards.map((r) => {
        const metric = inferDashboardMetric(r.data || {});
        const [value, foot] = metricValue(metric);
        return {
          label: dashboardMetricMeta[metric].label,
          value,
          foot,
          icon: dashboardMetricMeta[metric].icon,
        };
      })
    : [
        {
          label: "Client accounts",
          value: clients.length,
          foot: "Active accounts",
          icon: "clients",
        },
        {
          label: "Infrastructure resources",
          value: displayedResourceCount,
          foot: `${displayedRunningCount} running or auto-estimated`,
          icon: "resources",
        },
        {
          label: "Monthly client cost",
          value: money(monthlyCost, currency),
          foot: "Sum of configured client costs",
          icon: "cost",
        },
        {
          label: "Outstanding invoices",
          value: money(outstanding, currency),
          foot: "Draft, pending and overdue",
          icon: "invoices",
        },
      ];
  const recentInvoices = [...invoices]
    .sort(
      (a, b) =>
        new Date(b.data?.issueDate || b.updatedAt) -
        new Date(a.data?.issueDate || a.updatedAt),
    )
    .slice(0, 5);
  const activityRecords = records
    .filter((r) => r.type === "activities" && r.isActive !== false)
    .sort(
      (a, b) =>
        new Date(b.data?.occurredAt || b.updatedAt) -
        new Date(a.data?.occurredAt || a.updatedAt),
    )
    .slice(0, 6);
  const topClients = [...clients]
    .sort(
      (a, b) =>
        getClientPricing(b.data || {}).monthlyCost -
        getClientPricing(a.data || {}).monthlyCost,
    )
    .slice(0, 5);
  const blocks = records
    .filter(
      (r) =>
        r.type === "contentBlocks" &&
        r.isActive !== false &&
        r.data?.enabled !== "No" &&
        (r.data?.placement || "Dashboard") === "Dashboard",
    )
    .sort((a, b) => Number(a.data?.order || 0) - Number(b.data?.order || 0));
  return (
    <>
      <div className="cl-stat-grid">
        {cards.map((card, i) => (
          <div className="cl-stat-card" key={`${card.label}-${i}`}>
            <div className="cl-stat-top">
              <span>{card.label}</span>
              <span className="cl-stat-icon">
                {["resources", "server"].includes(card.icon) ? (
                  <Server size={16} />
                ) : ["invoices", "database"].includes(card.icon) ? (
                  <ReceiptText size={16} />
                ) : ["cost", "wallet"].includes(card.icon) ? (
                  <Wallet size={16} />
                ) : card.icon === "clients" ? (
                  <Building2 size={16} />
                ) : (
                  <Activity size={16} />
                )}
              </span>
            </div>
            <strong>{card.value}</strong>
            <small>
              {card.foot || card.change || "Configured in admin manager"}
            </small>
          </div>
        ))}
      </div>
      <div className="cl-dashboard-grid">
        <section className="cl-panel cl-chart-panel">
          <PanelHeader
            title="Live resource simulation"
            subtitle="Automatically generated rolling telemetry"
            action={
              <button
                className="cl-text-button"
                onClick={() => onNavigate("Usage analytics")}
              >
                View analytics <ArrowUpRight size={14} />
              </button>
            }
          />
          <>
            <div className="cl-chart-legend">
              <span>
                <i className="cpu" /> CPU %
              </span>
              <span>
                <i className="memory" /> Memory %
              </span>
              <span>
                <i className="network" /> Network Mbps
              </span>
            </div>
            <div className="cl-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={usage}>
                  <defs>
                    <linearGradient id="clCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#aeb8c6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#aeb8c6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#252c35" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#8993a0", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#8993a0", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#151b23",
                      border: "1px solid #303944",
                      borderRadius: 8,
                      color: "#e6e9ed",
                      fontSize: 11,
                    }}
                  />
                  <Area
                    dataKey="cpuPercent"
                    name="CPU %"
                    stroke="#c8d0da"
                    fill="url(#clCpu)"
                    connectNulls
                    isAnimationActive
                    animationDuration={750}
                  />
                  <Area
                    dataKey="memoryPercent"
                    name="Memory %"
                    stroke="#8c9bab"
                    fill="transparent"
                    connectNulls
                    isAnimationActive
                    animationDuration={750}
                  />
                  <Area
                    dataKey="networkMbps"
                    name="Network Mbps"
                    stroke="#a9a18f"
                    fill="transparent"
                    connectNulls
                    isAnimationActive
                    animationDuration={750}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="cl-chart-foot">
              <span>
                <i /> Sample telemetry · refreshes automatically
              </span>
              <span>{usage.length} rolling points</span>
            </div>
          </>
        </section>
        <section className="cl-panel">
          <PanelHeader
            title="Workspace at a glance"
            subtitle="Current saved records"
          />
          <div className="cl-health-summary">
            <div className="cl-health-ring">
              <div>
                <b>
                  {displayedResourceCount
                    ? Math.round(
                        (displayedRunningCount / displayedResourceCount) * 100,
                      )
                    : "—"}
                </b>
                <small>{displayedResourceCount ? "ACTIVE" : "NO DATA"}</small>
              </div>
            </div>
            <div>
              <b>
                {displayedResourceCount
                  ? `${displayedRunningCount} of ${displayedResourceCount} resources running or estimated`
                  : "No resources configured"}
              </b>
              <p>
                {displayedResourceCount
                  ? "Includes estimated compute, storage and network resources generated from each client price."
                  : "Add a client name and billing amount to generate its resource profile."}
              </p>
            </div>
          </div>
          <div className="cl-summary-list">
            <div>
              <span>
                <Building2 size={14} /> Client accounts
              </span>
              <b>{clients.length}</b>
            </div>
            <div>
              <span>
                <Server size={14} /> Infrastructure records
              </span>
              <b>{displayedResourceCount}</b>
            </div>
            <div>
              <span>
                <ReceiptText size={14} /> Invoice records
              </span>
              <b>{invoices.length}</b>
            </div>
            <div>
              <span>
                <CreditCard size={14} /> Transactions
              </span>
              <b>{records.filter((r) => r.type === "transactions").length}</b>
            </div>
          </div>
          <button
            className="cl-text-button"
            onClick={() => onNavigate("Admin manager")}
          >
            Open admin manager <ArrowUpRight size={14} />
          </button>
        </section>
      </div>
      <div className="cl-lower-grid">
        <section className="cl-panel">
          <PanelHeader
            title="Client cost allocation"
            subtitle="Sorted by configured monthly cost"
            action={
              <button
                className="cl-text-button"
                onClick={() => onNavigate("Clients")}
              >
                All clients <ArrowUpRight size={14} />
              </button>
            }
          />
          {topClients.length ? (
            <div className="cl-cost-list">
              {topClients.map((r, i) => (
                <button
                  className="cl-cost-row"
                  key={r._id}
                  onClick={() => onSelectClient(r._id)}
                >
                  <span className="cl-client-avatar">
                    {(r.data?.name || r.title || "C").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="cl-cost-name">
                    <b>{r.data?.name || r.title}</b>
                    <small>
                      {r.data?.code || "No client code"} ·{" "}
                      {r.data?.plan || "No plan"}
                    </small>
                  </span>
                  <span className="cl-cost-value">
                    {money(
                      getClientPricing(r.data || {}).monthlyCost,
                      r.data?.currency || currency,
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No clients have been added"
              text="Create client records to populate cost allocation and the client directory."
              action="Add first client"
              onAction={() => onNavigate("Clients")}
            />
          )}
        </section>
        <section className="cl-panel">
          <PanelHeader
            title="Recent invoices"
            subtitle="Latest configured invoice records"
            action={
              <button
                className="cl-text-button"
                onClick={() => onNavigate("Invoices")}
              >
                View invoices <ArrowUpRight size={14} />
              </button>
            }
          />
          {recentInvoices.length ? (
            <div className="cl-invoice-list">
              {recentInvoices.map((r) => (
                <div className="cl-invoice-row" key={r._id}>
                  <span className="cl-file-icon">
                    <FileText size={15} />
                  </span>
                  <span>
                    <b>{r.data?.number || r.title}</b>
                    <small>
                      {r.data?.clientName ||
                        r.data?.clientCode ||
                        "Client not assigned"}
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
            <EmptyState
              title="No invoices yet"
              text="Invoice records will appear here after they are created in the admin manager."
              action="Open invoices"
              onAction={() => onNavigate("Invoices")}
            />
          )}
        </section>
      </div>
      {activityRecords.length > 0 && (
        <section className="cl-panel cl-activity-panel">
          <PanelHeader
            title="Recent activity"
            subtitle="Activity entries maintained by administrators"
          />
          <div className="cl-activity-list">
            {activityRecords.map((item) => (
              <div className="cl-activity-row" key={item._id}>
                <span className="cl-activity-dot" />
                <div>
                  <b>{item.title}</b>
                  <p>{item.data?.description || item.data?.clientCode || ""}</p>
                </div>
                <small>
                  {dateText(item.data?.occurredAt || item.updatedAt)}
                </small>
              </div>
            ))}
          </div>
        </section>
      )}
      {blocks.length > 0 && (
        <div className="cl-content-block-grid">
          {blocks.map((block) => (
            <section className="cl-panel cl-content-block" key={block._id}>
              <h3>{block.title}</h3>
              <p>{block.data.body}</p>
              {block.data.linkUrl && (
                <a href={block.data.linkUrl} target="_blank" rel="noreferrer">
                  {block.data.linkLabel || "Open link"}{" "}
                  <ArrowUpRight size={13} />
                </a>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function ClientList({ records, currency, onSelect, onEdit, onAdd }) {
  return (
    <section className="cl-panel cl-table-panel">
      <PanelHeader
        title="Client directory"
        subtitle={`${records.length} matching client account${records.length === 1 ? "" : "s"}`}
        action={
          <button className="cl-button primary small" onClick={onAdd}>
            <Plus size={14} /> Add client
          </button>
        }
      />
      {records.length ? (
        <div className="cl-table-scroll">
          <table className="cl-table">
            <thead>
              <tr>
                <th>CLIENT</th>
                <th>BILLING CYCLE</th>
                <th>CONTRACT AMOUNT</th>
                <th>MONTHLY EQUIVALENT</th>
                <th>DAILY RUN-RATE</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const pricing = getClientPricing(r.data || {});
                return (
                  <tr key={r._id}>
                    <td>
                      <button
                        className="cl-table-client"
                        onClick={() => onSelect(r)}
                      >
                        <span className="cl-client-avatar">
                          {(r.data?.name || r.title || "C")
                            .slice(0, 1)
                            .toUpperCase()}
                        </span>
                        <span>
                          <b>{r.data?.name || r.title}</b>
                          <small>{r.data?.code || "Auto-generated code"}</small>
                        </span>
                      </button>
                    </td>
                    <td>{pricing.billingCycle}</td>
                    <td>
                      {money(
                        pricing.contractAmount,
                        r.data?.currency || currency,
                      )}{" "}
                      / {pricing.billingCycle.toLowerCase()}
                    </td>
                    <td>
                      {money(pricing.monthlyCost, r.data?.currency || currency)}
                    </td>
                    <td>
                      {money(pricing.dailyCost, r.data?.currency || currency)}
                    </td>
                    <td>
                      <button
                        className="cl-icon-button"
                        onClick={() => onEdit(r)}
                        title="Edit client"
                      >
                        <Edit3 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No client records found"
          text="Add a company name and its monthly or yearly amount. Resource estimates and daily cost will be calculated automatically."
          action="Add a client"
          onAction={onAdd}
        />
      )}
    </section>
  );
}

function ClientOverview({ client, records, currency, onEdit, onNavigate }) {
  if (!client)
    return (
      <EmptyState
        title="Select a client"
        text="Choose a client from the client directory to inspect its details."
        action="Open clients"
        onAction={() => onNavigate("Clients")}
      />
    );
  const rawData = client.data || {};
  const pricing = getClientPricing(rawData);
  const data = { ...rawData, ...pricing };
  const savedResources = records.filter(
    (r) =>
      r.type === "resources" &&
      r.isActive !== false &&
      r.data?.clientCode === data.code,
  );
  const estimatedCapacity =
    pricing.estimatedCapacity || estimateCapacity(pricing.monthlyCost);
  const estimatePoint =
    makeLiveUsageSeries(
      0,
      "24 hours",
      data.code || "client",
      pricing.monthlyCost,
    ).at(-1) || {};
  const resources = savedResources.length
    ? savedResources
    : buildEstimatedResources(data, estimatePoint).map((item) => ({
        _id: item._id,
        type: "resources",
        title: item.name,
        data: { ...item, clientCode: data.code, status: "Estimated" },
        isEstimate: true,
      }));
  const invoices = records.filter(
    (r) =>
      r.type === "invoices" &&
      r.isActive !== false &&
      (r.data?.clientCode === data.code || r.data?.clientName === data.name),
  );
  const blocks = records.filter(
    (r) =>
      r.type === "contentBlocks" &&
      r.isActive !== false &&
      r.data?.enabled !== "No" &&
      r.data?.placement === "Client overview",
  );
  return (
    <>
      <section className="cl-panel cl-client-hero">
        <div className="cl-client-large-avatar">
          {(data.name || "C").slice(0, 1).toUpperCase()}
        </div>
        <div className="cl-client-hero-copy">
          <span className="cl-eyebrow">
            CLIENT ACCOUNT / {data.code || client._id.slice(-6)}
          </span>
          <h2>{data.name || client.title}</h2>
          <p>{data.company || data.plan || "Client account"}</p>
        </div>
        <div className="cl-client-hero-actions">
          <Status value={data.status} />
          <button
            className="cl-button secondary"
            onClick={() => onEdit(client)}
          >
            <Edit3 size={14} /> Edit client
          </button>
        </div>
      </section>
      <div className="cl-stat-grid three">
        <MiniStat
          label="Contract amount"
          value={`${money(pricing.contractAmount, data.currency || currency)} / ${pricing.billingCycle.toLowerCase()}`}
        />
        <MiniStat
          label="Monthly equivalent"
          value={money(pricing.monthlyCost, data.currency || currency)}
        />
        <MiniStat
          label="Daily run-rate"
          value={money(pricing.dailyCost, data.currency || currency)}
        />
      </div>
      <div className="cl-dashboard-grid">
        <section className="cl-panel">
          <PanelHeader
            title="Client details"
            subtitle="Saved account and billing information"
          />
          <div className="cl-detail-grid">
            {[
              ["Contact", data.contactName],
              ["Email", data.email],
              ["Phone", data.phone],
              ["Plan", data.plan],
              ["Provider", data.provider],
              ["GSTIN", data.gstin],
              ["Billing address", data.address],
              ["Notes", data.notes],
              ...Object.entries(data.customData || {}).map(([key, value]) => [
                key,
                asText(value),
              ]),
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <b>{value || "—"}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="cl-panel">
          <PanelHeader
            title="Usage and infrastructure"
            subtitle="Estimated from the saved client amount unless provider records are added"
          />
          <div className="cl-summary-list">
            <div>
              <span>
                <Server size={14} /> Resources
              </span>
              <b>{resources.length || (estimatedCapacity.units ? 3 : 0)}</b>
            </div>
            <div>
              <span>
                <Activity size={14} /> Estimated capacity
              </span>
              <b>
                {estimatedCapacity.vcpu} vCPU · {estimatedCapacity.memoryGb} GB
                RAM
              </b>
            </div>
            <div>
              <span>
                <ReceiptText size={14} /> Invoice total
              </span>
              <b>
                {money(
                  invoices.reduce(
                    (sum, r) => sum + Number(r.data?.amount || 0),
                    0,
                  ),
                  data.currency || currency,
                )}
              </b>
            </div>
          </div>
          <button
            className="cl-text-button"
            onClick={() => onNavigate("Infrastructure")}
          >
            Open infrastructure <ArrowUpRight size={14} />
          </button>
        </section>
      </div>
      {blocks.length > 0 && (
        <div className="cl-content-block-grid">
          {blocks.map((block) => (
            <section className="cl-panel cl-content-block" key={block._id}>
              <h3>{block.title}</h3>
              <p>{block.data.body}</p>
              {block.data.linkUrl && (
                <a href={block.data.linkUrl} target="_blank" rel="noreferrer">
                  {block.data.linkLabel || "Open link"}{" "}
                  <ArrowUpRight size={13} />
                </a>
              )}
            </section>
          ))}
        </div>
      )}
      <section className="cl-panel cl-table-panel">
        <PanelHeader
          title="Client resources"
          subtitle={
            savedResources.length
              ? "Saved infrastructure entries associated with this client"
              : "Automatically estimated from this client billing amount"
          }
        />
        {resources.length ? (
          <RecordTable
            records={resources}
            columns={[
              "category",
              "provider",
              "region",
              "specification",
              "status",
            ]}
            currency={currency}
          />
        ) : (
          <EmptyState
            title="No resources linked"
            text="Add infrastructure records and use this client's code in the Client code field."
            action="Go to infrastructure"
            onAction={() => onNavigate("Infrastructure")}
          />
        )}
      </section>
      <section className="cl-panel cl-table-panel">
        <PanelHeader
          title="Client invoices"
          subtitle="Invoices associated with this account"
        />
        {invoices.length ? (
          <RecordTable
            records={invoices}
            columns={["number", "issueDate", "dueDate", "amount", "status"]}
            currency={data.currency || currency}
          />
        ) : (
          <EmptyState
            title="No invoices linked"
            text="Create an invoice and assign this client name or client code."
            action="View invoices"
            onAction={() => onNavigate("Invoices")}
          />
        )}
      </section>
    </>
  );
}

function Infrastructure({ records, clients = [], currency, onEdit, onAdd }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 7000);
    return () => window.clearInterval(timer);
  }, []);
  const clientsWithRealInventory = new Set(
    records.map((record) => record.data?.clientCode).filter(Boolean),
  );
  const hasSharedInventory = records.some((record) => !record.data?.clientCode);
  const estimatedRecords = clients
    .filter(
      (client) =>
        client.data?.code &&
        !hasSharedInventory &&
        !clientsWithRealInventory.has(client.data.code),
    )
    .flatMap((client) => {
      const pricing = getClientPricing(client.data || {});
      const latest =
        makeLiveUsageSeries(
          tick,
          "24 hours",
          client.data.code,
          pricing.monthlyCost,
        ).at(-1) || {};
      return buildEstimatedResources(
        { ...client.data, code: client.data.code },
        latest,
      ).map((resource) => ({
        _id: resource._id,
        title: resource.name,
        data: { ...resource, clientCode: client.data.code },
        isEstimate: true,
      }));
    });
  const displayRecords = [...records, ...estimatedRecords];
  const running = displayRecords.filter(
    (record) => String(record.data?.status || "").toLowerCase() === "running",
  ).length;
  const totalMonthly =
    records.reduce(
      (sum, record) => sum + Number(record.data?.monthlyCost || 0),
      0,
    ) +
    estimatedRecords.reduce(
      (sum, record) => sum + Number(record.data?.monthlyCost || 0),
      0,
    );
  return (
    <>
      <div className="cl-stat-grid three">
        <MiniStat label="Total resources" value={displayRecords.length} />
        <MiniStat label="Running / estimated" value={running} />
        <MiniStat
          label="Estimated monthly allocation"
          value={money(totalMonthly, currency)}
        />
      </div>
      <section className="cl-panel cl-table-panel">
        <PanelHeader
          title="Infrastructure inventory"
          subtitle="Saved provider records and automatically estimated resources based on each client amount."
          action={
            <button className="cl-button primary small" onClick={onAdd}>
              <Plus size={14} /> Add resource
            </button>
          }
        />
        {displayRecords.length ? (
          <div className="cl-table-scroll">
            <table className="cl-table">
              <thead>
                <tr>
                  <th>RESOURCE</th>
                  <th>CLIENT</th>
                  <th>PROVIDER / REGION</th>
                  <th>CONFIGURATION</th>
                  <th>CPU</th>
                  <th>MEMORY</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {displayRecords.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <b>{r.title}</b>
                      <small>
                        {r.isEstimate
                          ? "Estimated from client amount"
                          : r.data?.category || "Resource"}
                      </small>
                    </td>
                    <td>{r.data?.clientCode || "—"}</td>
                    <td>
                      {[r.data?.provider, r.data?.region]
                        .filter(Boolean)
                        .join(" · ") || (r.isEstimate ? "Budget model" : "—")}
                    </td>
                    <td>{r.data?.specification || "—"}</td>
                    <td>
                      {r.data?.cpuPercent === "" ||
                      r.data?.cpuPercent === undefined
                        ? "—"
                        : `${Number(r.data.cpuPercent).toFixed(1)}%`}
                    </td>
                    <td>
                      {r.data?.memoryPercent === "" ||
                      r.data?.memoryPercent === undefined
                        ? "—"
                        : `${Number(r.data.memoryPercent).toFixed(1)}%`}
                    </td>
                    <td>
                      <Status
                        value={r.isEstimate ? "Estimated" : r.data?.status}
                      />
                    </td>
                    <td>
                      {!r.isEstimate && (
                        <button
                          className="cl-icon-button"
                          onClick={() => onEdit(r)}
                        >
                          <Edit3 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No infrastructure inventory"
            text="Add a client name and billing amount first. Its estimated compute, storage and network resources will appear here automatically."
          />
        )}
      </section>
      <div className="cl-manager-note">
        <Activity size={14} />
        <span>
          Estimated rows are presentation values derived from the client monthly
          equivalent. Add saved infrastructure records to replace the estimate
          with provider-supplied details.
        </span>
      </div>
    </>
  );
}

function UsageAnalytics({ records = [] }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 7000);
    return () => window.clearInterval(timer);
  }, []);
  const monthlyAmount = records
    .filter((record) => record.type === "clients" && record.isActive !== false)
    .reduce(
      (sum, record) => sum + getClientPricing(record.data || {}).monthlyCost,
      0,
    );
  const points = makeLiveUsageSeries(
    tick,
    "24 hours",
    "admin-analytics",
    monthlyAmount,
  ).map((point) => ({ ...point, displayTime: point.time }));
  const mean = (key) =>
    points.length
      ? (
          points.reduce((sum, point) => sum + Number(point[key] || 0), 0) /
          points.length
        ).toFixed(1)
      : "—";
  return (
    <>
      <div className="cl-stat-grid three">
        <MiniStat label="Average CPU" value={`${mean("cpu")}%`} />
        <MiniStat label="Average memory" value={`${mean("memory")}%`} />
        <MiniStat
          label="Network throughput"
          value={`${mean("network")} Mbps`}
        />
      </div>
      <section className="cl-panel cl-chart-panel">
        <PanelHeader
          title="Automatic performance preview"
          subtitle="Animated sample telemetry · updates every 7 seconds"
        />
        <div className="cl-chart large">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points}>
              <CartesianGrid stroke="#252c35" vertical={false} />
              <XAxis
                dataKey="displayTime"
                tick={{ fill: "#8993a0", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#8993a0", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#151b23",
                  border: "1px solid #303944",
                  borderRadius: 8,
                  color: "#e6e9ed",
                  fontSize: 11,
                }}
              />
              <Area
                dataKey="cpuPercent"
                name="CPU %"
                stroke="#cad1d9"
                fill="#cad1d922"
                isAnimationActive
                animationDuration={750}
              />
              <Area
                dataKey="memoryPercent"
                name="Memory %"
                stroke="#8798aa"
                fill="#8798aa22"
                isAnimationActive
                animationDuration={750}
              />
              <Area
                dataKey="networkMbps"
                name="Network Mbps"
                stroke="#b4a88f"
                fill="transparent"
                isAnimationActive
                animationDuration={750}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="cl-chart-foot">
          <span>
            <i /> Automatically generated sample data
          </span>
          <span>{points.length} rolling points</span>
        </div>
      </section>
      <div className="cl-manager-note">
        <Activity size={14} />
        <span>
          No chart values need to be entered. The customer-facing graphs animate
          automatically. In a future live-monitoring deployment, this generator
          can be replaced by a real cloud metrics collector.
        </span>
      </div>
    </>
  );
}

function SimpleRecords({ type, records, currency, onEdit, onAdd }) {
  const config = typeConfigs[type];
  return (
    <section className="cl-panel cl-table-panel">
      <PanelHeader
        title={typeLabels[type]}
        subtitle={`${records.length} saved record${records.length === 1 ? "" : "s"}`}
        action={
          <button className="cl-button primary small" onClick={onAdd}>
            <Plus size={14} /> Add{" "}
            {typeLabels[type].replace(/s$/, "").toLowerCase()}
          </button>
        }
      />
      {records.length ? (
        <div className="cl-table-scroll">
          <table className="cl-table">
            <thead>
              <tr>
                <th>
                  {config.fields
                    .find((x) => x.key === config.titleField)
                    ?.label.toUpperCase() || "NAME"}
                </th>
                {config.columns.map((col) => (
                  <th key={col}>{fieldLabel(config, col).toUpperCase()}</th>
                ))}
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r._id}>
                  <td>
                    <b>{r.title}</b>
                    <small>{r.data?.description || r.data?.notes || ""}</small>
                  </td>
                  {config.columns.map((col) => (
                    <td key={col}>
                      {col === "amount" || col === "monthlyPrice" ? (
                        money(r.data?.[col], r.data?.currency || currency)
                      ) : col === "status" ? (
                        <Status value={r.data?.[col]} />
                      ) : (
                        asText(r.data?.[col])
                      )}
                    </td>
                  ))}
                  <td>
                    <button
                      className="cl-icon-button"
                      onClick={() => onEdit(r)}
                    >
                      <Edit3 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={`No ${typeLabels[type].toLowerCase()} added`}
          text={`This section is empty. Create ${typeLabels[type].toLowerCase()} records to store them in MongoDB and display them here.`}
          action={`Add ${typeLabels[type].replace(/s$/, "").toLowerCase()}`}
          onAction={onAdd}
        />
      )}
    </section>
  );
}

function RecordTable({ records, columns, currency = "INR" }) {
  return (
    <div className="cl-table-scroll">
      <table className="cl-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>
                {fieldLabel(typeConfigs[records[0]?.type], c).toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r._id}>
              {columns.map((c) => (
                <td key={c}>
                  {c === "status" ? (
                    <Status value={r.data?.[c]} />
                  ) : c === "amount" ? (
                    money(r.data?.[c], r.data?.currency || currency)
                  ) : c === "timestamp" ||
                    c === "issueDate" ||
                    c === "dueDate" ? (
                    dateText(r.data?.[c])
                  ) : (
                    asText(r.data?.[c])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminManager({
  records,
  allRecords,
  type,
  setType,
  onEdit,
  onAdd,
  onDelete,
}) {
  const config = typeConfigs[type];
  return (
    <div className="cl-admin-manager">
      <section className="cl-panel cl-manager-intro">
        <div>
          <span className="cl-eyebrow">CONTENT & RECORD CONTROL</span>
          <h2>Admin manager</h2>
          <p>
            Choose a section to manage the records used by the customer
            workspace. For a new client, enter only its company name, billing
            cycle and amount; the daily cost and estimated resources are
            calculated automatically.
          </p>
        </div>
        <ShieldCheck size={27} />
      </section>
      <div className="cl-manager-tabs">
        {Object.entries(typeLabels).map(([key, label]) => {
          const Icon = typeIcons[key];
          return (
            <button
              key={key}
              className={type === key ? "selected" : ""}
              onClick={() => setType(key)}
            >
              <Icon size={14} />
              {label}
              <span>{allRecords.filter((r) => r.type === key).length}</span>
            </button>
          );
        })}
      </div>
      <section className="cl-panel cl-table-panel">
        <PanelHeader
          title={typeLabels[type]}
          subtitle={`${records.length} total records · edit a row to customize its fields`}
          action={
            <button className="cl-button primary small" onClick={onAdd}>
              <Plus size={14} /> Add record
            </button>
          }
        />
        {records.length ? (
          <div className="cl-table-scroll">
            <table className="cl-table">
              <thead>
                <tr>
                  <th>RECORD</th>
                  {config.columns.map((c) => (
                    <th key={c}>{fieldLabel(config, c).toUpperCase()}</th>
                  ))}
                  <th>VISIBILITY</th>
                  <th>UPDATED</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <b>{r.title}</b>
                      <small>{r._id}</small>
                    </td>
                    {config.columns.map((c) => (
                      <td key={c}>
                        {c === "status" ? (
                          <Status value={r.data?.[c]} />
                        ) : [
                            "contractAmount",
                            "monthlyCost",
                            "yearlyCost",
                            "dailyCost",
                            "amount",
                            "monthlyPrice",
                          ].includes(c) ? (
                          money(r.data?.[c], r.data?.currency || "INR")
                        ) : (
                          asText(r.data?.[c])
                        )}
                      </td>
                    ))}
                    <td>
                      <Status
                        value={r.isActive === false ? "Hidden" : "Visible"}
                      />
                    </td>
                    <td>{dateText(r.updatedAt)}</td>
                    <td>
                      <div className="cl-row-actions">
                        <button
                          className="cl-icon-button"
                          onClick={() => onEdit(r)}
                          title="Edit"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          className="cl-icon-button danger"
                          onClick={() => onDelete(r)}
                          title="Delete"
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
          <EmptyState
            title={`No ${typeLabels[type].toLowerCase()} records`}
            text="Your MongoDB collection is empty. Add a record and it will become available to the rest of the application."
            action="Create first record"
            onAction={onAdd}
          />
        )}
      </section>
      <div className="cl-manager-note">
        <Lock size={14} />
        <span>
          {type === "clients"
            ? "Only company name, billing cycle and amount are needed. Client code, monthly equivalent, daily run-rate and estimated resource capacity are calculated automatically."
            : "Only authenticated administrators can create, edit or delete these records. Updates are recorded in the audit log."}
        </span>
      </div>
    </div>
  );
}

function SettingsPage({
  settingsDraft,
  setSettingsDraft,
  onSave,
  saving,
  passwordDraft,
  setPasswordDraft,
  onChangePassword,
}) {
  return (
    <div className="cl-settings-layout">
      <form className="cl-panel cl-settings-form" onSubmit={onSave}>
        <PanelHeader
          title="Workspace configuration"
          subtitle="Organization identity and shared UI defaults"
        />
        <div className="cl-settings-grid">
          {settingFields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              value={displayFieldValue(
                field,
                settingsDraft[field.key] ??
                  field.defaultValue ??
                  (field.type === "json" ? {} : ""),
              )}
              onChange={(value) =>
                setSettingsDraft((old) => ({ ...old, [field.key]: value }))
              }
            />
          ))}
        </div>
        <div className="cl-form-footer">
          <span>
            These settings are stored in the MongoDB settings document.
          </span>
          <button className="cl-button primary" disabled={saving}>
            {saving ? "Saving…" : "Save settings"} <Check size={14} />
          </button>
        </div>
      </form>
      <form className="cl-panel cl-password-form" onSubmit={onChangePassword}>
        <PanelHeader
          title="Administrator security"
          subtitle="Change the password for your current account"
        />
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
          <small>Use at least 12 characters.</small>
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

function ContentBlocksPage({ blocks, settings, onManage }) {
  return (
    <div className="cl-content-block-grid">
      {blocks.length ? (
        blocks.map((block) => (
          <section className="cl-panel cl-content-block" key={block._id}>
            <h3>{block.title}</h3>
            <p>{block.data.body}</p>
            {block.data.linkUrl && (
              <a href={block.data.linkUrl} target="_blank" rel="noreferrer">
                {block.data.linkLabel || "Open link"} <ArrowUpRight size={13} />
              </a>
            )}
          </section>
        ))
      ) : (
        <section className="cl-panel">
          <EmptyState
            title="No help content configured"
            text="Create a content block and set its placement to Help / support to show it here."
            action="Manage content blocks"
            onAction={onManage}
          />
          {settings.supportEmail && (
            <p className="cl-help-contact">
              Support contact:{" "}
              <a href={`mailto:${settings.supportEmail}`}>
                {settings.supportEmail}
              </a>
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function RecordEditor({ type, record, clients = [], onClose, onSave }) {
  const config = typeConfigs[type];
  const [values, setValues] = useState(() => {
    const source = { ...(record?.data || {}) };
    config.fields.forEach((field) => {
      if (source[field.key] === undefined)
        source[field.key] = field.defaultValue ?? "";
    });
    if (type === "clients") {
      if (!source.billingCycle) source.billingCycle = "Monthly";
      if (source.contractAmount === undefined || source.contractAmount === "")
        source.contractAmount = source.monthlyCost ?? "";
    }
    if (type === "dashboardCards") source.metric = inferDashboardMetric(source);
    if (!source[config.titleField] && record?.title)
      source[config.titleField] = record.title;
    return source;
  });
  const [isActive, setIsActive] = useState(
    record?.isActive !== false && record?.data?.enabled !== "No",
  );
  const [sortOrder, setSortOrder] = useState(
    record?.sortOrder ?? record?.data?.order ?? 0,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setValues((old) => ({ ...old, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const clean = { ...values };
      config.fields.forEach((field) => {
        if (field.type === "number" && clean[field.key] !== "")
          clean[field.key] = Number(clean[field.key]);
        if (field.type === "array" && typeof clean[field.key] === "string")
          clean[field.key] = clean[field.key]
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        if (
          field.type === "json" &&
          typeof clean[field.key] === "string" &&
          clean[field.key].trim()
        ) {
          try {
            clean[field.key] = JSON.parse(clean[field.key]);
          } catch {
            throw new Error(`${field.label} must contain valid JSON.`);
          }
        }
        if (field.type === "json" && !clean[field.key]) clean[field.key] = [];
      });
      if (type === "clients") {
        const amount = Number(clean.contractAmount);
        if (!Number.isFinite(amount) || amount <= 0)
          throw new Error(
            "Enter a monthly or yearly amount greater than zero.",
          );
        clean.billingCycle =
          clean.billingCycle === "Yearly" ? "Yearly" : "Monthly";
      }
      if (type === "dashboardCards" && !dashboardMetricMeta[clean.metric])
        throw new Error("Choose a dashboard metric.");
      await onSave(type, clean, isActive, Number(sortOrder) || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const isDashboardCard = type === "dashboardCards";
  const title = isDashboardCard
    ? record
      ? "Edit dashboard card"
      : "Add dashboard card"
    : record
      ? "Edit record"
      : "Create record";
  const description = isDashboardCard
    ? "Choose what the customer sees. The value, label and icon are generated automatically from client data."
    : `Update the ${typeLabels[type].toLowerCase()} information used across the customer workspace.`;
  return (
    <div className="cl-modal-backdrop" onMouseDown={onClose}>
      <form
        className={`cl-record-editor ${isDashboardCard ? "cl-record-editor-smart" : ""}`}
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cl-modal-head">
          <div>
            <span className="cl-eyebrow">
              {isDashboardCard
                ? "CUSTOMER DASHBOARD / AUTOMATIC CARD"
                : `${typeLabels[type].toUpperCase()} / MONGODB RECORD`}
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button
            type="button"
            className="cl-icon-button"
            onClick={onClose}
            aria-label="Close editor"
          >
            <X size={18} />
          </button>
        </div>
        {error && <div className="cl-alert error">{error}</div>}
        {isDashboardCard ? (
          <>
            <div className="cl-editor-section-label">
              <span>01</span>
              <div>
                <b>Card setup</b>
                <small>Select a metric and who should see it.</small>
              </div>
            </div>
            <div className="cl-record-fields cl-record-fields-smart">
              <FieldControl
                field={config.fields.find((field) => field.key === "metric")}
                clients={clients}
                value={values.metric}
                onChange={(value) => set("metric", value)}
              />
              <FieldControl
                field={config.fields.find(
                  (field) => field.key === "clientCode",
                )}
                clients={clients}
                value={values.clientCode}
                onChange={(value) => set("clientCode", value)}
              />
            </div>
            <DashboardCardPreview
              metric={values.metric}
              clientCode={values.clientCode}
              clients={clients}
            />
          </>
        ) : (
          <>
            <div className="cl-editor-section-label">
              <span>01</span>
              <div>
                <b>{typeLabels[type]} details</b>
                <small>Only relevant information is required.</small>
              </div>
            </div>
            <div className="cl-record-fields">
              {config.fields
                .filter((field) => !["order", "enabled"].includes(field.key))
                .map((field) => (
                  <FieldControl
                    key={field.key}
                    field={field}
                    clients={clients}
                    value={displayFieldValue(field, values[field.key])}
                    onChange={(value) => set(field.key, value)}
                  />
                ))}
            </div>
          </>
        )}
        {type === "clients" && <ClientPricePreview values={values} />}
        <div className="cl-record-meta">
          <label className="cl-toggle">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>
              <b>
                {isDashboardCard
                  ? "Show on customer dashboard"
                  : "Visible in customer workspace"}
              </b>
              <small>
                {isActive
                  ? "This item will be displayed to the assigned customer."
                  : "This item is hidden from the customer."}
              </small>
            </span>
          </label>
          <label className="cl-order-field">
            <span>Display position</span>
            <input
              type="number"
              min="0"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              aria-label="Display position"
            />
          </label>
        </div>
        <div className="cl-modal-footer">
          <span>
            <ShieldCheck size={13} /> Saved securely to MongoDB
          </span>
          <button
            type="button"
            className="cl-button secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="cl-button primary" disabled={busy}>
            {busy
              ? "Saving…"
              : record
                ? "Save changes"
                : isDashboardCard
                  ? "Create card"
                  : `Create ${typeLabels[type].replace(/s$/, "").toLowerCase()}`}{" "}
            <Check size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}

function DashboardCardPreview({ metric, clientCode, clients }) {
  const definition =
    dashboardMetricMeta[metric] || dashboardMetricMeta.contractAmount;
  const selected = clients.find(
    (client) => String(client.data?.code || "") === String(clientCode || ""),
  );
  const sampleClient = selected || clients[0] || null;
  const pricing = getClientPricing(sampleClient?.data || {});
  const PreviewIcon =
    {
      wallet: Wallet,
      cpu: Gauge,
      activity: Activity,
      network: Cloud,
      storage: Database,
      server: Server,
      database: Database,
      zap: Cloud,
    }[definition.icon] || Gauge;
  let value = "Calculated automatically";
  if (sampleClient && metric === "contractAmount")
    value = `${money(pricing.contractAmount, pricing.currency || "INR")} / ${pricing.billingCycle.toLowerCase()}`;
  if (sampleClient && metric === "todayAccruedCost") {
    const accrued = getBillingAccrual(sampleClient.data || {}, new Date());
    value = money(accrued.todayAccrued, pricing.currency || "INR");
  }
  return (
    <div className="cl-dashboard-card-preview">
      <div className="cl-dashboard-card-preview-head">
        <span>
          <Gauge size={14} /> CUSTOMER VIEW PREVIEW
        </span>
        <em>
          <i /> Automatic
        </em>
      </div>
      <div className="cl-dashboard-card-preview-body">
        <div>
          <small>{definition.label}</small>
          <b>{value}</b>
          <p>{definition.description}</p>
        </div>
        <span className="cl-dashboard-preview-icon">
          <PreviewIcon size={18} />
        </span>
      </div>
      <div className="cl-dashboard-card-preview-foot">
        <span>
          {clientCode
            ? selected?.data?.name || "Selected client"
            : sampleClient
              ? `Shared card · previewing ${sampleClient.data?.name || sampleClient.title}`
              : "Shared card · applies to each client"}
        </span>
        <span>No manual values or graph points needed</span>
      </div>
    </div>
  );
}
function ClientPricePreview({ values }) {
  const amount = Math.max(0, Number(values.contractAmount || 0));
  const yearly = values.billingCycle === "Yearly";
  const monthly = amount / (yearly ? 12 : 1);
  const daily = getBillingAccrual(values, new Date()).dailyAllocation;
  const capacity = estimateCapacity(monthly);
  return (
    <div className="cl-client-price-preview">
      <div>
        <span>MONTHLY EQUIVALENT</span>
        <b>{money(monthly, "INR")}</b>
      </div>
      <div>
        <span>DAILY ALLOCATION</span>
        <b>{money(daily, "INR")}</b>
      </div>
      <div>
        <span>ESTIMATED RESOURCES</span>
        <b>
          {capacity.units
            ? `${capacity.vcpu} vCPU · ${capacity.memoryGb} GB RAM`
            : "Enter amount"}
        </b>
      </div>
      <small>
        {capacity.units
          ? `${capacity.diskGb} GB storage · ${capacity.networkMbps} Mbps network. `
          : ""}
        Estimate model: each ₹2,500 monthly equivalent maps to 1 vCPU, 2 GB RAM,
        50 GB storage and 25 Mbps network. The daily allocation uses the actual
        number of days in the current month or year. Utilization is simulated
        for the customer presentation, not measured from a cloud provider.
      </small>
    </div>
  );
}

function displayFieldValue(field, value) {
  if (field.type === "array")
    return Array.isArray(value) ? value.join(", ") : value || "";
  if (field.type === "json")
    return typeof value === "string"
      ? value
      : JSON.stringify(value ?? [], null, 2);
  if (field.type === "datetime-local" && value)
    return String(value).slice(0, 16);
  return value ?? "";
}

function FieldControl({ field, value, onChange, clients = [] }) {
  if (field.key === "clientCode")
    return (
      <label className="cl-field">
        <span>
          {field.label}
          {field.required && <em>*</em>}
        </span>
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        >
          <option value="">
            {field.required
              ? clients.length
                ? "Select a client"
                : "Add a client first"
              : "Shared / all clients"}
          </option>
          {clients.map((record) => (
            <option key={record._id} value={record.data?.code || ""}>
              {record.data?.name || record.title} ·{" "}
              {record.data?.code || "No code"}
            </option>
          ))}
        </select>
        {!clients.length && field.required && (
          <small className="cl-field-hint">
            Create a client first to assign this record.
          </small>
        )}
      </label>
    );
  return (
    <label
      className={`cl-field ${field.type === "textarea" || field.type === "json" ? "wide" : ""}`}
    >
      <span>
        {field.label}
        {field.required && <em>*</em>}
      </span>
      {field.type === "textarea" || field.type === "json" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          rows={field.type === "json" ? 6 : 3}
          placeholder={
            field.type === "json"
              ? '[\n  { "description": "Service", "amount": 1000 }\n]'
              : ""
          }
        />
      ) : field.type === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        >
          {(field.options || []).map((option) => {
            const optionValue =
              typeof option === "string" ? option : option.value;
            const optionLabel =
              typeof option === "string" ? option : option.label;
            return (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            );
          })}
        </select>
      ) : (
        <input
          type={
            field.type === "array"
              ? "text"
              : field.type === "json"
                ? "text"
                : field.type
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={
            field.type === "array" ? "Separate values with commas" : ""
          }
        />
      )}
    </label>
  );
}

function PanelHeader({ title, subtitle, action }) {
  return (
    <div className="cl-panel-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function MiniStat({ label, value }) {
  return (
    <div className="cl-mini-stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
function Status({ value }) {
  const text = value || "Not set";
  const klass = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return <span className={`cl-status ${klass}`}>{text}</span>;
}
function EmptyState({ title, text, action, onAction }) {
  return (
    <div className="cl-empty">
      <div className="cl-empty-icon">
        <Database size={20} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && onAction && (
        <button className="cl-button secondary small" onClick={onAction}>
          {action} <ArrowUpRight size={13} />
        </button>
      )}
    </div>
  );
}

function fieldLabel(config, key) {
  return (
    config?.fields?.find((f) => f.key === key)?.label ||
    key.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase())
  );
}

export default App;
