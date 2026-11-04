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
