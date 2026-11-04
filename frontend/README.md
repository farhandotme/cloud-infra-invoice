# CloudLedger — Infrastructure Cost Console

A React + Vite frontend prototype for a multi-client cloud infrastructure cost and billing platform.

## Run locally
```bash
npm install
npm run dev
```
Open the local URL printed by Vite.

## Included screens
- Dashboard with KPI cards, resource telemetry, infrastructure health, client cost allocation, provider connections and recent invoices
- Infrastructure inventory
- Usage analytics
- Client directory
- Cost plans and pricing components
- Invoice register and sample tax invoice preview
- Transactions
- Integrations
- Organization settings

## Demo behavior
- Resource charts use generated dummy telemetry and refresh every 12 seconds with changing values.
- Search filters the client directory.
- Sidebar navigation changes pages.
- Create invoice opens a printable-style draft preview.
- All records and company/tax details are sample data.

## Important before production
This is a frontend-only prototype. It does not connect to AWS, DigitalOcean, Vercel, payment gateways, GST systems, or a database. Do not issue the sample invoice as a real tax invoice. Before production, validate GSTIN, legal entity details, SAC/HSN classification, place of supply, CGST/SGST/IGST applicability, invoice numbering, payment details and applicable Indian GST rules with a qualified accountant. Build authenticated admin/client roles, audit logs, immutable invoice records, server-side tax calculations, provider API collectors and secure secrets management.


## Client-specific command center
The default landing page is now the Company dashboard for a selected client. It includes:
- Client selector and production environment header
- Live-looking CPU, memory, disk, network and running-cost indicators
- Daily, weekly, monthly and yearly spend history with budget guide
- Server specifications, instance inventory and cost breakdown
- Admin-oriented codebase tree and source preview
- Simulated web terminal with safe sample commands

**Important:** telemetry, cost history, terminal output and repository content are demonstration data. The terminal is not connected to a real host, and the file explorer is read-only. Production access requires authenticated backend services, least-privilege SSH/agent access, audit logs, command allowlists, secrets management and tenant isolation.


## Monochrome dark theme
The entire console now uses charcoal, graphite and silver tones. Blue and green accents have been replaced with neutral grayscale styling across navigation, cards, charts, status pills, developer tools and invoice designer.


## Server locations and metric accents
The client command center identifies the demo AWS deployment as Mumbai, India (Asia Pacific `ap-south-1`, AZ `ap-south-1a`). Sample inventory also labels a DigitalOcean node as Bengaluru (`BLR1`) and Vercel as Global edge. Cost, CPU, memory, disk and network indicators use distinct restrained accent colors while the overall graphite theme remains intact. These are seeded demo locations and should be replaced with the actual region selected for each deployed client.


## Company live operations dashboard
The Company dashboard Overview now includes an inline server terminal, so admins can run the available demo commands without leaving the live company page. The standalone Terminal tab remains available for a larger terminal workspace.

Additional technical modules on the Overview page:
- Request rate, P95 latency, error rate and active sessions
- Database connection pressure, Redis cache hit ratio and queue depth
- Running Docker containers with image, CPU, memory and restart counts
- Runtime and host configuration (instance, vCPU, memory, volumes, OS, Node.js, PostgreSQL, Docker, subnet and security group)
- CI/CD deployment history and build health
- System event stream with INFO/WARN entries

**Build note:** JSX syntax was checked. A full Vite production build could not be run here because project dependencies were not cached for offline installation. Run `npm install` and `npm run build` locally.
