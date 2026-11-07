/**
 * Presentation-only pricing-to-capacity model.
 * It turns the administrator's contract amount into an illustrative resource
 * profile for the customer portal. It is NOT a cloud-provider billing or
 * monitoring calculation; replace this model with provider metrics for live
 * production measurements.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getClientPricing(client = {}) {
  const cycle =
    String(client.billingCycle || "Monthly")
      .trim()
      .toLowerCase() === "yearly"
      ? "Yearly"
      : "Monthly";
  const explicitAmount =
    client.contractAmount !== undefined &&
    client.contractAmount !== null &&
    client.contractAmount !== ""
      ? Number(client.contractAmount)
      : null;
  const fallbackMonthly =
    Number(client.monthlyCost ?? client.monthly ?? 0) || 0;
  const amount =
    explicitAmount !== null && Number.isFinite(explicitAmount)
      ? Math.max(0, explicitAmount)
      : cycle === "Yearly"
        ? Number(client.yearlyCost || 0) || fallbackMonthly * 12
        : fallbackMonthly;
  const monthlyCost =
    cycle === "Yearly" && explicitAmount !== null
      ? amount / 12
      : fallbackMonthly || amount;
  const now = new Date();
  const daysInCurrentMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const daysInCurrentYear =
    (new Date(now.getFullYear() + 1, 0, 1) -
      new Date(now.getFullYear(), 0, 1)) /
    86_400_000;
  const dailyCost =
    amount / (cycle === "Yearly" ? daysInCurrentYear : daysInCurrentMonth);
  const normalizedMonthly = Math.max(0, monthlyCost);
  const storedCapacity =
    client.estimatedCapacity && Number(client.estimatedCapacity.units) > 0
      ? client.estimatedCapacity
      : estimateCapacity(normalizedMonthly);
  return {
    billingCycle: cycle,
    contractAmount: amount,
    monthlyCost: normalizedMonthly,
    yearlyCost:
      cycle === "Yearly" && explicitAmount !== null
        ? amount
        : normalizedMonthly * 12,
    dailyCost: Math.max(0, dailyCost),
    estimatedCapacity: storedCapacity,
    currency: client.currency || "INR",
  };
}

/**
 * Illustrative allocation model: every ₹2,500/month-equivalent funds one
 * capacity unit (1 vCPU, 2 GB RAM, 50 GB disk, 25 Mbps provisioned network).
 * Capacity is capped at 64 units to keep generated demo values bounded.
 */
export function estimateCapacity(monthlyCost = 0) {
  const monthly = Math.max(0, Number(monthlyCost) || 0);
  if (!monthly)
    return { units: 0, vcpu: 0, memoryGb: 0, diskGb: 0, networkMbps: 0 };
  const units = clamp(Math.ceil(monthly / 2500), 1, 64);
  return {
    units,
    vcpu: units,
    memoryGb: units * 2,
    diskGb: units * 50,
    networkMbps: units * 25,
  };
}

const PLACEHOLDER_RESOURCE_VALUES = new Set([
  "resource / instance name",
  "resource/instance name",
  "resource type",
  "provider",
  "region / location",
  "region/location",
  "environment",
  "configuration / specification",
  "resource status",
  "image",
  "runtime",
  "memory used / limit",
  "restart count",
]);

function normalizePlaceholder(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/\s+/g, " ");
}

/** Ignore old blank records whose labels were accidentally saved as values. */
export function isUsableResourceRecord(resource = {}) {
  const data =
    resource.data && typeof resource.data === "object"
      ? resource.data
      : resource;
  const title = normalizePlaceholder(resource.title);
  const name = normalizePlaceholder(data.name || resource.title);
  if (
    !name ||
    PLACEHOLDER_RESOURCE_VALUES.has(name) ||
    PLACEHOLDER_RESOURCE_VALUES.has(title)
  )
    return false;
  return true;
}

/**
 * Automatic illustrative containers/services generated from the client price.
 * This is presentation data only, not a live inventory from Docker/Kubernetes.
 */
