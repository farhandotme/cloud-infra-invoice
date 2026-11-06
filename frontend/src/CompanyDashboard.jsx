import React, { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Terminal,
  MapPin,
  Folder,
  FolderOpen,
  FileCode2,
  ChevronRight,
  ShieldCheck,
  Activity,
  ArrowUpRight,
  Filter,
  MoreHorizontal,
  CalendarDays,
} from "lucide-react";
import {
  makeLiveUsageSeries,
  makeContractAccrualHistory,
  getContractAccrualRangeBudget,
} from "./liveTelemetry.js";
import {
  getClientPricing,
  getBillingAccrual,
  buildEstimatedServices,
  buildServerProfile,
  isUsableResourceRecord,
} from "./pricingModel.js";

const cash = (value, currency = "INR") => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;
  }
};
const cashPrecise = (value, currency = "INR") => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
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
const timeText = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const numberText = (value) => Number(value || 0).toLocaleString("en-IN");
const displayNumber = (value) =>
  value === undefined || value === null || value === ""
    ? "—"
    : numberText(value);
const avg = (rows, key) => {
  const values = rows
    .map((row) => row[key])
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map(Number)
    .filter(Number.isFinite);
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
};

const compactCash = (value, currency = "INR") => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Number(value || 0));
  } catch {
    return cash(value, currency);
  }
};

function SpendTooltip({ active, payload, label, currency = "INR" }) {
  if (!active || !payload?.length) return null;
  const actual = payload.find(
    (item) =>
      item.dataKey === "cost" &&
      item.value !== null &&
      item.value !== undefined,
  );
  const projected = payload.find(
    (item) =>
      item.dataKey === "projection" &&
      item.value !== null &&
      item.value !== undefined,
  );
  const showProjected =
    projected &&
    (!actual ||
      Math.abs(Number(projected.value) - Number(actual.value)) > 0.01);
  const point = payload[0]?.payload;
  const timestampLabel =
    label === "24:00"
      ? "Day end · 24:00"
      : point?.timestamp
        ? new Date(point.timestamp).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : label;
  return (
    <div className="spend-chart-tooltip">
      <strong>{timestampLabel}</strong>
      {actual && (
        <div>
          <span>
            <i className="actual-dot" /> Accrued so far
          </span>
          <b>{cashPrecise(actual.value, currency)}</b>
        </div>
      )}
      {showProjected && label !== "24:00" && (
        <div>
          <span>
            <i className="forecast-dot" /> Day-end run-rate
          </span>
          <b>{cashPrecise(projected.value, currency)}</b>
        </div>
      )}
      {projected && label === "24:00" && (
        <div>
          <span>
            <i className="forecast-dot" /> Full-day allocation
          </span>
          <b>{cashPrecise(projected.value, currency)}</b>
        </div>
      )}
    </div>
  );
}

