import { estimateCapacity, getClientPricing } from "./pricingModel.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hashScope(scope = "") {
  return [...String(scope)].reduce(
    (sum, character) => (sum * 31 + character.charCodeAt(0)) % 997,
    0,
  );
}

/**
 * Animated presentation telemetry. The monthly amount controls the estimated
 * capacity and the shape/range of the generated values. These are simulated
 * estimates, not measurements reported by a cloud provider.
 */
export function makeLiveUsageSeries(
  seed = 0,
  period = "24 hours",
  scope = "",
  monthlyCost = 0,
) {
  const count = period === "1 hour" ? 13 : period === "7 days" ? 29 : 25;
  const stepMinutes = period === "1 hour" ? 5 : period === "7 days" ? 360 : 60;
  const offset = hashScope(scope);
  const now = Date.now();
  const capacity = estimateCapacity(monthlyCost);
  const budgetTier = Math.max(0, Math.log2(Math.max(1, capacity.units)));
  const cpuBase = capacity.units ? clamp(30 + budgetTier * 2.2, 28, 48) : 0;
  const memoryBase = capacity.units ? clamp(48 + budgetTier * 1.6, 45, 62) : 0;
  const diskBase = capacity.units ? clamp(43 + budgetTier * 1.8, 40, 61) : 0;
  const networkBase = capacity.units
    ? Math.max(2, capacity.networkMbps * 0.34)
    : 0;

  return Array.from({ length: count }, (_, index) => {
    const phase = index + seed * 0.72 + offset * 0.013;
    const jitter = ((index * 7 + seed * 3 + offset) % 9) - 4;
    const cpu = capacity.units
      ? clamp(cpuBase + Math.sin(phase * 0.65) * 9 + jitter, 8, 88)
      : 0;
    const memory = capacity.units
      ? clamp(
          memoryBase +
            Math.cos(phase * 0.39) * 7 +
            ((index * 5 + seed + offset) % 5) -
            2,
          18,
          91,
        )
      : 0;
    const network = capacity.units
      ? clamp(
          networkBase +
            Math.sin(phase * 0.82) * Math.max(2, networkBase * 0.3) +
            ((index * 3 + seed + offset) % 5),
          1,
          capacity.networkMbps,
        )
      : 0;
    const disk = capacity.units
      ? clamp(
          diskBase + Math.sin(phase * 0.22) * 5 + ((index + seed + offset) % 4),
          20,
          83,
        )
      : 0;
    const minutesBack = (count - index - 1) * stepMinutes;
    const timestamp = new Date(now - minutesBack * 60_000);
    const clockLabel = timestamp.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const time =
      period === "7 days"
        ? `${index === 0 ? timestamp.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : timestamp.toLocaleDateString("en-IN", { weekday: "short" })} ${clockLabel}`
        : period === "24 hours" && index === 0
          ? `${timestamp.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} ${clockLabel}`
          : clockLabel;
    const cpuCoresUsed = capacity.units ? (capacity.vcpu * cpu) / 100 : 0;
    const memoryGbUsed = capacity.units
      ? (capacity.memoryGb * memory) / 100
      : 0;
    const diskGbUsed = capacity.units ? (capacity.diskGb * disk) / 100 : 0;

    return {
      time,
      label: time,
      timestamp: timestamp.toISOString(),
      cpu: Number(cpu.toFixed(1)),
      memory: Number(memory.toFixed(1)),
      network: Number(network.toFixed(1)),
      cpuPercent: Number(cpu.toFixed(1)),
      memoryPercent: Number(memory.toFixed(1)),
      networkMbps: Number(network.toFixed(1)),
      diskPercent: Number(disk.toFixed(1)),
      cpuCoresUsed: Number(cpuCoresUsed.toFixed(2)),
      memoryGbUsed: Number(memoryGbUsed.toFixed(2)),
      diskGbUsed: Number(diskGbUsed.toFixed(2)),
      vcpuAllocated: capacity.vcpu,
      memoryAllocatedGb: capacity.memoryGb,
      diskAllocatedGb: capacity.diskGb,
      networkAllocatedMbps: capacity.networkMbps,
      storageIops: Math.round(900 + network * 36 + Math.sin(phase) * 260),
      requestRate: Math.round(45 + network * 1.8 + Math.sin(phase * 0.7) * 16),
      latencyMs: Math.round(58 + (100 - cpu) * 0.22 + Math.cos(phase) * 8),
      errorRate: Number(
        (0.02 + Math.abs(Math.sin(phase * 0.31)) * 0.09).toFixed(2),
      ),
      activeSessions: Math.round(18 + network * 0.7 + (index % 8) * 2),
      databaseConnections: Math.round(8 + memory * 0.24),
      databaseConnectionLimit: Math.max(25, capacity.vcpu * 25),
      cacheHitRatio: Number((93.2 + Math.sin(phase * 0.2) * 1.6).toFixed(1)),
      queueDepth: Math.round(2 + network * 0.12 + (index % 5)),
      queueCapacity: Math.max(20, capacity.vcpu * 10),
      workerConcurrency: Math.max(2, capacity.vcpu * 2),
      scheduledJobs: Math.max(3, capacity.vcpu * 2),
      openConnections: Math.round(28 + network * 1.6),
      healthScore: Number(
        clamp(99 - cpu * 0.035 - memory * 0.025 - disk * 0.018, 84, 99).toFixed(
          1,
        ),
      ),
    };
  });
}

