# CloudLedger customer portal + private admin

This project has two distinct interfaces backed by one Node.js API and MongoDB database.

- **Customer portal:** `/` — preserves the supplied CloudLedger customer dashboard design. It is read-only and loads the values configured by the administrator.
- **Private admin:** `/admin` — a separate authenticated workspace. It is not linked from the customer portal. Administrators manage the records and customer-facing configuration here.
- **Backend:** `backend/` — Express API, MongoDB models, administrator authentication, public read-only portal API and admin-only CRUD API.

There are no seeded clients, invoices, infrastructure resources or other business records. A new database starts empty. Add records through `/admin` and they will be reflected in the customer portal. Resource telemetry charts are generated automatically for presentation and do not require MongoDB records or admin data entry. Contract-cost charts are calculated from the agreed billing amount and elapsed time; they are not random spend simulations.

## Folder structure

```text
cloud/
├── backend/
│   ├── src/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   └── server.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # customer-facing portal
│   │   ├── CompanyDashboard.jsx
│   │   ├── AdminApp.jsx         # separate admin interface
│   │   ├── styles.css           # original customer dashboard styling
│   │   └── admin.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## 1. Configure MongoDB and the first admin

Make a local MongoDB instance available or create a MongoDB Atlas database. Then:

```powershell
cd backend
Copy-Item .env.example .env
```

Edit `backend/.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/cloudledger
JWT_SECRET=replace_with_a_random_secret_of_at_least_32_characters
ADMIN_NAME=Workspace Administrator
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace_with_a_long_password_at_least_12_characters
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
PUBLIC_CLIENT_CODE=CLIENT-001
```

The first administrator is created on startup only when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are provided. The password is hashed before it is stored. Do not commit `.env` or share your admin credentials.

Install and start the API:

```powershell
npm install
npm run dev
```

The API runs at `http://localhost:4000`. Check `http://localhost:4000/api/health`.

## 2. Start the frontend

Open a second terminal:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open:

- Customer portal: `http://localhost:5173/`
- Private admin: `http://localhost:5173/admin`

The Vite development server proxies `/api` requests to `http://localhost:4000` by default.

## 3. What to configure in the admin

Sign in at `/admin`, then use **Admin manager**. Available data areas include:

- Clients: enter only a company name, choose Monthly or Yearly, and enter the contract amount. The backend generates a client code and calculates the monthly equivalent, annual equivalent and current calendar-period daily allocation automatically.
- Infrastructure: instance/service name, provider, region, machine configuration, CPU, memory, storage, status and monthly cost.
- Cost plans, invoices and payment transactions.
- Integrations and dashboard cards.
- Client environment profiles: region, OS, IP/host, health status, environment and allocation details.
- Deployments and release history.
- Runtime specifications.
- Codebase file names and read-only text previews.
- Read-only console output and activity entries.
- Content blocks, branding, support details, customer-facing page labels and descriptions.

Every listed record can be created, edited, hidden or deleted. Chart points are intentionally not an admin record type: resource telemetry charts generate rolling presentation samples automatically, so no one needs to enter graph values. Client amount drives a simple presentation allocation model: each ₹2,500 of monthly-equivalent price maps to 1 vCPU, 2 GB RAM, 50 GB storage and 25 Mbps network capacity (up to 64 units). Utilization figures are simulated estimates, not actual cloud-provider metrics. Cost charts instead use deterministic time-based contract accrual. Administrative data changes are recorded in the audit log. Only active records are returned to the customer portal.


### Client pricing and estimated resource profile

In **Admin → Clients → Add client**, enter the company name, choose **Monthly** or **Yearly**, and enter the amount. The API generates the client code and stores the entered contract amount plus normalized monthly and yearly equivalents. The daily allocation is calculated from the actual number of days in the current calendar month or year (including leap years). The customer portal automatically creates a presentation resource profile when no real resource inventory is configured.

The demo allocation heuristic is ₹2,500 per month-equivalent for one capacity unit: 1 vCPU, 2 GB RAM, 50 GB disk and 25 Mbps provisioned network. CPU, RAM, disk and network utilization are rolling simulated averages that refresh on the dashboard; absolute GB/core usage is derived from the allocated capacity. This is a customizable presentation rule, not a universal cloud price or actual monitoring data.

## Data and security notes