export default function CompanyDashboard({
  clients = [],
  selectedClient,
  setSelectedClient,
  resources = [],
  profile = {},
  deployments = [],
  runtimeSpecs = [],
  codebaseFiles = [],
  terminalEntries = [],
  activities = [],
  contentBlocks = [],
  currency = "INR",
}) {
  const [range, setRange] = useState("1D");
  const [tab, setTab] = useState("Overview");
  const [fileId, setFileId] = useState("");
  const [tick, setTick] = useState(0);
  const [billingTick, setBillingTick] = useState(() => Date.now());
  const client = selectedClient;
  const clientResources = resources.filter(
    (resource) => !resource.clientCode || resource.clientCode === client?.code,
  );
  const resourceMonthlyCost = clientResources.reduce(
    (sum, resource) => sum + Number(resource.monthlyCost || 0),
    0,
  );
  const pricing = getClientPricing(client || {});
  const monthlyCost = Number(pricing.monthlyCost || resourceMonthlyCost || 0);
  const capacity = pricing.estimatedCapacity;

  // This sample telemetry rolls forward automatically, like the original demo.
  // Admins enter the client's contract amount and billing cycle—not cost-chart points.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 7000);
    return () => window.clearInterval(timer);
  }, []);

  // The cost counter follows wall-clock time, not a full-day flat amount.
  useEffect(() => {
    const timer = window.setInterval(() => setBillingTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const liveMetrics = useMemo(
    () =>
      makeLiveUsageSeries(
        tick,
        "24 hours",
        client?.code || "client",
        monthlyCost,
      ),
    [tick, client?.code, monthlyCost],
  );
  const latest = liveMetrics[liveMetrics.length - 1] || {};
  const cpu = avg(liveMetrics, "cpu");
  const ram = avg(liveMetrics, "memory");
  const disk = avg(liveMetrics, "diskPercent");
  const net = avg(liveMetrics, "network");
  const cpuUsedCores = (capacity.vcpu * cpu) / 100;
  const memoryUsedGb = (capacity.memoryGb * ram) / 100;
  const diskUsedGb = (capacity.diskGb * disk) / 100;
  const billingNow = new Date(billingTick);
  const billingAccrual = getBillingAccrual(client || {}, billingNow);
  const hasRunRate = Number(pricing.contractAmount) > 0;
  const healthScore = Number(latest.healthScore || 0);
  const healthy = healthScore >= 80 ? "Healthy" : "Needs review";
  const history = useMemo(
    () => makeContractAccrualHistory(range, client || {}, billingNow),
    [
      range,
      billingTick,
      client?.code,
      pricing.billingCycle,
      pricing.monthlyCost,
      pricing.yearlyCost,
    ],
  );
  const rangeBudget = useMemo(
    () => getContractAccrualRangeBudget(range, client || {}, billingNow),
    [
      range,
      billingTick,
      client?.code,
      pricing.billingCycle,
      pricing.monthlyCost,
      pricing.yearlyCost,
    ],
  );
  const nowPoint =
    history.find((point) => point.isNow) || history[history.length - 1];
  const chosenFile =
    codebaseFiles.find((item) => item._id === fileId) ||
    codebaseFiles[0] ||
    null;
  const savedServiceResources = clientResources.filter(
    (resource) =>
      isUsableResourceRecord(resource) &&
      /container|service|docker|database|cache|worker|mongo|redis|api|web/i.test(
        `${resource.category || ""} ${resource.name || ""}`,
      ),
  );
  const serviceResources = savedServiceResources.length
    ? savedServiceResources
    : buildEstimatedServices(client || {}, latest);
  const runtimeLabel =
    profile.containerRuntime ||
    (serviceResources.length
      ? "Docker · Node.js 22 · MongoDB 8 · Redis 7"
      : "Runtime not configured");
  const logRows = terminalEntries.length ? terminalEntries : activities;
  const environment =
    profile.environment ||
    profile.environmentName ||
    "Environment not configured";
  const provider =
    profile.provider || client?.provider || "Cloud provider not specified";
  const region =
    profile.regionName ||
    profile.region ||
    client?.region ||
    "Region not specified";
  const regionCode = profile.regionCode || "";
  const healthLabel = healthy;
  const uptime = profile.uptime || "—";
  // Server health card only: fill blanks automatically from the contract amount.
  const auto = buildServerProfile(client || {}, billingNow) || {};
  const hasSavedProvider = Boolean(profile.provider || client?.provider);
  const hasSavedRegion = Boolean(
    profile.regionName || profile.region || client?.region,
  );
  const cardProvider = hasSavedProvider ? provider : auto.provider || provider;
  const cardRegion = hasSavedRegion ? region : auto.region || region;
  const cardRegionCode = hasSavedRegion
    ? regionCode
    : profile.regionCode || auto.regionCode || "";
  const cardServer = {
    name:
      profile.primaryResource ||
      clientResources[0]?.name ||
      auto.primaryResource ||
      "Primary resource not configured",
    type:
      profile.primaryResourceType ||
      clientResources[0]?.specification ||
      auto.primaryResourceType ||
      "Server details not configured",
    availabilityZone: profile.availabilityZone || auto.availabilityZone,
    operatingSystem: profile.operatingSystem || auto.operatingSystem,
    uptime: profile.uptime || auto.uptime || "—",
    instanceState:
      profile.instanceState || clientResources[0]?.status || auto.instanceState,
  };

  if (!client)
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <Server />
        </div>
        <h2>No client workspace selected</h2>
        <p>
          Your cloud administrator has not configured a customer account yet.
        </p>
      </div>
    );

  return (
    <div className="company-workspace">
      <div className="company-select-bar">
        <div>
          <i className="live-dot" /> CLIENT ENVIRONMENT{" "}
          <b>{environment.toUpperCase()}</b>
        </div>
        <select
          value={client.code}
          onChange={(event) => {
            const next = clients.find(
              (item) => item.code === event.target.value,
            );
            if (next) setSelectedClient(next);
          }}
        >
          {clients.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name} · {item.code}
            </option>
          ))}
        </select>
      </div>
      <div className="company-hero">
        <div>
          <div className="company-kicker">
            CLIENT INFRASTRUCTURE / {client.code}
          </div>
          <h2>{client.name}</h2>
          <p className="hero-meta">
            <i className="healthy-pulse" />{" "}
            {profile.environmentStatus || healthLabel} <span>·</span>{" "}
            {profile.operatingSystem || "Operating system not configured"}
          </p>
          <div className="deployment-tags">
            <span className="location-tag">
              <MapPin size={12} /> {profile.location || region}
            </span>
            <span className="region-tag">
              {provider}
              {regionCode ? (
                <>
                  {" "}
                  · <b>{regionCode}</b>
                </>
              ) : null}
            </span>
            {profile.availabilityZone && (
              <span className="zone-tag">
                Availability zone · {profile.availabilityZone}
              </span>
            )}
          </div>
        </div>
        <div className="hero-actions">
          <span
            className={`status ${healthy === "Healthy" ? "connected" : "pending"}`}
          >
            {healthy}
          </span>
        </div>
      </div>
      <div className="company-metrics">
        <Metric
          tone="cost"
          label="TODAY'S ACCRUED COST"
          value={
            hasRunRate
              ? cashPrecise(billingAccrual.todayAccrued, currency)
              : "—"
          }
          unit=""
          sub="Accruing continuously from 00:00 · resets at midnight"
        />
        <Metric
          tone="cpu"
          label="CPU UTILIZATION"
          value={cpu.toFixed(1)}
          unit="%"
          sub={`${cpuUsedCores.toFixed(2)} / ${profile.vcpuAllocated || capacity.vcpu} vCPU · 24h average`}
          bar={cpu}
        />
        <Metric
          tone="memory"
          label="MEMORY USAGE"
          value={ram.toFixed(1)}
          unit="%"
          sub={`${memoryUsedGb.toFixed(2)} / ${capacity.memoryGb} GB · 24h average`}
          bar={ram}
        />
        <Metric
          tone="disk"
          label="DISK UTILIZATION"
          value={disk.toFixed(1)}
          unit="%"
          sub={`${diskUsedGb.toFixed(1)} / ${capacity.diskGb} GB · 24h average`}
          bar={disk}
        />
        <Metric
          tone="network"
          label="NETWORK I/O"
          value={net.toFixed(1)}
          unit=" Mbps"
          sub={`${capacity.networkMbps} Mbps provisioned · 24h average`}
          bar={capacity.networkMbps ? (net / capacity.networkMbps) * 100 : 0}
        />
      </div>
      <div className="company-estimate-note">
        <span className="live-dot" /> Today's cost increases in proportion to
        elapsed time and resets at midnight. In the Daily chart, the solid line
        is accrued so far and the dashed line is the contract run-rate through
        midnight. The agreed monthly or yearly contract amount stays fixed. CPU,
        memory, disk and network figures are presentation estimates, not
        readings from a connected cloud provider.
      </div>
      <div className="company-tabs">
        {[
          "Overview",
          "Servers & services",
          "Codebase",
          "Terminal",
          "Activity log",
        ].map((value) => (
          <button
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
            key={value}
          >
            {value}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <>
          <div className="company-grid">
            <section className="panel spend-panel">
              <div className="panel-head">
                <div>
                  <h3>Infrastructure cost movement</h3>
                  <p>Time-based contract accrual · {client.name}</p>
                </div>
                <span className="live-pill">● LIVE ACCRUAL</span>
              </div>
              <div className="spend-summary">
                <div>
                  <small>{billingAccrual.periodLabel} accrued</small>
                  <b>
                    {hasRunRate
                      ? cash(billingAccrual.periodAccrued, currency)
                      : "—"}
                  </b>
                </div>
                <div>
                  <small>Agreed contract amount</small>
                  <b>
                    {hasRunRate ? (
                      <>
                        {cash(pricing.contractAmount, currency)}{" "}
                        <span className="spend-cycle">
                          / {pricing.billingCycle.toLowerCase()}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </b>
                </div>
              </div>
              <div className="range-tabs">
                {[
                  ["1D", "Daily"],
                  ["1W", "Weekly"],
                  ["1M", "Monthly"],
                  ["1Y", "Yearly"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={range === value ? "chosen" : ""}
                    onClick={() => setRange(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {history.length ? (
                <div className="spend-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={history}
                      margin={{ top: 12, right: 16, left: 4, bottom: 2 }}
                    >
                      <defs>
                        <linearGradient
                          id="spendFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#c8cdd5"
                            stopOpacity={0.24}
                          />
                          <stop
                            offset="100%"
                            stopColor="#c8cdd5"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#edf0f4" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9, fill: "#929baa" }}
                        axisLine={false}
                        tickLine={false}
                        interval={range === "1D" ? 3 : "preserveStartEnd"}
                      />
                      <YAxis
                        domain={[0, Math.max(rangeBudget, 1)]}
                        tick={{ fontSize: 9, fill: "#929baa" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => compactCash(value, currency)}
                        tickCount={5}
                        width={58}
                      />
                      <Tooltip
                        content={<SpendTooltip currency={currency} />}
                        cursor={{ stroke: "#8290a0", strokeDasharray: "3 3" }}
                      />
                      {range === "1D" && nowPoint?.label && (
                        <ReferenceLine
                          x={nowPoint.label}
                          stroke="#20a57f"
                          strokeDasharray="4 4"
                          strokeOpacity={0.8}
                          label={{
                            value: "NOW",
                            fill: "#20a57f",
                            fontSize: 9,
                            position: "insideTopRight",
                          }}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="cost"
                        name="Accrued so far"
                        stroke="#c8cdd5"
                        strokeWidth={2.4}
                        fill="url(#spendFill)"
                        connectNulls={false}
                        isAnimationActive
                        animationDuration={350}
                      />
                      {range === "1D" && (
                        <Line
                          type="monotone"
                          dataKey="projection"
                          name="Day-end run-rate"
                          stroke="#20a57f"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={{ r: 4 }}
                          connectNulls={false}
                          isAnimationActive
                          animationDuration={350}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="chart-empty">
                  Add a monthly or yearly contract amount to calculate
                  time-based accrual.
                </div>
              )}
              <div className="chart-bottom">
                <span>
                  <i className="live-dot" />{" "}
                  {range === "1D"
                    ? "Solid: accrued so far · dashed: day-end run-rate · updates every second"
                    : "Contract amount accrued from elapsed time · updates every second"}
                </span>
                <span>
                  {range === "1D"
                    ? "Full 24-hour scale"
                    : `${history.length} time points`}
                </span>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Server health</h3>
                  <p>Primary production environment</p>
                </div>
                <span className="status connected">{healthLabel}</span>
              </div>
              <div className="server-identity">
                <div className="server-icon">
                  <Server size={19} />
                </div>
                <div>
                  <b>{cardServer.name}</b>
                  <small>{cardServer.type}</small>
                </div>
              </div>
              <div className="server-specs">
                {[
                  ["Cloud provider", cardProvider],
                  [
                    "Region",
                    cardRegionCode
                      ? `${cardRegion} · ${cardRegionCode}`
                      : cardRegion,
                  ],
                  ["Availability zone", cardServer.availabilityZone],
                  ["Operating system", cardServer.operatingSystem],
                  ["Primary IP", profile.primaryIp],
                  ["Uptime", cardServer.uptime],
                  ["Instance state", cardServer.instanceState],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <b>{value}</b>
                    </div>
                  ))}
              </div>
              <button
                className="text-link"
                onClick={() => setTab("Servers & services")}
              >
                View full server details <ArrowUpRight size={13} />
              </button>
            </section>
          </div>
          <div className="workload-grid">
            <section className="panel workload-panel">
              <div className="panel-head">
                <div>
                  <h3>Application workload</h3>
                  <p>Automatically generated rolling sample</p>
                </div>
                <span className="status connected">Live simulation</span>
              </div>
              <div className="workload-kpis">
                <div>
                  <small>REQUESTS</small>
                  <b>
                    {displayNumber(latest.requestRate)}
                    <em>/sec</em>
                  </b>
                </div>
                <div>
                  <small>P95 LATENCY</small>
                  <b>
                    {latest.latencyMs}
                    <em>ms</em>
                  </b>
                </div>
                <div>
                  <small>ERROR RATE</small>
                  <b>
                    {latest.errorRate}
                    <em>%</em>
                  </b>
                </div>
                <div>
                  <small>ACTIVE SESSIONS</small>
                  <b>{displayNumber(latest.activeSessions)}</b>
                </div>
              </div>
              <div className="workload-separator" />
              <WorkloadRow
                label="Database connections"
                value={latest.databaseConnections}
                max={latest.databaseConnectionLimit}
              />
              <WorkloadRow
                label="Redis cache hit ratio"
                value={latest.cacheHitRatio}
                max={100}
                suffix="%"
              />
              <WorkloadRow
                label="Background queue depth"
                value={latest.queueDepth}
                max={latest.queueCapacity}
                suffix=" jobs"
              />
              <div className="workload-footer">
                <span>
                  Worker concurrency <b>{latest.workerConcurrency}</b>
                </span>
                <span>
                  Scheduled jobs <b>{latest.scheduledJobs}</b>
                </span>
                <span>
                  Open connections <b>{latest.openConnections}</b>
                </span>
              </div>
            </section>
            <section className="panel technical-table-panel">
              <div className="panel-head">
                <div>
                  <h3>Running containers & services</h3>
                  <p>
                    {runtimeLabel} · {serviceResources.length} services{" "}
                    <span className="estimated-inline-label">
                      AUTO-GENERATED ESTIMATE
                    </span>
                  </p>
                </div>
                <span className="status connected">
                  {serviceResources.length
                    ? `${serviceResources.filter((item) => String(item.status).toLowerCase() === "running").length} running`
                    : "No services"}
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>CONTAINER / SERVICE</th>
                      <th>IMAGE / RUNTIME</th>
                      <th>CPU</th>
                      <th>MEMORY</th>
                      <th>RESTARTS</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceResources.map((resource) => (
                      <tr key={resource._id || resource.name}>
                        <td>
                          <b>{resource.name}</b>
                          <small>
                            {resource.estimated
                              ? "Estimated service"
                              : resource.category || "Service"}
                          </small>
                        </td>
                        <td>
                          {resource.image ||
                            resource.runtime ||
                            resource.specification ||
                            "—"}
                        </td>
                        <td>
                          {resource.cpuPercent === undefined
                            ? "—"
                            : `${resource.cpuPercent}%`}
                        </td>
                        <td>
                          {resource.memoryUsed ||
                            (resource.memoryPercent === undefined
                              ? "—"
                              : `${resource.memoryPercent}%`)}
                        </td>
                        <td>{resource.restarts ?? "—"}</td>
                        <td>
                          <span
                            className={`status ${String(resource.status || "").toLowerCase() === "running" ? "connected" : ""}`}
                          >
                            {resource.status || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {serviceResources.length === 0 && (
                  <div className="no-results">
                    Add a client contract amount to generate its service profile
                    automatically.
                  </div>
                )}
              </div>
            </section>
          </div>
          <div className="technical-overview-grid">
            <section className="panel runtime-panel">
              <div className="panel-head">
                <div>
                  <h3>Runtime & host configuration</h3>
                  <p>Configured environment specifications</p>
                </div>
                <span className="status connected">
                  {runtimeSpecs.length ? "Configured" : "Not configured"}
                </span>
              </div>
              <div className="runtime-grid">
                {runtimeSpecs.map((spec) => (
                  <div key={spec._id || spec.label}>
                    <small>{spec.label}</small>
                    <b>{spec.value || "—"}</b>
                  </div>
                ))}
              </div>
              {runtimeSpecs.length === 0 && (
                <div className="no-results">
                  No runtime specifications have been added.
                </div>
              )}
            </section>
            <section className="panel deploy-panel">
              <div className="panel-head">
                <div>
                  <h3>Deployment pipeline</h3>
                  <p>Release and build records</p>
                </div>
                <span className="status connected">
                  {profile.deploymentStatus || "Not configured"}
                </span>
              </div>
              {deployments.slice(0, 5).map((item) => (
                <div className="deploy-row" key={item._id || item.version}>
                  <span className="deploy-check">✓</span>
                  <div>
                    <b>{item.version || item.title}</b>
                    <small>
                      {item.description || item.branch || ""}
                      {item.buildDuration
                        ? ` · Build ${item.buildDuration}`
                        : ""}
                      {item.buildSuccessRate !== undefined &&
                      item.buildSuccessRate !== ""
                        ? ` · ${item.buildSuccessRate}% success`
                        : ""}
                      {item.rollbackPoint
                        ? ` · Rollback ${item.rollbackPoint}`
                        : ""}
                    </small>
                  </div>
                  <time>
                    {item.deployedAt ? dateText(item.deployedAt) : "—"}
                  </time>
                  <span className="deploy-state">{item.status || "—"}</span>
                </div>
              ))}
              {deployments.length === 0 && (
                <div className="no-results">
                  No deployment records have been added.
                </div>
              )}
            </section>
          </div>
          <section className="panel system-log-panel">
            <div className="panel-head">
              <div>
                <h3>System event stream</h3>
                <p>Admin-managed operational notes and event records</p>
              </div>
              <span className="live-pill">EVENTS</span>
            </div>
            {logRows.slice(0, 6).map((item, index) => (
              <div
                className="system-log-row"
                key={item._id || item.timestamp || index}
              >
                <time>{timeText(item.timestamp || item.occurredAt)}</time>
                <b
                  className={String(
                    item.level || item.severity || "info",
                  ).toLowerCase()}
                >
                  {item.level || item.severity || "INFO"}
                </b>
                <span>
                  {item.message || item.description || item.title || "—"}
                </span>
              </div>
            ))}
            {logRows.length === 0 && (
              <div className="no-results">
                No operational events have been added.
              </div>
            )}
          </section>
        </>
      )}

      {tab === "Servers & services" && (
        <section className="panel table-panel">
          <div className="panel-head">
            <div>
              <h3>Compute & managed services</h3>
              <p>
                Estimated from the {pricing.billingCycle.toLowerCase()} contract
                for {client.name}
              </p>
            </div>
            <span className="status connected">
              {clientResources.length} resources
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>RESOURCE</th>
                  <th>TYPE</th>
                  <th>REGION</th>
                  <th>CPU</th>
                  <th>MEMORY</th>
                  <th>MONTHLY COST</th>
                  <th>STATE</th>
                </tr>
              </thead>
              <tbody>
                {clientResources.map((resource) => (
                  <tr key={resource._id || resource.name}>
                    <td>
                      <b>{resource.name}</b>
                    </td>
                    <td>
                      {resource.category || "—"} ·{" "}
                      {resource.specification || ""}
                    </td>
                    <td>{resource.region || "—"}</td>
                    <td>
                      {resource.cpuPercent === undefined
                        ? "—"
                        : `${resource.cpuPercent}%`}
                    </td>
                    <td>
                      {resource.memoryPercent === undefined
                        ? "—"
                        : `${resource.memoryPercent}%`}
                    </td>
                    <td>{cash(resource.monthlyCost, currency)}</td>
                    <td>
                      <span className="status connected">
                        {resource.status || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {clientResources.length === 0 && (
              <div className="no-results">
                No infrastructure inventory was manually added. The resource
                estimates above are generated from the client contract amount.
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "Codebase" && (
        <div className="devtools-grid codebase-grid">
          <section className="panel file-panel">
            <div className="panel-head">
              <div>
                <h3>
                  <Folder size={14} /> Codebase explorer
                </h3>
                <p>Repository file information published by your provider</p>
              </div>
              <span className="status connected">Read-only</span>
            </div>
            <div className="repo-path">
              {profile.repositoryPath || "Repository path not configured"}
            </div>
            <div className="file-tree">
              {codebaseFiles.map((item) => (
                <button
                  key={item._id || item.path}
                  className={`tree-node ${chosenFile?._id === item._id ? "picked" : ""}`}
                  onClick={() => setFileId(item._id)}
                >
                  <FileCode2 size={13} />
                  <span>{item.path || item.name}</span>
                </button>
              ))}
            </div>
            <div className="file-foot">
              <ShieldCheck size={12} /> Read-only customer view
            </div>
          </section>
          <section className="panel code-panel">
            <div className="code-head">
              <div>
                <FileCode2 size={14} />
                <b>
                  {chosenFile?.path || chosenFile?.name || "No file selected"}
                </b>
              </div>
              <span>READ ONLY</span>
            </div>
            <pre>
              {chosenFile?.content ||
                "// No code preview has been added by your provider."}
            </pre>
            <div className="code-foot">
              <span>{chosenFile?.encoding || "UTF-8"}</span>
              <span>Read-only repository preview</span>
            </div>
          </section>
        </div>
      )}

      {tab === "Terminal" && (
        <section className="panel terminal-page">
          <div className="terminal-page-head">
            <div>
              <div className="terminal-title">
                <Terminal size={16} />
                <h3>Operational console output</h3>
                <i className="terminal-dot" />
              </div>
              <p>
                Read-only output notes supplied by your cloud administrator ·{" "}
                {client.name}
              </p>
            </div>
            <span className="terminal-connection">READ ONLY</span>
          </div>
          <div className="terminal-session-meta">
            <span>
              <i /> output records: {terminalEntries.length}
            </span>
            <span>environment: {environment}</span>
            <span>host: {profile.primaryResource || "Not configured"}</span>
            <span>path: {profile.repositoryPath || "—"}</span>
          </div>
          <div className="terminal-screen">
            <div className="terminal-screen-toolbar">
              <span>CONFIGURED OUTPUT</span>
              <span>Administrator-maintained content</span>
            </div>
            <div className="terminal-output terminal-output-large">
              {terminalEntries.map((entry, index) => (
                <React.Fragment key={entry._id || index}>
                  <div className="prompt-line">
                    {entry.command
                      ? `$ ${entry.command}`
                      : `[${entry.level || "INFO"}] ${entry.timestamp ? dateText(entry.timestamp) : ""}`}
                  </div>
                  <div>
                    {entry.output || entry.message || entry.description || ""}
                  </div>
                </React.Fragment>
              ))}
              {terminalEntries.length === 0 && (
                <div>No terminal output records have been published.</div>
              )}
            </div>
          </div>
          <div className="terminal-safety-note">
            <ShieldCheck size={14} />
            <span>
              This view is read-only. It does not connect to or execute commands
              on a production server.
            </span>
          </div>
        </section>
      )}

      {tab === "Activity log" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Operational activity</h3>
              <p>Recent events and deployment actions</p>
            </div>
          </div>
          {activities.map((item, index) => (
            <div className="activity-entry" key={item._id || index}>
              <span>{timeText(item.occurredAt || item.timestamp)}</span>
              <b>{item.title || item.actor || "Activity"}</b>
              <p>{item.description || item.message || ""}</p>
              <span className="status connected">
                {item.severity || item.status || "Info"}
              </span>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="no-results">
              No activity entries have been added.
            </div>
          )}
        </section>
      )}
      {tab === "Overview" && contentBlocks.length > 0 && (
        <div className="customer-content-block-grid">
          {contentBlocks.map((block) => (
            <section className="panel" key={block._id}>
              <h3>{block.title}</h3>
              <p>{block.body}</p>
              {block.linkUrl && (
                <a href={block.linkUrl} target="_blank" rel="noreferrer">
                  {block.linkLabel || "Learn more"} <ArrowUpRight size={13} />
                </a>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, unit, sub, bar, tone = "neutral" }) {
  return (
    <div className={`company-metric metric-${tone}`}>
      <span>{label}</span>
      <b>
        {value}
        <small>{unit}</small>
      </b>
      {bar !== undefined ? (
        <>
          <div className="metric-bar">
            <i
              style={{ width: `${Math.max(0, Math.min(100, Number(bar)))}%` }}
            />
          </div>
          <em>{sub}</em>
        </>
      ) : (
        <em>{sub}</em>
      )}
    </div>
  );
}
function WorkloadRow({ label, value, max, suffix = "" }) {
  const hasValue = value !== undefined && value !== null && value !== "";
  const percentage =
    hasValue && Number(max) > 0
      ? Math.min(100, (Number(value) / Number(max)) * 100)
      : 0;
  return (
    <div className="workload-row">
      <span>{label}</span>
      <b>{hasValue ? `${numberText(value)}${suffix}` : "—"}</b>
      <i>
        <em style={{ width: `${percentage}%` }} />
      </i>
    </div>
  );
}