/**
 * Return the full contract allocation for the selected chart window. Keeping
 * this scale fixed prevents a partial day/month from filling the entire chart.
 */
export function getContractAccrualRangeBudget(
  range = "1D",
  client = {},
  now = new Date(),
) {
  const pricing = getClientPricing(client);
  if (!(pricing.monthlyCost > 0 || pricing.yearlyCost > 0)) return 0;
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (Number.isNaN(current.getTime())) return 0;

  const todayStart = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
  );
  const start =
    range === "1D"
      ? todayStart
      : range === "1W"
        ? new Date(
            current.getFullYear(),
            current.getMonth(),
            current.getDate() - 6,
          )
        : range === "1M"
          ? new Date(current.getFullYear(), current.getMonth(), 1)
          : new Date(current.getFullYear(), 0, 1);
  const end =
    range === "1D"
      ? new Date(
          todayStart.getFullYear(),
          todayStart.getMonth(),
          todayStart.getDate() + 1,
        )
      : range === "1W"
        ? new Date(
            todayStart.getFullYear(),
            todayStart.getMonth(),
            todayStart.getDate() + 1,
          )
        : range === "1M"
          ? new Date(current.getFullYear(), current.getMonth() + 1, 1)
          : new Date(current.getFullYear() + 1, 0, 1);

  let total = 0;
  let cursor = new Date(start.getTime());
  let guard = 0;
  while (cursor < end && guard < 400) {
    const nextDay = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
    );
    const daysInMonth = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0,
    ).getDate();
    const daysInYear =
      (new Date(cursor.getFullYear() + 1, 0, 1) -
        new Date(cursor.getFullYear(), 0, 1)) /
      86_400_000;
    const dailyAmount =
      pricing.billingCycle === "Yearly"
        ? pricing.yearlyCost / daysInYear
        : pricing.monthlyCost / daysInMonth;
    total += dailyAmount;
    cursor = nextDay;
    guard += 1;
  }
  return Math.max(0, Number(total.toFixed(2)));
}

/**
 * Contract accrual history. Solid values are elapsed contract accrual only.
 * For the daily view the chart spans the full 24 hours: a dashed line shows
 * the deterministic day-end run-rate projection after the current time.
 * All values are contract-proration estimates, not provider-metered charges.
 */
