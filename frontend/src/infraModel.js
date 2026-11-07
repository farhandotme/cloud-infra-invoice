/**
 * Presentation-only infrastructure profile for the customer Overview tab:
 * "Runtime & host configuration", "Deployment pipeline" and "System event stream".
 * Everything is generated from the company name/code and the contract amount.
 * Higher contract amounts unlock bigger set-ups (multi-AZ load balancer, WAF,
 * Shield, origin-shielded CDN, hourly cross-region backups, more SMS quota...).
 * These are illustrative sample values, NOT a live inventory or real events.
 */
import {
  getClientPricing,
  estimateCapacity,
  buildServerProfile,
} from "./pricingModel.js";

const slugify = (value) =>
  String(value || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "client";
const hash = (text) =>
  [...String(text)].reduce(
    (sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 100003,
    7,
  );
const two = (value) => String(value).padStart(2, "0");
const inr = (value) => Number(value).toLocaleString("en-IN");
const DAY = 86_400_000;

function context(client, now) {
  const pricing = getClientPricing(client);
  const capacity =
    pricing.estimatedCapacity || estimateCapacity(pricing.monthlyCost);
  if (!capacity.units) return null;
  const monthly = pricing.monthlyCost;
  const tier = monthly >= 40000 ? 3 : monthly >= 10000 ? 2 : 1;
  const server = buildServerProfile(client, now) || {};
  const code = client.code || "CLIENT";
  return {
    pricing,
    capacity,
    tier,
    server,
    code,
    slug: slugify(client.name || client.code),
    name: client.name || client.company || "Client",
    seed: hash(`${code}-${client.name || ""}`),
    zones: String(server.availabilityZone || "a").split("/").length,
  };
}

export function buildEstimatedRuntimeSpecs(client = {}, now = new Date()) {
  const c = context(client, now);
  if (!c) return [];
  const { capacity, tier, server, seed, zones, slug } = c;
  const apiReplicas = Math.max(1, Math.min(6, Math.ceil(capacity.vcpu / 4)));
  const workers = Math.max(2, capacity.vcpu * 2);
  const maxInstances = tier === 1 ? 1 : tier === 2 ? 4 : 10;
  const cacheHit = (90 + (seed % 70) / 10).toFixed(1);
  const sslDays = 28 + (seed % 55) - Math.floor((now.getTime() / DAY) % 28);
  const sslExpiry = Math.max(7, sslDays);
  const edge = tier === 1 ? "400+" : tier === 2 ? "450+" : "600+";
  const sms = tier === 1 ? 5000 : tier === 2 ? 25000 : 100000;
  const wafRules = tier === 1 ? 6 : tier === 2 ? 24 : 48;
  const retention =
    tier === 1
      ? "7-day retention"
      : tier === 2
        ? "14-day retention"
        : "30-day retention · cross-region copy";

  return [
    {
      label: "CONTAINER RUNTIME",
      value:
        tier === 3
          ? "Kubernetes 1.30 (EKS) · Node.js 22"
          : "Docker 27 · Node.js 22",
    },
    {
      label: "OPERATING SYSTEM",
      value: `${server.operatingSystem || "Ubuntu 24.04 LTS"} · kernel 6.8`,
    },
    {
      label: "COMPUTE",
      value: `${capacity.vcpu} vCPU · ${capacity.memoryGb} GB RAM · ${capacity.diskGb} GB NVMe`,
    },
    {
      label: "LOAD BALANCER",
      value:
        tier === 1
          ? "Nginx reverse proxy · 1 node"
          : `Load Balancer · ${apiReplicas} targets · ${zones}-AZ`,
    },
    {
      label: "AUTO SCALING",
      value:
        tier === 1
          ? "Manual scaling"
          : `1–${maxInstances} instances · scale out at 70% CPU`,
    },
    {
      label: "CDN",
      value: `CloudFront · ${edge} edge locations · ${cacheHit}% cache hit${tier === 3 ? " · Origin Shield" : ""}`,
    },
    {
      label: "SSL / TLS",
      value: `ACM certificate · TLS 1.3 · auto-renew · expires in ${sslExpiry} days`,
    },
    {
      label: "FIREWALL / WAF",
      value:
        tier === 1
          ? `Security groups · ${wafRules} inbound rules`
          : `WAF · OWASP Top 10 · ${wafRules} rules${tier === 3 ? " · rate limiting" : ""}`,
    },
    {
      label: "DDOS PROTECTION",
      value: tier === 3 ? "Shield Advanced · 24×7 response" : "Shield Standard",
    },
    {
      label: "SECURITY",
      value: `${tier === 1 ? "SSH key-only access" : "SSH via SSM Session Manager"} · AES-256 at rest${tier >= 2 ? " · secrets in Secrets Manager" : ""}`,
    },
    {
      label: "QUEUE WORKER",
      value: `BullMQ on Redis 7 · ${workers} workers · ${tier + 2} queues`,
    },
    {
      label: "SMS GATEWAY",
      value: `SNS · ${inr(sms)} SMS/month${tier === 3 ? " · Pinpoint campaigns" : ""} · DLT registered`,
    },
    {
      label: "DATABASE",
      value: `MongoDB 8 · ${zones > 1 ? `replica set (1 primary + ${zones - 1} secondary)` : "single node"}`,
    },
    {
      label: "CACHE",
      value: `Redis 7 · ${Math.max(0.25, capacity.memoryGb * 0.12).toFixed(1)} GB maxmemory · LRU`,
    },
    {
      label: "CI / CD",
      value: `GitHub Actions · main → production · ${tier === 1 ? "rolling" : "blue/green"} deploy`,
    },
    {
      label: "BACKUPS",
      value: `${tier === 3 ? "Hourly" : "Daily"} snapshots · ${retention}`,
    },
    {
      label: "MONITORING",
      value: `CloudWatch${tier >= 2 ? " · Prometheus · Grafana" : ""} · alerts to ${slug}-ops`,
    },
    {
      label: "REGION",
      value: `${server.region || "Asia Pacific (Mumbai)"} · ${server.regionCode || "ap-south-1"}`,
    },
  ];
}

export function buildEstimatedDeployments(client = {}, now = new Date()) {
  const c = context(client, now);
  if (!c) return [];
  const { tier, seed, slug, name } = c;
  const major = tier;
  const minor = 4 + (seed % 9);
  const patch = 3 + (seed % 4);
  const ago = [0.2, 2, 5, 9, 14];
  const notes = [
    `Release ${slug}-api · health checks passed · traffic shifted 100%`,
    "Dependency updates and security patches",
    `Queue worker tuning for ${name}`,
    "Database index and connection-pool changes",
    "Observability and alerting improvements",
  ];
  const versions = [
    `v${major}.${minor}.${patch}`,
    `v${major}.${minor}.${patch - 1}`,
    `v${major}.${minor}.${Math.max(0, patch - 2)}`,
    `v${major}.${minor - 1}.0`,
    `v${major}.${minor - 2}.1`,
  ];
  const rollbacks = [
    versions[1],
    versions[2],
    versions[3],
    versions[4],
    `v${major}.${minor - 3}.0`,
  ];
  return ago.map((days, i) => {
    const when = new Date(now.getTime() - days * DAY);
    const seconds = 95 + ((seed + i * 37) % 120) - (tier - 1) * 12;
    return {
      _id: `estimate-${slug}-deploy-${i}`,
      version: versions[i],
      description: `${notes[i]} · ${two(when.getHours())}:${two(when.getMinutes())}`,
      branch: "main",
      buildDuration: `${Math.floor(seconds / 60)}m ${two(seconds % 60)}s`,
      buildSuccessRate: Math.min(
        100,
        [100, 100, 98, 100, 96][i] + (tier === 3 && i > 2 ? 2 : 0),
      ),
      rollbackPoint: rollbacks[i],
      deployedAt: when.toISOString(),
      status: i === 0 ? "Live" : "Success",
      estimated: true,
    };
  });
}

export function buildEstimatedEvents(client = {}, now = new Date()) {
  const c = context(client, now);
  if (!c) return [];
  const { capacity, tier, seed, slug, server } = c;
  const mins = (n) => new Date(now.getTime() - n * 60_000).toISOString();
  const blocked = (tier === 1 ? 40 : tier === 2 ? 320 : 1800) + (seed % 90);
  const sent = (tier === 1 ? 60 : tier === 2 ? 410 : 2300) + (seed % 120);
  return [
    {
      level: "INFO",
      timestamp: mins(2),
      message: `Health check passed · ${slug}-api responded 200 in ${12 + (seed % 14)}ms`,
    },
    {
      level: "INFO",
      timestamp: mins(11),
      message:
        tier === 1
          ? "Nginx upstream healthy · 1/1 node in rotation"
          : `Load balancer: all targets healthy across ${c.zones} availability zone${c.zones > 1 ? "s" : ""}`,
    },
    {
      level: "WARN",
      timestamp: mins(26),
      message: `Firewall blocked ${inr(blocked)} malicious requests in the last hour${tier >= 2 ? " (WAF managed rules)" : ""}`,
    },
    {
      level: "INFO",
      timestamp: mins(44),
      message: `Queue worker drained usage-rollup queue · ${capacity.vcpu * 2} workers idle`,
    },
    {
      level: "INFO",
      timestamp: mins(70),
      message: `SMS gateway delivered ${inr(sent)} messages today · delivery rate 99.${4 + (seed % 5)}%`,
    },
    {
      level: "INFO",
      timestamp: mins(95),
      message: `CDN cache purge completed · ${server.regionCode || "ap-south-1"} origin refreshed`,
    },
    {
      level: "INFO",
      timestamp: mins(180),
      message: "SSL certificate verified · auto-renewal scheduled",
    },
    {
      level: "INFO",
      timestamp: mins(360),
      message: `${tier === 3 ? "Hourly" : "Daily"} backup snapshot completed successfully`,
    },
  ].map((entry, index) => ({
    ...entry,
    _id: `estimate-${slug}-event-${index}`,
    estimated: true,
  }));
}
