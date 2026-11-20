# CloudLedger — client invoicing

A small invoicing app: the admin adds client companies and the amount they pay, generates monthly or yearly invoices, and the client sees them (with PDF downloads) in a read-only portal.

- **Admin:** `/admin` — Dashboard, Clients, Invoices, Settings, Audit log.
- **Customer portal:** `/` — the original read-only client dashboard (unchanged). Generated invoices appear in its Invoices page with a PDF download.
- **Backend:** `backend/` — Express + MongoDB + PDF generation (pdfkit).

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

## 3. Using it

1. **Clients → Add client:** company name, Monthly or Yearly, and the amount. Contact/GSTIN/address are optional and appear on the invoice PDF.
2. **Settings → GST details:** tick *My company is registered under GST*, enter your GSTIN (checksum-validated), default SAC code/rate and registered address.
3. **Settings:** set your own company name, support email and invoice prefix (shown on the PDFs).
3. Generate invoices (below).

## Invoice generator (Admin → Invoices → Generate invoices)

1. Add the client company (Admin → Clients).
2. Open **Invoices → Generate invoices**, pick the client and either:
   - **One month** – choose the month and the amount → one invoice; or
   - **Whole year (split by month)** – choose the start month (end month defaults to 11 months later; change it for any range up to 60 months) and the **total** amount. The app divides the total across the months with natural variation (each month roughly within ±25% of the average). The parts always add up to exactly the total (whole rupees if the total is a whole number, otherwise paise).
3. Press **Preview**, use **Split again** to reshuffle, then **Generate**. Past periods work the same way (status defaults to Paid for past months, Pending otherwise).
4. Every invoice has a **Download PDF** button; a yearly set also has **All as PDF** (one PDF, one page per month). The customer portal's invoice register links to the same PDF. A set can be deleted and regenerated.

**Mindboxx service charge (optional):** tick “Add Mindboxx service charge” and enter a percentage (default 10). The amount you enter stays as the base and is split as usual; the percentage is added on top, so 210,000 + 10% = 231,000 across the invoices. Each invoice shows the base line, a separate “Mindboxx service charge” line and the total. Leave it unticked and nothing extra appears.

A month that already has an invoice for the client is refused, so nothing is invoiced twice. Apart from the optional service charge, no tax is added on top of the amount entered.

## Security notes

- `/api/public/*` is read-only and returns only clients and invoices. Set `PUBLIC_CLIENT_CODE` to the client code for a customer deployment so that portal only sees that client; do not leave it blank in production if several clients exist.
- `/api/admin/*` requires an administrator JWT.

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


## GST on invoices

- In **Invoices → Generate**, the *Add GST* box decides per run whether the bills are GST invoices. Off = plain invoice, no GST, no GSTIN anywhere on it.
- On = **TAX INVOICE** with your GSTIN, the client's GSTIN, place of supply, SAC code and a taxable value / CGST + SGST (same state) or IGST (other state) breakdown. *Tax type* is auto-detected from the two GSTIN state codes and can be overridden; rate is 5/12/18/28% or custom.
- GST is charged on the amount plus any service charge. Each bill stores a snapshot of the GSTINs and tax figures, so later Settings changes never alter an issued invoice.

## Future invoices (scheduled / locked)

Real bills follow usage, traffic and resource consumption, so the current and future months can't be downloaded as final invoices.

- Generating a **current or future month** saves it as **Scheduled**: no PDF for you or the client, and the client portal shows "Upcoming · Based on usage" with no amount.
- You still set the internal amount per month (edit it any time with the pencil icon; service charge and GST recalculate).
- On the **1st of the next month** the invoice automatically becomes Pending and downloadable. Set `BILLING_TZ` (default `Asia/Kolkata`) to change the time zone used for "today".
- Yearly sets download only their released months; scheduled months are left out until they unlock.
- A scheduled invoice is **issued on the day it unlocks** (the 1st of the next month) and is due **15 days after that**, so the November invoice opens on 1 Dec with "Pay by 16 Dec". Months that have already ended when you generate keep the 1st of their own month as the invoice date. Invoices generated by an older version (issued on the 1st of their own month) are corrected automatically when they unlock, unless you edited their dates by hand. `npm run fix-dates` (in `backend/`) lists what would change for still-locked invoices today; add `-- --apply` to write it.

## Customer portal sign-in (password + Google Authenticator)

The customer infrastructure dashboard at `/` now needs a sign-in. The `/admin` panel and its login are unchanged.

1. **Email + password** — the same `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `backend/.env` (checked directly against the file, so changing the password in the admin panel does not affect it). Changing `ADMIN_PASSWORD` in `.env` signs everyone out of the portal.
2. **Google Authenticator** — on the first sign-in a QR code is shown; scan it, enter the 6-digit code, and save the 8 one-time recovery codes. Every later sign-in asks for the current code (or a recovery code).

Optional `.env` settings: `PORTAL_SESSION_HOURS` (default 8), `PORTAL_2FA_ISSUER` (name shown in the authenticator app, default CloudLedger).

**Lost your phone / deleted the authenticator?**

1. On the sign-in screen, enter email + password, then click **Lost your authenticator? Reset by email**.
2. A 6-digit code is emailed to `ADMIN_EMAIL` (valid 10 minutes, 5 tries, one new code per minute).
3. Enter it, scan the new QR code, and save the new recovery codes. The old authenticator and old recovery codes stop working once the new one is confirmed (until then the old one still works, so an abandoned reset changes nothing).

This needs SMTP settings in `backend/.env` (any provider: Gmail app password, SES, Brevo, etc.):

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=apikey_or_username
SMTP_PASS=password
SMTP_FROM=CloudLedger <noreply@yourdomain.com>
```

`SMTP_SECURE` is optional (defaults to true only for port 465). In production the reset is refused when `SMTP_HOST` is not set; outside production the code is printed in the server log instead. Run `npm install` in `backend/` (adds `nodemailer`).

Last resort (no email access either): run `npm run portal:reset-2fa` in `backend/` on the server; the next sign-in shows a fresh QR code.

All `/api/public/*` data (including invoice PDFs) is refused without a portal session. Run `npm install` in `backend/` (adds `qrcode`).