export function buildEstimatedServices(client = {}, latestMetrics = {}) {
  const pricing = getClientPricing(client);
  const capacity =
    pricing.estimatedCapacity || estimateCapacity(pricing.monthlyCost);
  if (!capacity.units) return [];

  const cpu = clamp(
    Number(latestMetrics.cpu ?? latestMetrics.cpuPercent ?? 34),
    8,
    88,
  );
  const memory = clamp(
    Number(latestMetrics.memory ?? latestMetrics.memoryPercent ?? 52),
    18,
    91,
  );
  const memoryGb = Math.max(2, Number(capacity.memoryGb || 2));
  const provider = client.provider || "Managed cloud";
  const region = client.region || "Primary region";
  const slug = String(client.code || client.name || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const memoryEntry = (share, utilization) => {
    const limit = Math.max(0.25, memoryGb * share);
    const used = (limit * utilization) / 100;
    return `${used.toFixed(1)} / ${limit.toFixed(1)} GB`;
  };
  const memoryPercent = (multiplier) =>
    Number(clamp(memory * multiplier, 12, 92).toFixed(1));
  const cpuPercent = (multiplier) =>
    Number(clamp(cpu * multiplier, 3, 90).toFixed(1));
  const rows = [
    {
      name: `${slug}-api`,
      category: "Container",
      provider,
      region,
      image: "node:22-alpine",
      runtime: "Docker · Node.js 22",
      specification: `${Math.max(0.25, Number((capacity.vcpu * 0.45).toFixed(2)))} vCPU · API container`,
      cpuPercent: cpuPercent(0.72),
      memoryPercent: memoryPercent(0.72),
      memoryUsed: memoryEntry(0.32, memoryPercent(0.72)),
      restarts: 0,
      status: "Running",
      estimated: true,
    },
    {
      name: `${slug}-mongodb`,
      category: "Database",
      provider,
      region,
      image: "mongo:8",
      runtime: "MongoDB 8",
      specification: "Managed document database",
      cpuPercent: cpuPercent(0.46),
      memoryPercent: memoryPercent(0.84),
      memoryUsed: memoryEntry(0.38, memoryPercent(0.84)),
      restarts: 0,
      status: "Running",
      estimated: true,
    },
    {
      name: `${slug}-redis`,
      category: "Cache",
      provider,
      region,
      image: "redis:7-alpine",
      runtime: "Redis 7",
      specification: "In-memory cache service",
      cpuPercent: cpuPercent(0.24),
      memoryPercent: memoryPercent(0.38),
      memoryUsed: memoryEntry(0.12, memoryPercent(0.38)),
      restarts: 0,
      status: "Running",
      estimated: true,
    },
  ];
  if (capacity.units >= 2) {
    rows.push({
      name: `${slug}-worker`,
      category: "Worker",
      provider,
      region,
      image: "node:22-alpine",
      runtime: "Docker · Node.js 22",
      specification: `${Math.max(1, capacity.vcpu - 1)} background worker${capacity.vcpu > 2 ? "s" : ""}`,
      cpuPercent: cpuPercent(0.31),
      memoryPercent: memoryPercent(0.48),
      memoryUsed: memoryEntry(0.18, memoryPercent(0.48)),
      restarts: 0,
      status: "Running",
      estimated: true,
    });
  }
  return rows.map((row) => ({
    ...row,
    _id: `estimate-${slug}-${row.category.toLowerCase()}`,
    clientCode: client.code || "",
    currency: pricing.currency,
  }));
}

/**
 * Automatic "Server health" card values derived from the contract amount.
 * Anything the admin saved (client/profile fields) still wins; this only fills
 * the blanks. Presentation data only, not a provider reading.
 * Tiers (by monthly-equivalent amount): <₹10k single zone · <₹40k two zones ·
 * above that multi-zone with a higher uptime target.
 */
export function buildServerProfile(client = {}, now = new Date()) {
  const pricing = getClientPricing(client);
  const capacity =
    pricing.estimatedCapacity || estimateCapacity(pricing.monthlyCost);
  if (!capacity.units) return null;

  const monthly = pricing.monthlyCost;
  const tier = monthly >= 40000 ? 3 : monthly >= 10000 ? 2 : 1;
  const accrual = getBillingAccrual(client, now);
  const upMs = Math.max(0, now.getTime() - accrual.periodStart.getTime());
  const days = Math.floor(upMs / 86_400_000);
  const hours = Math.floor(upMs / 3_600_000) % 24;
  const minutes = Math.floor(upMs / 60_000) % 60;
  const slaPercent = tier === 3 ? "99.99" : tier === 2 ? "99.95" : "99.90";

  return {
    provider: "Infrastructure Services",
    region: "Asia Pacific (Mumbai)",
    regionCode: "ap-south-1",
    availabilityZone:
      tier === 1
        ? "ap-south-1a"
        : tier === 2
          ? "ap-south-1a / 1b"
          : "ap-south-1a / 1b / 1c",
    operatingSystem: "Ubuntu 24.04 LTS",
    primaryResource: "Managed compute cluster",
    primaryResourceType: `${capacity.vcpu} vCPU · ${capacity.memoryGb} GB RAM`,
    uptime: `${slaPercent}% · ${days}d ${hours}h ${minutes}m`,
    instanceState: "Running",
  };
}

export function buildEstimatedResources(client = {}, latestMetrics = {}) {
  const pricing = getClientPricing(client);
  const capacity =
    pricing.estimatedCapacity || estimateCapacity(pricing.monthlyCost);
  if (!capacity.units) return [];
  const monthly = pricing.monthlyCost;
  const currency = pricing.currency;
  const cpu = Number(latestMetrics.cpu ?? 0);
  const memory = Number(latestMetrics.memory ?? 0);
  const disk = Number(latestMetrics.diskPercent ?? 0);
  return [
    {
      _id: `estimate-${client.code || "client"}-compute`,
      name: "Managed compute cluster",
      category: "Compute",
      provider: client.provider || "Managed cloud",
      region: client.region || "Primary region",
      specification: `${capacity.vcpu} vCPU · ${capacity.memoryGb} GB RAM`,
      cpuPercent: Math.round(cpu * 10) / 10,
      memoryPercent: Math.round(memory * 10) / 10,
      monthlyCost: Math.round(monthly * 0.65),
      status: "Running",
      estimated: true,
      memoryUsed: `${((capacity.memoryGb * memory) / 100).toFixed(1)} / ${capacity.memoryGb} GB`,
    },
    {
      _id: `estimate-${client.code || "client"}-storage`,
      name: "Managed block storage",
      category: "Storage",
      provider: client.provider || "Managed cloud",
      region: client.region || "Primary region",
      specification: `${capacity.diskGb} GB provisioned`,
      storageGB: capacity.diskGb,
      storageUsedGB: Number(((capacity.diskGb * disk) / 100).toFixed(1)),
      monthlyCost: Math.round(monthly * 0.2),
      status: "Running",
      estimated: true,
    },
    {
      _id: `estimate-${client.code || "client"}-network`,
      name: "Network gateway",
      category: "Network",
      provider: client.provider || "Managed cloud",
      region: client.region || "Primary region",
      specification: `${capacity.networkMbps} Mbps provisioned`,
      monthlyCost: Math.max(
        0,
        monthly - Math.round(monthly * 0.65) - Math.round(monthly * 0.2),
      ),
      status: "Running",
      estimated: true,
    },
  ].map((resource) => ({ ...resource, currency }));
}

/**
 * Time-based contract accrual for the customer-facing billing display.
 * Monthly contracts accrue evenly across the actual days in the current month;
 * yearly contracts accrue evenly across the actual days in the current year.
 * The result is a presentation calculation, not a provider usage charge.
 */
export function getBillingAccrual(client = {}, now = new Date()) {
  const pricing = getClientPricing(client);
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const safeNow = Number.isNaN(current.getTime()) ? new Date() : current;
  const yearly = pricing.billingCycle === "Yearly";
  const year = safeNow.getFullYear();
  const month = safeNow.getMonth();
  const periodStart = yearly ? new Date(year, 0, 1) : new Date(year, month, 1);
  const periodEnd = yearly
    ? new Date(year + 1, 0, 1)
    : new Date(year, month + 1, 1);
  const periodAmount = yearly ? pricing.yearlyCost : pricing.monthlyCost;
  const periodDuration = Math.max(
    1,
    periodEnd.getTime() - periodStart.getTime(),
  );
  const elapsedPeriod = clamp(
    safeNow.getTime() - periodStart.getTime(),
    0,
    periodDuration,
  );
  const todayStart = new Date(year, month, safeNow.getDate());
  const todayEnd = new Date(year, month, safeNow.getDate() + 1);
  const todayDuration = Math.max(1, todayEnd.getTime() - todayStart.getTime());
  const elapsedToday = clamp(
    safeNow.getTime() - todayStart.getTime(),
    0,
    todayDuration,
  );
  const daysInPeriod = periodDuration / 86_400_000;
  const dailyAllocation = periodAmount > 0 ? periodAmount / daysInPeriod : 0;

  return {
    billingCycle: pricing.billingCycle,
    contractAmount: pricing.contractAmount,
    periodAmount: Math.max(0, periodAmount),
    periodLabel: yearly ? "Year-to-date" : "Month-to-date",
    periodStart,
    periodEnd,
    periodProgress: elapsedPeriod / periodDuration,
    periodAccrued: Math.max(0, periodAmount * (elapsedPeriod / periodDuration)),
    dailyAllocation: Math.max(0, dailyAllocation),
    todayProgress: elapsedToday / todayDuration,
    todayAccrued: Math.max(0, dailyAllocation * (elapsedToday / todayDuration)),
    remainingToday: Math.max(
      0,
      dailyAllocation * (1 - elapsedToday / todayDuration),
    ),
  };
}
