/**
 * Presentation-only pricing-to-capacity model.
 * It turns the administrator's contract amount into an illustrative resource
 * profile for the customer portal. It is NOT a cloud-provider billing or
 * monitoring calculation; replace this model with provider metrics for live
 * production measurements.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getClientPricing(client = {}) {
  const cycle = String(client.billingCycle || 'Monthly').trim().toLowerCase() === 'yearly' ? 'Yearly' : 'Monthly';
  const explicitAmount = client.contractAmount !== undefined && client.contractAmount !== null && client.contractAmount !== ''
    ? Number(client.contractAmount)
    : null;
  const fallbackMonthly = Number(client.monthlyCost ?? client.monthly ?? 0) || 0;
  const amount = explicitAmount !== null && Number.isFinite(explicitAmount)
    ? Math.max(0, explicitAmount)
    : cycle === 'Yearly'
      ? Number(client.yearlyCost || 0) || fallbackMonthly * 12
      : fallbackMonthly;
  const hasExplicit = explicitAmount !== null && Number.isFinite(explicitAmount);
  // The entered contract amount is the source of truth; stored monthly/yearly values are only a fallback for old records.
  const monthlyCost = hasExplicit
    ? (cycle === 'Yearly' ? amount / 12 : amount)
    : (cycle === 'Yearly' ? amount / 12 : fallbackMonthly);
  const now = new Date();
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysInCurrentYear = (new Date(now.getFullYear() + 1, 0, 1) - new Date(now.getFullYear(), 0, 1)) / 86_400_000;
  const dailyCost = amount / (cycle === 'Yearly' ? daysInCurrentYear : daysInCurrentMonth);
  const normalizedMonthly = Math.max(0, monthlyCost);
  const storedCapacity = client.estimatedCapacity && Number(client.estimatedCapacity.units) > 0
    ? client.estimatedCapacity
    : estimateCapacity(normalizedMonthly);
  return {
    billingCycle: cycle,
    contractAmount: amount,
    monthlyCost: normalizedMonthly,
    yearlyCost: cycle === 'Yearly' ? amount : normalizedMonthly * 12,
    dailyCost: Math.max(0, dailyCost),
    estimatedCapacity: storedCapacity,
    currency: client.currency || 'INR'
  };
}

/**
 * Illustrative allocation model: every ₹2,500/month-equivalent funds one
 * capacity unit (1 vCPU, 2 GB RAM, 50 GB disk, 25 Mbps provisioned network).
 * Capacity is capped at 64 units to keep generated demo values bounded.
 */
export function estimateCapacity(monthlyCost = 0) {
  const monthly = Math.max(0, Number(monthlyCost) || 0);
  if (!monthly) return { units: 0, vcpu: 0, memoryGb: 0, diskGb: 0, networkMbps: 0 };
  const units = clamp(Math.ceil(monthly / 2500), 1, 64);
  return {
    units,
    vcpu: units,
    memoryGb: units * 2,
    diskGb: units * 50,
    networkMbps: units * 25
  };
}

export function buildEstimatedResources(client = {}, latestMetrics = {}) {
  const pricing = getClientPricing(client);
  const capacity = pricing.estimatedCapacity || estimateCapacity(pricing.monthlyCost);
  if (!capacity.units) return [];
  const monthly = pricing.monthlyCost;
  const currency = pricing.currency;
  const cpu = Number(latestMetrics.cpu ?? 0);
  const memory = Number(latestMetrics.memory ?? 0);
  const disk = Number(latestMetrics.diskPercent ?? 0);
  return [
    {
      _id: `estimate-${client.code || 'client'}-compute`,
      name: 'Managed compute cluster', category: 'Compute', provider: client.provider || 'Managed cloud',
      region: client.region || 'Primary region', specification: `${capacity.vcpu} vCPU · ${capacity.memoryGb} GB RAM`,
      cpuPercent: Math.round(cpu * 10) / 10, memoryPercent: Math.round(memory * 10) / 10,
      monthlyCost: Math.round(monthly * 0.65), status: 'Running', estimated: true,
      memoryUsed: `${(capacity.memoryGb * memory / 100).toFixed(1)} / ${capacity.memoryGb} GB`
    },
    {
      _id: `estimate-${client.code || 'client'}-storage`,
      name: 'Managed block storage', category: 'Storage', provider: client.provider || 'Managed cloud',
      region: client.region || 'Primary region', specification: `${capacity.diskGb} GB provisioned`,
      storageGB: capacity.diskGb, storageUsedGB: Number((capacity.diskGb * disk / 100).toFixed(1)),
      monthlyCost: Math.round(monthly * 0.2), status: 'Running', estimated: true
    },
    {
      _id: `estimate-${client.code || 'client'}-network`,
      name: 'Network gateway', category: 'Network', provider: client.provider || 'Managed cloud',
      region: client.region || 'Primary region', specification: `${capacity.networkMbps} Mbps provisioned`,
      monthlyCost: Math.max(0, monthly - Math.round(monthly * 0.65) - Math.round(monthly * 0.2)),
      status: 'Running', estimated: true
    }
  ].map(resource => ({ ...resource, currency }));
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
  const yearly = pricing.billingCycle === 'Yearly';
  const year = safeNow.getFullYear();
  const month = safeNow.getMonth();
  const periodStart = yearly ? new Date(year, 0, 1) : new Date(year, month, 1);
  const periodEnd = yearly ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1);
  const periodAmount = yearly ? pricing.yearlyCost : pricing.monthlyCost;
  const periodDuration = Math.max(1, periodEnd.getTime() - periodStart.getTime());
  const elapsedPeriod = clamp(safeNow.getTime() - periodStart.getTime(), 0, periodDuration);
  const todayStart = new Date(year, month, safeNow.getDate());
  const todayEnd = new Date(year, month, safeNow.getDate() + 1);
  const todayDuration = Math.max(1, todayEnd.getTime() - todayStart.getTime());
  const elapsedToday = clamp(safeNow.getTime() - todayStart.getTime(), 0, todayDuration);
  const daysInPeriod = periodDuration / 86_400_000;
  const dailyAllocation = periodAmount > 0 ? periodAmount / daysInPeriod : 0;

  return {
    billingCycle: pricing.billingCycle,
    contractAmount: pricing.contractAmount,
    periodAmount: Math.max(0, periodAmount),
    periodLabel: yearly ? 'Year-to-date' : 'Month-to-date',
    periodStart,
    periodEnd,
    periodProgress: elapsedPeriod / periodDuration,
    periodAccrued: Math.max(0, periodAmount * (elapsedPeriod / periodDuration)),
    dailyAllocation: Math.max(0, dailyAllocation),
    todayProgress: elapsedToday / todayDuration,
    todayAccrued: Math.max(0, dailyAllocation * (elapsedToday / todayDuration)),
    remainingToday: Math.max(0, dailyAllocation * (1 - elapsedToday / todayDuration))
  };
}