- `/api/public/portal` is read-only and returns active customer-facing records and a safe subset of display settings. Set `PUBLIC_CLIENT_CODE` to the client code assigned to that customer portal deployment; this filters customer records and client-linked resources, billing and telemetry to that client. Records without a client code are treated as shared/global content.
- `/api/admin/*` requires an administrator JWT. The customer app has no admin token and no record-write controls.
- `/admin` is a separate route and is protected by the admin login, but it is not linked from the customer navigation.
- `PUBLIC_CLIENT_CODE` is the simple single-customer deployment scope. Use a separate deployment/configuration per customer, or implement customer authentication and server-enforced tenant scoping before sharing one portal URL with multiple customers. Do not leave the setting blank when exposing a production portal to a customer; a blank value displays all active client records.
- The customer-facing Company dashboard calculates today's accrued amount continuously: it starts at ₹0 at local midnight and increases in proportion to elapsed time. A monthly contract is prorated across the actual number of days in the current calendar month; a yearly contract is prorated across 365 or 366 days in the calendar year. The daily counter resets at midnight. The month-to-date or year-to-date total continues accruing until its billing period ends, at which point it equals the agreed contract amount. The customer sees the exact contract amount labelled `/ month` or `/ year`; projected monthly totals and budget-utilization percentages are not shown. The billing period is calendar-based because no separate contract start date is required or entered. The estimated allocation model uses ₹2,500/month-equivalent per capacity unit (1 vCPU, 2 GB RAM, 50 GB storage and 25 Mbps network), capped at 64 units. CPU, memory, disk and network values move every few seconds around estimated daily averages. All such values are simulated presentation estimates—not real cloud usage, provider capacity or actual billing. Price alone cannot determine actual utilization. This application does not connect to AWS, DigitalOcean, Vercel or other providers; replace the generator with provider metrics and billing integrations before representing the charts as real monitoring data.
- Codebase previews and console output are read-only text records. They do not expose source repositories or execute commands on production servers.

## Production deployment

Build the frontend with `npm run build` inside `frontend/`, deploy the generated `frontend/dist` folder to a static host, deploy `backend/` as a Node.js service, and configure `VITE_API_URL` at build time to point to the API. Configure the static host to serve `index.html` for both `/` and `/admin` so direct navigation to the admin route works. Set `CLIENT_ORIGIN` to the actual frontend origin and use a strong private `JWT_SECRET`.


### Automatic dashboard cards

Dashboard cards are configured by choosing a metric (for example agreed contract amount, today's accrued cost, CPU, memory, network, storage, running resources or invoices). Contract amount cards display the exact saved amount and billing cycle. Today's accrued-cost cards start at zero at midnight and increase according to elapsed time. Old `monthlyCost` and `dailyCost` card configurations are mapped to the new contract-amount and today-accrued-cost metrics automatically. Labels, icons and displayed values are generated from the selected client’s saved pricing, resource records and rolling presentation telemetry. Administrators do not enter card values or graph points manually.


## Automatic infrastructure and service profiles

For the presentation workflow, an administrator only creates a client with a company name, billing cycle, and contract amount. Compute, storage, network, and sample container/service rows are then generated from that client contract. The Infrastructure section is read-only; no separate resource records need to be entered.

The container/service inventory and utilization figures are simulated presentation estimates. They are not measurements from AWS, Docker, Kubernetes, MongoDB Atlas, or another connected provider. Connect a real monitoring/inventory integration before describing them as live production metrics.

Older incomplete Infrastructure records whose saved values are just field labels (for example, “Resource type” or “Provider”) are ignored by the customer portal so they cannot suppress the generated resource profile. They remain in MongoDB and are not deleted automatically.


### Graph scale and time-window behavior

The resource utilization chart uses separate, correctly labelled scales: CPU and memory are percentages (0–100%) on the left; network throughput is Mbps on the right. Tooltips round values to one decimal place and show the local timestamp. The 1-hour, 24-hour and 7-day series span their full selected windows (13 points at 5-minute intervals, 25 points at hourly intervals, and 29 points at 6-hour intervals). The dashboard averages are labelled as averages so they are not confused with an individual hovered sample.

The contract accrual chart uses a fixed scale equal to the full allocation for the selected range. In Daily view, the solid line shows accrued amount through the current local time and a dashed line shows the deterministic contract run-rate to midnight; future values are explicitly a projection, not an already incurred charge. Weekly, Monthly and Yearly views show elapsed contract accrual against the full seven-day, calendar-month or calendar-year allocation. Chart axes use the configured currency, while tooltips show precise amounts.
