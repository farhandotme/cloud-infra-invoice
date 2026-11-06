/**
 * Presentation-only console transcript for the customer "Terminal" tab.
 * Commands and output are generated from the company name/code, the contract
 * amount (capacity model) and the dashboard's rolling sample metrics, so each
 * company sees its own host, containers, limits and figures.
 * It is NOT output from a real server and nothing here is executed.
 */
import { getClientPricing, estimateCapacity, buildServerProfile, buildEstimatedServices } from './pricingModel.js';

const slugify = value => String(value || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
const pad = (value, width) => String(value).padEnd(width, ' ');
const two = value => String(value).padStart(2, '0');
const stamp = date => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}Z`;
const hash = text => [...String(text)].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 100003, 7);
const sha = (seed, n, len = 7) => (Math.abs(hash(`${seed}-${n}`) * 2654435761 % 4294967296).toString(16).padStart(8, '0') + Math.abs(hash(`${n}-${seed}`) * 40503 % 4294967296).toString(16).padStart(8, '0')).slice(0, len);

export function getTerminalContext(client = {}, now = new Date()) {
  const slug = slugify(client.name || client.code);
  const server = buildServerProfile(client, now) || {};
  return {
    slug,
    environment: 'Production',
    host: `${slug}-prod-01`,
    server
  };
}

export function buildEstimatedTerminal(client = {}, metrics = {}, now = new Date()) {
  const pricing = getClientPricing(client);
  const capacity = pricing.estimatedCapacity || estimateCapacity(pricing.monthlyCost);
  if (!capacity.units) return [];

  const { slug, host, server } = getTerminalContext(client, now);
  const name = client.name || client.company || 'Client';
  const code = client.code || 'CLIENT';
  const regionCode = server.regionCode || 'ap-south-1';
  const nameSuffix = { Container: 'api', Database: 'mongodb', Cache: 'redis', Worker: 'worker' };
  // Name containers after the company (same convention as the Codebase tab).
  const services = buildEstimatedServices(client, metrics).map(s => ({ ...s, name: `${slug}-${nameSuffix[s.category] || 'svc'}` }));
  const cpu = Number(metrics.cpu ?? metrics.cpuPercent ?? 34);
  const mem = Number(metrics.memory ?? metrics.memoryPercent ?? 52);
  const disk = Number(metrics.diskPercent ?? 48);
  const memUsed = capacity.memoryGb * mem / 100;
  const diskUsed = capacity.diskGb * disk / 100;
  const port = 4000 + ([...code].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 900);
  const upMs = Math.max(0, now.getTime() - new Date(now.getFullYear(), now.getMonth(), 1).getTime());
  const upDays = Math.floor(upMs / 86_400_000);
  const upHours = Math.floor(upMs / 3_600_000) % 24;
  const upMins = Math.floor(upMs / 60_000) % 60;
  const requestRate = Number(metrics.requestRate ?? 60);
  const latency = Number(metrics.latencyMs ?? 64);
  const dbConn = Number(metrics.databaseConnections ?? 18);
  const dbLimit = Math.max(10, capacity.vcpu * 10);
  const minutesAgo = n => new Date(now.getTime() - n * 60_000);
  const clock = date => `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
  const load = (cpu / 100 * capacity.vcpu);

  const psRows = services.map((s, i) => {
    const image = s.image || 'node:22-alpine';
    const ports = s.category === 'Container' ? `0.0.0.0:${port}->${port}/tcp`
      : s.category === 'Database' ? '27017/tcp' : s.category === 'Cache' ? '6379/tcp' : '';
    const up = s.category === 'Worker' ? `Up ${Math.max(1, upDays)} days` : `Up ${Math.max(1, upDays)} days (healthy)`;
    return `${sha(slug, i, 12)}  ${pad(image, 18)} ${pad(up, 26)} ${pad(ports, 24)} ${s.name}`;
  });
  const statsRows = services.map(s => `${pad(s.name, 34)} ${pad(`${s.cpuPercent}%`, 8)} ${pad(s.memoryUsed || '—', 18)} ${s.restarts ?? 0}`);

  const apiLog = (n, text) => `${stamp(minutesAgo(n))} INFO  ${text}`;

  const entries = [
    {
      command: 'hostnamectl && uptime',
      output: [
        ` Static hostname: ${host}`,
        `       Chassis: vm · ${server.provider || 'Managed cloud'}`,
        `  Operating System: ${server.operatingSystem || 'Ubuntu 24.04 LTS'}`,
        `        Region: ${regionCode} (${server.availabilityZone || `${regionCode}a`})`,
        ` ${clock(now)} up ${upDays} days, ${upHours}:${two(upMins)},  1 user,  load average: ${load.toFixed(2)}, ${(load * 0.94).toFixed(2)}, ${(load * 0.88).toFixed(2)}`
      ].join('\n'),
      level: 'INFO', timestamp: now.toISOString()
    },
    {
      command: 'docker ps',
      output: [`${pad('CONTAINER ID', 14)}${pad('IMAGE', 18)} ${pad('STATUS', 26)} ${pad('PORTS', 24)} NAMES`, ...psRows].join('\n'),
      level: 'INFO', timestamp: minutesAgo(1).toISOString()
    },
    {
      command: 'docker stats --no-stream',
      output: [`${pad('NAME', 34)} ${pad('CPU %', 8)} ${pad('MEM USAGE / LIMIT', 18)} RESTARTS`, ...statsRows].join('\n'),
      level: 'INFO', timestamp: minutesAgo(2).toISOString()
    },
    {
      command: 'free -h && df -h /',
      output: [
        '               total        used        free      available',
        `Mem:           ${capacity.memoryGb.toFixed(1)}Gi       ${memUsed.toFixed(1)}Gi       ${(capacity.memoryGb - memUsed).toFixed(1)}Gi       ${(capacity.memoryGb - memUsed * 0.92).toFixed(1)}Gi`,
        'Filesystem      Size  Used Avail Use% Mounted on',
        `/dev/nvme0n1p1  ${capacity.diskGb}G  ${diskUsed.toFixed(0)}G  ${(capacity.diskGb - diskUsed).toFixed(0)}G  ${disk.toFixed(0)}% /`
      ].join('\n'),
      level: 'INFO', timestamp: minutesAgo(3).toISOString()
    },
    {
      command: `curl -s localhost:${port}/health`,
      output: `{"status":"ok","company":"${name.replace(/"/g, '\\"')}","uptime":${Math.round(upMs / 1000)},"db":"connected"}`,
      level: 'INFO', timestamp: minutesAgo(4).toISOString()
    },
    {
      command: `docker logs ${slug}-api --tail 5`,
      output: [
        apiLog(6, `GET /api/account 200 ${Math.max(6, Math.round(latency * 0.32))}ms`),
        apiLog(5, `GET /api/usage/capacity 200 ${Math.max(3, Math.round(latency * 0.12))}ms`),
        apiLog(3, `mongo pool ${dbConn}/${dbLimit} connections in use`),
        apiLog(2, `throughput ${requestRate} req/s · p95 ${latency}ms`),
        apiLog(1, 'GET /health 200 2ms')
      ].join('\n'),
      level: 'INFO', timestamp: minutesAgo(5).toISOString()
    },
    {
      command: `docker exec ${slug}-redis redis-cli ping`,
      output: 'PONG',
      level: 'INFO', timestamp: minutesAgo(6).toISOString()
    },
    {
      command: `docker exec ${slug}-mongodb mongosh --quiet --eval "db.runCommand({ ping: 1 })"`,
      output: '{ ok: 1 }',
      level: 'INFO', timestamp: minutesAgo(7).toISOString()
    },
    {
      command: 'git log --oneline -5',
      output: [
        `${sha(code, 1)} Tune API container limits for ${capacity.vcpu} vCPU plan`,
        `${sha(code, 2)} Add usage rollup worker for ${name}`,
        `${sha(code, 3)} Bump mongoose to 8.5`,
        `${sha(code, 4)} Harden /health readiness probe`,
        `${sha(code, 5)} Initial ${slug} platform scaffold`
      ].join('\n'),
      level: 'INFO', timestamp: minutesAgo(8).toISOString()
    },
    {
      command: 'systemctl is-active docker',
      output: 'active',
      level: 'INFO', timestamp: minutesAgo(9).toISOString()
    }
  ];
  return entries;
}
