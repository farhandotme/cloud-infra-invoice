/**
 * Presentation-only sample repository for the customer "Codebase" tab.
 * Everything is generated from the client's company name/code and contract
 * amount (via the capacity model) so each company gets its own project name,
 * package scope, database, container limits and deployment settings.
 * It is illustrative sample code, NOT the client's real source repository.
 */
import {
  getClientPricing,
  estimateCapacity,
  buildServerProfile,
} from "./pricingModel.js";

const L = (...lines) => lines.join("\n");

const slugify = (value) =>
  String(value || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "client";
const pascal = (value) =>
  slugify(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") || "Client";

export function buildEstimatedCodebase(client = {}, now = new Date()) {
  const pricing = getClientPricing(client);
  const capacity =
    pricing.estimatedCapacity || estimateCapacity(pricing.monthlyCost);
  if (!capacity.units) return { repositoryPath: "", files: [] };

  const name = client.name || client.company || "Client";
  const code = client.code || "CLIENT";
  const slug = slugify(client.name || client.code);
  const Model = pascal(name);
  const server = buildServerProfile(client, now) || {};
  const regionCode = server.regionCode || "ap-south-1";
  const zones = (server.availabilityZone || `${regionCode}a`).split("/").length;
  const apiReplicas = Math.max(1, Math.min(6, Math.ceil(capacity.vcpu / 4)));
  const workerReplicas = Math.max(1, Math.min(4, Math.ceil(capacity.vcpu / 6)));
  const apiCpu = Math.max(0.25, Number((capacity.vcpu * 0.45).toFixed(2)));
  const apiMemMb = Math.max(256, Math.round(capacity.memoryGb * 1024 * 0.32));
  const dbMemMb = Math.max(512, Math.round(capacity.memoryGb * 1024 * 0.38));
  const cacheMemMb = Math.max(128, Math.round(capacity.memoryGb * 1024 * 0.12));
  const poolSize = Math.max(10, capacity.vcpu * 10);
  const port =
    4000 +
    (code.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 900);
  const year = now.getFullYear();
  const repoRoot = `/srv/${slug}/platform`;

  const files = [
    [
      "README.md",
      "markdown",
      L(
        `# ${name} — Platform`,
        "",
        `Customer account \`${code}\` · ${capacity.vcpu} vCPU · ${capacity.memoryGb} GB RAM · ${capacity.diskGb} GB storage · ${server.provider || "Managed cloud"} (${regionCode})`,
        "",
        "> Illustrative sample repository generated for this account's dashboard.",
        "> It is not the production source code.",
        "",
        "## Services",
        "| Service | Runtime | Replicas |",
        "| --- | --- | --- |",
        `| ${slug}-api | Node.js 22 (Express) | ${apiReplicas} |`,
        `| ${slug}-worker | Node.js 22 (BullMQ) | ${workerReplicas} |`,
        `| ${slug}-mongodb | MongoDB 8 | 1 primary${zones > 1 ? ` + ${zones - 1} secondary` : ""} |`,
        `| ${slug}-redis | Redis 7 | 1 |`,
        "",
        "## Run locally",
        "```bash",
        "cp .env.example .env",
        "docker compose up -d --build",
        `curl http://localhost:${port}/health`,
        "```",
      ),
    ],
    [
      "package.json",
      "json",
      L(
        "{",
        `  "name": "@${slug}/platform",`,
        '  "version": "1.0.0",',
        '  "private": true,',
        '  "type": "module",',
        '  "engines": { "node": ">=22" },',
        '  "scripts": {',
        '    "start": "node src/server.js",',
        '    "worker": "node src/worker.js",',
        '    "dev": "node --watch src/server.js",',
        '    "test": "node --test"',
        "  },",
        '  "dependencies": {',
        '    "bullmq": "^5.12.0",',
        '    "express": "^4.19.2",',
        '    "helmet": "^7.1.0",',
        '    "ioredis": "^5.4.1",',
        '    "mongoose": "^8.5.0",',
        '    "pino": "^9.3.2"',
        "  }",
        "}",
      ),
    ],
    [
      ".env.example",
      "dotenv",
      L(
        "# Copy to .env — never commit real values",
        "NODE_ENV=production",
        `PORT=${port}`,
        `COMPANY_NAME="${name}"`,
        `COMPANY_CODE=${code}`,
        `MONGODB_URI=mongodb://${slug}-mongodb:27017/${slug.replace(/-/g, "_")}`,
        `MONGODB_POOL_SIZE=${poolSize}`,
        `REDIS_URL=redis://${slug}-redis:6379`,
        `WORKER_CONCURRENCY=${Math.max(2, capacity.vcpu * 2)}`,
        "JWT_SECRET=change_me_to_a_long_random_value",
        `CLOUD_REGION=${regionCode}`,
      ),
    ],
    [
      "Dockerfile",
      "dockerfile",
      L(
        "FROM node:22-alpine AS deps",
        "WORKDIR /app",
        "COPY package*.json ./",
        "RUN npm ci --omit=dev",
        "",
        "FROM node:22-alpine",
        "ENV NODE_ENV=production",
        "WORKDIR /app",
        "COPY --from=deps /app/node_modules ./node_modules",
        "COPY src ./src",
        "COPY package.json ./",
        "USER node",
        `EXPOSE ${port}`,
        `HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:${port}/health || exit 1`,
        'CMD ["node", "src/server.js"]',
      ),
    ],
    [
      "docker-compose.yml",
      "yaml",
      L(
        "services:",
        `  ${slug}-api:`,
        "    build: .",
        "    env_file: .env",
        `    ports: ["${port}:${port}"]`,
        `    depends_on: [${slug}-mongodb, ${slug}-redis]`,
        "    deploy:",
        "      resources:",
        `        limits: { cpus: "${apiCpu}", memory: ${apiMemMb}M }`,
        "    restart: unless-stopped",
        `  ${slug}-worker:`,
        "    build: .",
        '    command: ["node", "src/worker.js"]',
        "    env_file: .env",
        `    depends_on: [${slug}-mongodb, ${slug}-redis]`,
        "    restart: unless-stopped",
        `  ${slug}-mongodb:`,
        "    image: mongo:8",
        '    volumes: ["mongo-data:/data/db"]',
        `    deploy: { resources: { limits: { memory: ${dbMemMb}M } } }`,
        `  ${slug}-redis:`,
        "    image: redis:7-alpine",
        `    command: ["redis-server", "--maxmemory", "${cacheMemMb}mb", "--maxmemory-policy", "allkeys-lru"]`,
        "volumes:",
        "  mongo-data:",
      ),
    ],
    [
      "src/server.js",
      "javascript",
      L(
        `// ${name} (${code}) — API entry point`,
        "import express from 'express';",
        "import helmet from 'helmet';",
        "import mongoose from 'mongoose';",
        "import pino from 'pino';",
        "import { accountRouter } from './routes/account.js';",
        "import { usageRouter } from './routes/usage.js';",
        "",
        "const log = pino({ name: process.env.COMPANY_CODE });",
        "const app = express();",
        "app.use(helmet());",
        "app.use(express.json({ limit: '1mb' }));",
        "",
        "app.get('/health', (_req, res) => res.json({",
        "  status: 'ok',",
        `  company: '${name.replace(/'/g, "\\'")}',`,
        "  uptime: Math.round(process.uptime()),",
        "  db: mongoose.connection.readyState === 1 ? 'connected' : 'connecting'",
        "}));",
        "app.use('/api/account', accountRouter);",
        "app.use('/api/usage', usageRouter);",
        "",
        "await mongoose.connect(process.env.MONGODB_URI, {",
        `  maxPoolSize: Number(process.env.MONGODB_POOL_SIZE || ${poolSize})`,
        "});",
        `app.listen(process.env.PORT || ${port}, () => log.info('${slug}-api listening'));`,
      ),
    ],
    [
      "src/routes/account.js",
      "javascript",
      L(
        "import { Router } from 'express';",
        `import { ${Model}Account } from '../models/${Model}Account.js';`,
        "",
        "export const accountRouter = Router();",
        "",
        "accountRouter.get('/', async (_req, res) => {",
        `  const account = await ${Model}Account.findOne({ code: process.env.COMPANY_CODE }).lean();`,
        "  if (!account) return res.status(404).json({ message: 'Account not found' });",
        "  res.json(account);",
        "});",
      ),
    ],
    [
      "src/routes/usage.js",
      "javascript",
      L(
        "import { Router } from 'express';",
        "",
        "export const usageRouter = Router();",
        "",
        "// Provisioned capacity for this contract",
        "usageRouter.get('/capacity', (_req, res) => res.json({",
        `  vcpu: ${capacity.vcpu},`,
        `  memoryGb: ${capacity.memoryGb},`,
        `  diskGb: ${capacity.diskGb},`,
        `  networkMbps: ${capacity.networkMbps},`,
        `  region: '${regionCode}'`,
        "}));",
      ),
    ],
    [
      `src/models/${Model}Account.js`,
      "javascript",
      L(
        "import mongoose from 'mongoose';",
        "",
        "const schema = new mongoose.Schema({",
        "  code: { type: String, required: true, unique: true },",
        "  name: { type: String, required: true },",
        "  billingCycle: { type: String, enum: ['Monthly', 'Yearly'], default: 'Monthly' },",
        "  contractAmount: { type: Number, min: 0 },",
        "  currency: { type: String, default: 'INR' },",
        "  status: { type: String, default: 'Active' }",
        "}, { timestamps: true });",
        "",
        `export const ${Model}Account = mongoose.model('${Model}Account', schema);`,
      ),
    ],
    [
      "src/worker.js",
      "javascript",
      L(
        `// ${slug}-worker — background jobs`,
        "import { Worker } from 'bullmq';",
        "import IORedis from 'ioredis';",
        "",
        "const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });",
        "",
        "new Worker('usage-rollup', async job => {",
        "  // aggregate usage for job.data.accountCode",
        "  return { processed: true, account: job.data.accountCode };",
        `}, { connection, concurrency: Number(process.env.WORKER_CONCURRENCY || ${Math.max(2, capacity.vcpu * 2)}) });`,
      ),
    ],
    [
      "deploy/k8s/deployment.yaml",
      "yaml",
      L(
        "apiVersion: apps/v1",
        "kind: Deployment",
        "metadata:",
        `  name: ${slug}-api`,
        `  labels: { app: ${slug}-api, account: ${code.toLowerCase()} }`,
        "spec:",
        `  replicas: ${apiReplicas}`,
        `  selector: { matchLabels: { app: ${slug}-api } }`,
        "  template:",
        `    metadata: { labels: { app: ${slug}-api } }`,
        "    spec:",
        "      containers:",
        "        - name: api",
        `          image: registry.example.com/${slug}/api:latest`,
        `          ports: [{ containerPort: ${port} }]`,
        "          resources:",
        `            requests: { cpu: "${Math.max(0.1, Number((apiCpu / 2).toFixed(2)))}", memory: ${Math.round(apiMemMb / 2)}Mi }`,
        `            limits: { cpu: "${apiCpu}", memory: ${apiMemMb}Mi }`,
        `          readinessProbe: { httpGet: { path: /health, port: ${port} } }`,
      ),
    ],
    [
      "deploy/terraform/main.tf",
      "hcl",
      L(
        `# ${name} infrastructure — ${server.provider || "cloud"} / ${regionCode}`,
        "terraform {",
        '  required_version = ">= 1.7"',
        "}",
        "",
        "locals {",
        `  account_code = "${code}"`,
        `  vcpu         = ${capacity.vcpu}`,
        `  memory_gb    = ${capacity.memoryGb}`,
        `  disk_gb      = ${capacity.diskGb}`,
        `  zones        = ${zones}`,
        "}",
        "",
        'variable "region" {',
        `  default = "${regionCode}"`,
        "}",
      ),
    ],
    [
      ".github/workflows/deploy.yml",
      "yaml",
      L(
        `name: Deploy ${name}`,
        "on:",
        "  push:",
        "    branches: [main]",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: actions/setup-node@v4",
        "        with: { node-version: 22 }",
        "      - run: npm ci",
        "      - run: npm test",
        `      - run: docker build -t registry.example.com/${slug}/api:\${{ github.sha }} .`,
      ),
    ],
    [
      "LICENSE",
      "text",
      L(
        `Copyright (c) ${year} ${name}`,
        "",
        "All rights reserved. Proprietary and confidential.",
      ),
    ],
  ];

  return {
    repositoryPath: repoRoot,
    files: files.map(([path, language, content]) => ({
      _id: `estimate-${slug}-${path}`,
      path,
      language,
      content,
      encoding: "UTF-8",
      estimated: true,
    })),
  };
}