export function makeContractAccrualHistory(
  range = "1D",
  client = {},
  now = new Date(),
) {
  const pricing = getClientPricing(client);
  const contractValue =
    pricing.billingCycle === "Yearly"
      ? pricing.yearlyCost
      : pricing.monthlyCost;
  if (!(contractValue > 0)) return [];

  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (Number.isNaN(current.getTime())) return [];
  const todayStart = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
  );
  const todayEnd = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate() + 1,
  );
  const start =
    range === "1D"
      ? todayStart
      : range === "1W"
        ? new Date(
            current.getFullYear(),
            current.getMonth(),
            current.getDate() - 6,
          )
        : range === "1M"
          ? new Date(current.getFullYear(), current.getMonth(), 1)
          : new Date(current.getFullYear(), 0, 1);

  const dailyAmountFor = (date) => {
    const daysInMonth = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
    ).getDate();
    const daysInYear =
      (new Date(date.getFullYear() + 1, 0, 1) -
        new Date(date.getFullYear(), 0, 1)) /
      86_400_000;
    return pricing.billingCycle === "Yearly"
      ? pricing.yearlyCost / daysInYear
      : pricing.monthlyCost / daysInMonth;
  };

  const accrueBetween = (from, to) => {
    if (to <= from) return 0;
    let cursor = new Date(from.getTime());
    let total = 0;
    let guard = 0;
    while (cursor < to && guard < 400) {
      const dayStart = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
      );
      const nextDay = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1,
      );
      const segmentEnd = nextDay < to ? nextDay : to;
      const fullDayMs = Math.max(1, nextDay.getTime() - dayStart.getTime());
      total +=
        (dailyAmountFor(cursor) *
          Math.max(0, segmentEnd.getTime() - cursor.getTime())) /
        fullDayMs;
      cursor = segmentEnd;
      guard += 1;
    }
    return total;
  };

  let checkpoints = [];
  if (range === "1D") {
    checkpoints = Array.from(
      { length: 25 },
      (_, hour) =>
        new Date(
          todayStart.getFullYear(),
          todayStart.getMonth(),
          todayStart.getDate(),
          hour,
        ),
    );
    if (current > todayStart && current < todayEnd) checkpoints.push(current);
    checkpoints.sort((a, b) => a.getTime() - b.getTime());
  } else {
    checkpoints = [new Date(start.getTime())];
    if (range === "1Y") {
      for (let month = 1; month <= current.getMonth(); month += 1) {
        const point = new Date(current.getFullYear(), month, 1);
        if (point < current) checkpoints.push(point);
      }
    } else {
      let point = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + 1,
      );
      while (point < current) {
        checkpoints.push(point);
        point = new Date(
          point.getFullYear(),
          point.getMonth(),
          point.getDate() + 1,
        );
      }
    }
    if (checkpoints[checkpoints.length - 1].getTime() !== current.getTime())
      checkpoints.push(current);
  }

  const currentDayAccrued = accrueBetween(todayStart, current);
  return checkpoints.map((point, index) => {
    const isFuture = point > current;
    const isNow = point.getTime() === current.getTime();
    const labelDate =
      index === 0
        ? point
        : new Date(point.getTime() - (point > current ? 0 : 1));
    const label =
      range === "1D"
        ? point.getTime() === todayEnd.getTime()
          ? "24:00"
          : point.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
        : range === "1Y"
          ? labelDate.toLocaleDateString("en-IN", { month: "short" })
          : range === "1W"
            ? labelDate.toLocaleDateString("en-IN", { weekday: "short" })
            : String(labelDate.getDate()).padStart(2, "0");

    const actualCost =
      range === "1D"
        ? isFuture
          ? null
          : accrueBetween(start, point)
        : accrueBetween(start, point);
    const projection =
      range === "1D" && point >= current
        ? dailyAmountFor(todayStart) *
          Math.max(
            0,
            Math.min(
              1,
              (point.getTime() - todayStart.getTime()) /
                (todayEnd.getTime() - todayStart.getTime()),
            ),
          )
        : null;

    return {
      label,
      cost: actualCost === null ? null : Number(actualCost.toFixed(2)),
      projection: projection === null ? null : Number(projection.toFixed(2)),
      timestamp: point.toISOString(),
      isNow,
      isFuture,
      currentAccrued: Number(currentDayAccrued.toFixed(2)),
    };
  });
}
