import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Server, Building2, ReceiptText, ChartNoAxesCombined, Wallet,
  Settings, Bell, Search, ChevronDown, ChevronRight, Plus, Download, ArrowUpRight,
  ArrowDownRight, Cpu, MemoryStick, HardDrive, Network, Activity, MoreHorizontal,
  CalendarDays, Filter, FileText, CircleHelp, ShieldCheck, Zap, Menu, X,
  Check, Clock3, ExternalLink, Cloud, Database, Globe2, CreditCard, SlidersHorizontal
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CompanyDashboard from './CompanyDashboard.jsx';
import { makeLiveUsageSeries } from './liveTelemetry.js';
import { buildTransactionsFromInvoices, buildEstimatedTransactions, summarizeTransactions } from './transactionModel.js';
import { getClientPricing, getBillingAccrual, buildEstimatedResources, isUsableResourceRecord } from './pricingModel.js';

const API = import.meta.env.VITE_API_URL || '';
const money = (value, currency = 'INR') => {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toLocaleString('en-IN')}`; }
};
const moneyPrecise = (value, currency = 'INR') => {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
};
const dateText = value => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const numberText = value => Number(value || 0).toLocaleString('en-IN');
const safeArray = value => Array.isArray(value) ? value : [];
const avg = (items, key) => { const values = items.map(item => item[key]).filter(value => value !== undefined && value !== null && value !== '').map(Number).filter(Number.isFinite); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; };

function ResourceTelemetryTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const labels = { cpu: 'CPU utilization', memory: 'Memory usage', network: 'Network I/O' };
  const units = { cpu: '%', memory: '%', network: ' Mbps' };
  const point = payload[0]?.payload;
  const timestampLabel = point?.timestamp ? new Date(point.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : label;
  return <div className="resource-chart-tooltip">
    <strong>{timestampLabel}</strong>
    {payload.filter(item => Object.prototype.hasOwnProperty.call(labels, item.dataKey) && Number.isFinite(Number(item.value))).map(item => <div key={item.dataKey}>
      <i style={{ background: item.color || item.stroke }}/><span>{labels[item.dataKey]}</span><b>{Number(item.value).toFixed(1)}{units[item.dataKey]}</b>
    </div>)}
  </div>;
}

const formatMbpsAxis = value => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
const nav = [
  { label: 'OVERVIEW', items: [['Dashboard', LayoutDashboard], ['Company dashboard', Building2], ['Infrastructure', Server], ['Usage analytics', ChartNoAxesCombined]] },
  { label: 'MANAGEMENT', items: [['Clients', Building2], ['Cost plans', Wallet], ['Invoices', ReceiptText], ['Transactions', CreditCard]] },
  { label: 'SYSTEM', items: [['Integrations', Cloud], ['Settings', Settings]] }
];

async function fetchPortal() {
  const response = await fetch(`${API}/api/public/portal`, { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Unable to load the cloud workspace.');
  return payload;
}

function mapRecords(records = {}) {
  const values = key => safeArray(records[key]).map(record => ({ ...record.data, _id: record._id, title: record.title, sortOrder: record.sortOrder || 0 }));
  const resources = values('resources');
  const clients = values('clients').map(client => {
    const clientResources = resources.filter(resource => resource.clientCode === client.code);
    const pricing = getClientPricing(client);
    return {
      ...client,
      ...pricing,
      monthly: pricing.monthlyCost,
      servers: Number(client.servers || clientResources.length),
      initial: String(client.name || client.title || '?').trim().charAt(0).toUpperCase(),
      color: client.color || '#d7dbe1'
    };
  });
  const invoices = values('invoices').map(invoice => ({
    ...invoice,
    id: invoice.number || invoice.id || invoice.title,
    client: invoice.clientName || invoice.client || '—',
    date: dateText(invoice.issueDate || invoice.date),
    due: dateText(invoice.dueDate || invoice.due),
    amount: Number(invoice.amount || 0),
    cycle: invoice.billingCycle || invoice.cycle || 'Monthly'
  }));
  return {
    clients, resources, invoices,
    costPlans: values('costPlans'), transactions: values('transactions'), integrations: values('integrations'),
    dashboardCards: values('dashboardCards'), contentBlocks: values('contentBlocks'), activities: values('activities'),
    companyProfiles: values('companyProfiles'), deployments: values('deployments'), runtimeSpecs: values('runtimeSpecs'),
    codebaseFiles: values('codebaseFiles'), terminalEntries: values('terminalEntries')
  };
}

function App() {
  const [page, setPage] = useState('Company dashboard');
  const [period, setPeriod] = useState('24 hours');
  const [liveTick, setLiveTick] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedClientCode, setSelectedClientCode] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setLiveTick(value => value + 1), 12000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let firstLoad = true;
    const loadPortal = async () => {
      try {
        const result = await fetchPortal();
        if (!active) return;
        const nextData = mapRecords(result.records || {});
        setPortal({ ...result, data: nextData });
        setSelectedClientCode(current => current && nextData.clients.some(client => client.code === current) ? current : nextData.clients[0]?.code || '');
        setError('');
      } catch (err) {
        if (active && firstLoad) setError(err.message);
      } finally {
        if (active && firstLoad) setLoading(false);
        firstLoad = false;
      }
    };
    loadPortal();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadPortal();
    }, 30000);
    window.addEventListener('focus', loadPortal);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', loadPortal);
    };
  }, []);

  const data = portal?.data || mapRecords();
  const settings = portal?.settings || {};
  const currency = settings.currency || 'INR';
  const clients = data.clients;
  const selectedClient = clients.find(client => client.code === selectedClientCode) || clients[0] || null;
  const clientCode = selectedClient?.code;
  const pricing = getClientPricing(selectedClient || {});
  const billingAccrual = getBillingAccrual(selectedClient || {}, new Date());
  const series = useMemo(() => makeLiveUsageSeries(liveTick, period, clientCode || 'workspace', pricing.monthlyCost), [liveTick, period, clientCode, pricing.monthlyCost]);
  const storedClientResources = data.resources.filter(resource => (!resource.clientCode || resource.clientCode === clientCode) && isUsableResourceRecord(resource));
  const clientResources = storedClientResources.length
    ? storedClientResources
    : buildEstimatedResources(selectedClient || {}, series[series.length - 1] || {});
  const filteredClients = clients.filter(client => `${client.name} ${client.code} ${client.provider}`.toLowerCase().includes(search.toLowerCase()));
  const title = settings.pageTitles?.[page] || (page === 'Dashboard' ? (settings.dashboardTitle || 'Infrastructure overview') : page);
  const change = nextPage => { setPage(nextPage); setMobileNav(false); setSearch(''); };
  const clientInvoices = data.invoices.filter(invoice => !invoice.clientCode || invoice.clientCode === clientCode);
  const activeResources = clientResources.filter(resource => String(resource.status || '').toLowerCase() === 'running');
  const profile = data.companyProfiles.find(item => item.clientCode === clientCode) || {};
  const footerBlocks = data.contentBlocks.filter(block => (block.placement || 'Footer') === 'Footer' && block.enabled !== 'No' && (!block.clientCode || block.clientCode === clientCode));
  const workspaceIntegrations = data.integrations.filter(item => !item.clientCode || item.clientCode === clientCode);
  const workspaceCards = data.dashboardCards.filter(card => card.enabled !== 'No' && (!card.clientCode || card.clientCode === clientCode)).sort((a, b) => Number(a.order ?? a.sortOrder ?? 0) - Number(b.order ?? b.sortOrder ?? 0));
  const workspaceBlocks = data.contentBlocks.filter(block => !block.clientCode || block.clientCode === clientCode).sort((a, b) => Number(a.order ?? a.sortOrder ?? 0) - Number(b.order ?? b.sortOrder ?? 0));

  if (loading) return <div className="loading-screen"><div className="loading-mark"><Cloud size={22}/></div><b>Loading cloud workspace</b><span>Connecting to the customer portal…</span></div>;
  if (error) return <div className="loading-screen"><div className="loading-mark"><Cloud size={22}/></div><b>Cloud workspace unavailable</b><span>{error}</span><button className="btn secondary" onClick={() => window.location.reload()}>Try again</button></div>;

  return <div className="app-shell" style={{ '--portal-accent': settings.accentColor || '#3978e8' }}>
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">{settings.logoUrl ? <img className="portal-brand-image" src={settings.logoUrl} alt=""/> : <Cloud size={20}/>}</div><div><b>{settings.brandName || 'cloudledger'}</b><span>INFRASTRUCTURE OS</span></div><button className="mobile-close" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace"><div className="workspace-icon">{(settings.workspaceLabel || 'C').charAt(0).toUpperCase()}</div><div><b>{settings.workspaceLabel || 'Customer workspace'}</b><span>{settings.organizationName || 'Managed cloud environment'}</span></div><ChevronDown size={15}/></div>
      {nav.map(group => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map(([label, Icon]) => <button key={label} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => change(label)}><Icon size={17}/><span>{settings.navigationLabels?.[label] || label}</span>{label === 'Invoices' && clientInvoices.length > 0 && <i className="nav-count">{clientInvoices.length}</i>}</button>)}</div>)}
      <div className="sidebar-bottom"><div className="support-card"><div className="support-icon"><CircleHelp size={17}/></div><b>Need a hand?</b><p>{settings.helpText || 'Contact your cloud support team for assistance.'}</p>{settings.supportUrl ? <a href={settings.supportUrl} target="_blank" rel="noreferrer">Visit help center <ArrowUpRight size={13}/></a> : <span className="support-email">{settings.supportEmail || 'Support details not configured'}</span>}</div><div className="user-profile"><div className="avatar dark">{(selectedClient?.initial || 'C')}</div><div><b>{selectedClient?.name || 'Customer'}</b><span>Customer workspace</span></div><MoreHorizontal size={18}/></div></div>
    </aside>
    {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="top-left"><button className="menu-btn" onClick={() => setMobileNav(true)}><Menu size={19}/></button><span className="crumb">Workspace</span><ChevronRight size={14}/><b>{page}</b></div><div className="top-actions"><div className="global-search"><Search size={15}/><input placeholder="Search this workspace..." value={search} onChange={event => setSearch(event.target.value)}/><kbd>⌘ K</kbd></div><button className="icon-btn notify" aria-label="Notifications"><Bell size={18}/></button><div className="top-avatar">{selectedClient?.initial || 'C'}</div></div></header>
      <div className="page-wrap">
        <div className="page-heading"><div><div className="eyebrow"><span className="live-dot"/> CUSTOMER CLOUD WORKSPACE <span className="eyebrow-sep">/</span> {profile.lastUpdated ? `UPDATED ${dateText(profile.lastUpdated).toUpperCase()}` : 'CONFIGURED BY YOUR PROVIDER'}</div><h1>{title}</h1><p>{settings.pageDescriptions?.[page] || (page === 'Dashboard' ? (settings.dashboardSubtitle || 'View your infrastructure, resource consumption and managed cloud costs.') : page === 'Company dashboard' ? 'Your dedicated cloud environment, resources and operating costs.' : `View ${page.toLowerCase()} for your managed cloud environment.`)}</p></div><div className="heading-actions">{page === 'Invoices' ? <span className="btn secondary"><CalendarDays size={15}/> Billing records</span> : null}</div></div>
        {page === 'Dashboard' && <Dashboard series={series} period={period} setPeriod={setPeriod} change={change} clients={clients} selectedClient={selectedClient} billingAccrual={billingAccrual} invoices={clientInvoices} resources={clientResources} currency={currency} integrations={workspaceIntegrations} customCards={workspaceCards} contentBlocks={workspaceBlocks.filter(block => (block.placement || 'Dashboard') === 'Dashboard' && block.enabled !== 'No')}/>} 
        {page === 'Company dashboard' && (selectedClient ? <CompanyDashboard clients={clients} selectedClient={selectedClient} setSelectedClient={client => setSelectedClientCode(client.code)} resources={clientResources} profile={profile} deployments={data.deployments.filter(item => !item.clientCode || item.clientCode === clientCode)} runtimeSpecs={data.runtimeSpecs.filter(item => !item.clientCode || item.clientCode === clientCode)} codebaseFiles={data.codebaseFiles.filter(item => !item.clientCode || item.clientCode === clientCode)} terminalEntries={data.terminalEntries.filter(item => !item.clientCode || item.clientCode === clientCode)} activities={data.activities.filter(item => !item.clientCode || item.clientCode === clientCode)} contentBlocks={workspaceBlocks.filter(block => block.placement === 'Client overview' && block.enabled !== 'No')} currency={currency}/> : <EmptyState title="No customer workspace yet" text="Your provider has not added a client workspace. Please contact your account administrator."/>)}
        {page === 'Infrastructure' && <Infrastructure resources={clientResources} currency={currency}/>}
        {page === 'Usage analytics' && <Analytics series={series} resources={clientResources} currency={currency} todayAccrued={pricing.contractAmount > 0 ? billingAccrual.todayAccrued : null}/>}
        {page === 'Clients' && <Clients clients={filteredClients} setSelectedClient={client => { setSelectedClientCode(client.code); change('Company dashboard'); }}/>} 
        {page === 'Cost plans' && <CostPlans plans={data.costPlans.filter(plan => !plan.clientCode || plan.clientCode === clientCode)} currency={currency}/>}
        {page === 'Invoices' && <Invoices invoices={clientInvoices} currency={currency}/>}
        {page === 'Transactions' && <Transactions transactions={data.transactions.filter(item => !item.clientCode || item.clientCode === clientCode)} invoices={clientInvoices} client={selectedClient} currency={currency}/>}
        {page === 'Integrations' && <Integrations integrations={workspaceIntegrations} resources={clientResources}/>}
        {page === 'Settings' && <SettingsPage client={selectedClient} profile={profile} settings={settings}/>} 
      </div>
      <footer className="footer"><span>{settings.footerText || `© ${new Date().getFullYear()} ${settings.brandName || 'CloudLedger Console'} · Customer portal`}</span><span>{footerBlocks.map(block => <span key={block._id}>{block.body || block.title} </span>)}<span><span className="live-dot"/> Workspace data <span className="dot-sep">·</span> <a href={settings.supportUrl || '#'}>Support</a></span></span></footer>
    </main>
  </div>;
}

function StatCard({ label, value, change, positive = true, icon: Icon, foot }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={17}/></div></div><div className="stat-value">{value}</div><div className="stat-foot"><span className={positive ? 'trend-up' : 'trend-down'}>{positive ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {change}</span><span>{foot}</span></div></div>;
}
function Status({ status }) { const safe = String(status || 'Not set'); const cls = safe.toLowerCase().replace(/[^a-z0-9]+/g, '-'); return <span className={`status ${cls}`}>{safe}</span>; }
function EmptyState({ title, text }) { return <div className="empty-state"><div className="empty-icon"><Cloud size={22}/></div><h2>{title}</h2><p>{text}</p></div>; }

function inferLegacyDashboardMetric(label = '') {
  const text = String(label).toLowerCase();
  if (text.includes('daily')) return 'todayAccruedCost';
  if (text.includes('cpu')) return 'cpuUtilization';
  if (text.includes('memory')) return 'memoryUsage';
  if (text.includes('network')) return 'networkThroughput';
  if (text.includes('storage')) return 'storageCapacity';
  if (text.includes('resource') || text.includes('instance')) return 'runningResources';
  if (text.includes('invoice') && (text.includes('outstanding') || text.includes('due'))) return 'outstandingAmount';
  if (text.includes('invoice')) return 'invoiceCount';
  if (text.includes('integration')) return 'connectedIntegrations';
  return 'contractAmount';
}

function Dashboard({ series, period, setPeriod, change, clients, selectedClient, billingAccrual, invoices, resources, currency, integrations, customCards = [], contentBlocks = [] }) {
  const total = clients.reduce((sum, client) => sum + Number(client.monthly || 0), 0);
  const hasMonthlyCost = clients.some(client => client.monthlyCost !== undefined && client.monthlyCost !== null && client.monthlyCost !== '');
  const active = resources.filter(resource => String(resource.status || '').toLowerCase() === 'running').length;
  const cpu = avg(series, 'cpu'); const memory = avg(series, 'memory'); const network = avg(series, 'network');
  const storage = resources.reduce((sum, resource) => sum + Number(resource.storageGB || 0), 0);
  const health = series.length ? avg(series, 'healthScore') : null;
  const connected = integrations.filter(item => String(item.status || '').toLowerCase() === 'connected');
  const activeResources = resources.filter(resource => String(resource.status || '').toLowerCase() === 'running');
  const storageCapacity = resources.reduce((sum, resource) => sum + Number(resource.storageGB || 0), 0) || Number(selectedClient?.estimatedCapacity?.diskGb || 0);
  const outstandingAmount = invoices.filter(invoice => ['pending','overdue'].includes(String(invoice.status || '').toLowerCase())).reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const automaticCard = (card, index) => {
    const rawMetricKey = card.metric || inferLegacyDashboardMetric(card.label);
    const metricKey = rawMetricKey === 'monthlyCost' ? 'contractAmount' : rawMetricKey === 'dailyCost' ? 'todayAccruedCost' : rawMetricKey;
    const definitions = {
      contractAmount: { label: 'Agreed contract amount', value: selectedClient ? `${money(selectedClient.contractAmount ?? selectedClient.monthlyCost ?? 0, currency)} / ${(selectedClient.billingCycle || 'Monthly').toLowerCase()}` : '—', change: 'Fixed agreed billing amount', footnote: 'The amount configured for this billing cycle', icon: 'wallet' },
      todayAccruedCost: { label: "Today's accrued cost", value: selectedClient ? moneyPrecise((billingAccrual || getBillingAccrual(selectedClient, new Date())).todayAccrued, currency) : '—', change: 'Accruing in real time', footnote: 'Calculated from elapsed time today', icon: 'wallet' },
      cpuUtilization: { label: 'Average CPU utilization', value: `${avg(series, 'cpu').toFixed(1)}%`, change: 'Rolling sample', footnote: 'Automatically simulated usage', icon: 'cpu' },
      memoryUsage: { label: 'Average memory usage', value: `${avg(series, 'memory').toFixed(1)}%`, change: 'Rolling sample', footnote: 'Automatically simulated usage', icon: 'activity' },
      networkThroughput: { label: 'Network throughput', value: `${avg(series, 'network').toFixed(1)} Mbps`, change: 'Rolling sample', footnote: 'Average network I/O', icon: 'network' },
      storageCapacity: { label: 'Storage capacity', value: storageCapacity ? `${numberText(storageCapacity)} GB` : '—', change: `${numberText(resources.length)} resources`, footnote: 'Estimated provisioned storage', icon: 'storage' },
      runningResources: { label: 'Running resources', value: numberText(activeResources.length), change: `${numberText(resources.length)} allocated resources`, footnote: 'Active provisioned resources', icon: 'server' },
      invoiceCount: { label: 'Invoice count', value: numberText(invoices.length), change: 'Published billing records', footnote: 'Assigned to this client', icon: 'database' },
      outstandingAmount: { label: 'Outstanding invoice amount', value: money(outstandingAmount, currency), change: `${invoices.filter(invoice => ['pending','overdue'].includes(String(invoice.status || '').toLowerCase())).length} unpaid invoices`, footnote: 'Pending and overdue invoices', icon: 'wallet' },
      connectedIntegrations: { label: 'Connected integrations', value: numberText(connected.length), change: `${numberText(integrations.length)} configured`, footnote: 'Active service connections', icon: 'zap' }
    };
    const result = definitions[metricKey] || definitions.contractAmount;
    return { ...card, ...result };
  };
  const renderedCards = customCards.map(automaticCard);
  return <>
    <div className="stat-grid">{renderedCards.length ? renderedCards.map((card, index) => { const customIcons = { wallet: Wallet, server: Server, cpu: Cpu, database: Database, activity: Activity, network: Network, storage: HardDrive, shield: ShieldCheck, zap: Zap }; const CardIcon = typeof card.icon === 'function' ? card.icon : customIcons[String(card.icon || '').toLowerCase()] || [Wallet, Server, Cpu, Database][index % 4]; return <StatCard key={card._id || card.label} label={card.label || 'Workspace metric'} value={card.value || '—'} change={card.change || 'Automatically calculated'} icon={CardIcon} foot={card.footnote || ''}/>; }) : <><StatCard label="Agreed contract amount" value={selectedClient ? `${money(selectedClient.contractAmount ?? selectedClient.monthlyCost ?? 0, currency)} / ${(selectedClient.billingCycle || 'Monthly').toLowerCase()}` : (hasMonthlyCost ? money(total, currency) : '—')} change="Fixed contract amount" icon={Wallet} foot="configured billing cycle"/><StatCard label="Running instances" value={numberText(active)} change={`${resources.length} total resources`} icon={Server} foot="from saved inventory"/><StatCard label="Average CPU utilization" value={`${cpu.toFixed(1)}%`} change="Live sample" icon={Cpu} foot="animated telemetry"/><StatCard label="Managed storage" value={resources.some(resource => resource.storageGB !== undefined && resource.storageGB !== '') ? (storage >= 1024 ? `${(storage / 1024).toFixed(2)} TB` : `${numberText(storage)} GB`) : '—'} change={`${resources.length} resources`} icon={Database} foot="configured capacity"/></>}</div>
    <div className="dashboard-grid"><section className="panel usage-panel"><div className="panel-head"><div><h3>Resource utilization</h3><p>Automatically generated rolling telemetry</p></div><div className="panel-controls"><div className="segmented">{['1 hour', '24 hours', '7 days'].map(value => <button className={period === value ? 'selected' : ''} onClick={() => setPeriod(value)} key={value}>{value}</button>)}</div><button className="more-btn" aria-label="More"><MoreHorizontal size={18}/></button></div></div>
      <div className="chart-legend"><span><i className="legend-dot cpu"/> CPU avg <b>{cpu.toFixed(1)}%</b></span><span><i className="legend-dot memory"/> Memory avg <b>{memory.toFixed(1)}%</b></span><span><i className="legend-dot network"/> Network avg <b>{`${network.toFixed(1)} Mbps`}</b></span><span className="chart-axis-note">Left axis: % · Right axis: Mbps</span></div>
      {<div className="main-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={series} margin={{ top: 12, right: 8, left: 2, bottom: 0 }}><defs><linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={.2}/><stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient><linearGradient id="memFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#20a57f" stopOpacity={.16}/><stop offset="100%" stopColor="#20a57f" stopOpacity={0}/></linearGradient><linearGradient id="networkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e3a23f" stopOpacity={.12}/><stop offset="100%" stopColor="#e3a23f" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf0f4" vertical={false}/><XAxis dataKey="time" tick={{ fontSize: 11, fill: '#929baa' }} axisLine={false} tickLine={false} interval={Math.max(1, Math.floor(series.length / 6))}/><YAxis yAxisId="percent" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fontSize: 10, fill: '#929baa' }} axisLine={false} tickLine={false} tickFormatter={value => `${value}%`} width={42}/><YAxis yAxisId="network" orientation="right" domain={[0, Math.max(1, Number(series[0]?.networkAllocatedMbps || 100))]} tick={{ fontSize: 10, fill: '#929baa' }} axisLine={false} tickLine={false} tickFormatter={formatMbpsAxis} tickCount={5} width={42}/><Tooltip content={<ResourceTelemetryTooltip/>} cursor={{ stroke: '#8290a0', strokeDasharray: '3 3' }}/><Area yAxisId="percent" type="monotone" dataKey="cpu" name="CPU utilization" stroke="#3b82f6" strokeWidth={2.2} fill="url(#cpuFill)" isAnimationActive animationDuration={750}/><Area yAxisId="percent" type="monotone" dataKey="memory" name="Memory usage" stroke="#20a57f" strokeWidth={2} fill="url(#memFill)" isAnimationActive animationDuration={750}/><Area yAxisId="network" type="monotone" dataKey="network" name="Network I/O" stroke="#e3a23f" strokeWidth={1.8} fill="url(#networkFill)" isAnimationActive animationDuration={750}/></AreaChart></ResponsiveContainer></div>}
      <div className="chart-bottom"><span><span className="live-dot"/> Animated sample telemetry · refreshes every 12 seconds</span><span>{series.length} rolling points <Activity size={13}/></span></div>
    </section>
    <section className="panel health-panel"><div className="panel-head"><div><h3>Infrastructure health</h3><p>Based on the rolling sample and configured resources</p></div><button className="more-btn" aria-label="More"><MoreHorizontal size={18}/></button></div><div className="health-score"><div className="score-ring" style={health === null ? undefined : { background: `conic-gradient(#20a57f 0 ${Math.max(0, Math.min(100, health))}%, #e9f1ee ${Math.max(0, Math.min(100, health))}% 100%)` }}><div><strong>{health === null ? '—' : health.toFixed(1)}</strong><small>HEALTH SCORE</small></div></div><div><div className="health-state"><i/> {health === null ? 'Awaiting data' : health >= 80 ? 'Healthy' : 'Needs review'}</div><p>{health === null ? 'Telemetry is starting.' : 'Automatically estimated from the rolling sample.'}</p></div></div><div className="health-list"><div><span><Server size={15}/> Running instances</span><b>{active} <small>/ {resources.length}</small></b></div><div><span><ShieldCheck size={15}/> Security checks</span><b>{resources.some(resource => resource.securityChecksPassed !== undefined && resource.securityChecksPassed !== '') ? resources.reduce((sum, resource) => sum + Number(resource.securityChecksPassed || 0), 0) : '—'} <small>passed</small></b></div><div><span><Network size={15}/> Network availability</span><b>{`${(99.7 + Math.sin(series.length ? series[series.length - 1].network : 0) * 0.2).toFixed(2)}%`}</b></div><div><span><HardDrive size={15}/> Storage capacity</span><b>{storage && resources.some(resource => resource.storageUsedGB !== undefined && resource.storageUsedGB !== '') ? `${(resources.reduce((sum, resource) => sum + Number(resource.storageUsedGB || 0), 0) / storage * 100).toFixed(1)}%` : '—'}</b></div></div><button className="text-link" onClick={() => change('Infrastructure')}>View infrastructure <ArrowUpRight size={14}/></button></section></div>
    <div className="lower-grid"><section className="panel"><div className="panel-head"><div><h3>Client contract amounts</h3><p>Agreed billing amount by client and billing cycle</p></div><button className="text-link" onClick={() => change('Clients')}>View all <ArrowUpRight size={14}/></button></div>{clients.length ? <div className="client-cost-list">{clients.slice(0, 4).map((client, index) => <div className="cost-row" key={client.code}><div className="client-ident"><div className="client-avatar" style={{ background: client.color }}>{client.initial}</div><div><b>{client.name}</b><small>{client.code} · {client.servers} instances</small></div></div><div className="cost-bar-wrap"><div className="cost-bar"><i style={{ width: `${total ? client.monthly / total * 100 : 0}%`, background: ['#c8cdd5', '#a8b0ba', '#747e8b', '#a8afb9'][index % 4] }}/></div><b>{money(client.contractAmount ?? client.monthly, currency)} / {(client.billingCycle || 'Monthly').toLowerCase()}</b></div></div>)}</div> : <div className="chart-empty">No client accounts have been added.</div>}<div className="panel-footnote">Cost values are configured in the customer account records.</div></section>
      <section className="panel invoice-panel"><div className="panel-head"><div><h3>Recent invoices</h3><p>Latest billing activity</p></div><button className="text-link" onClick={() => change('Invoices')}>All invoices <ArrowUpRight size={14}/></button></div>{invoices.length ? <div className="invoice-mini-list">{invoices.slice(0, 4).map(invoice => <div className="invoice-mini" key={invoice.id}><div className="invoice-file"><FileText size={16}/></div><div className="invoice-info"><b>{invoice.id}</b><small>{invoice.client}</small></div><div className="invoice-amount"><b>{money(invoice.amount, currency)}</b><Status status={invoice.status}/></div></div>)}</div> : <div className="chart-empty">No invoices have been published.</div>}</section></div>
    {contentBlocks.length > 0 && <div className="cl-content-block-grid">{contentBlocks.map(block => <section className="panel" key={block._id}><h3>{block.title}</h3><p>{block.body}</p>{block.linkUrl && <a href={block.linkUrl} target="_blank" rel="noreferrer">{block.linkLabel || 'Learn more'} <ArrowUpRight size={13}/></a>}</section>)}</div>}
    <div className="provider-strip">{connected.slice(0, 3).map((integration, index) => <div key={integration.name || integration.title}><span className={`provider-icon ${['aws', 'do', 'vercel'][index] || 'aws'}`}>{(integration.name || integration.title || 'C').charAt(0)}</span><div><b>{integration.name || integration.title}</b><small>{integration.description || integration.provider || 'Configured integration'}</small></div><Status status={integration.status}/></div>)}<button onClick={() => change('Integrations')}>View integrations <ArrowUpRight size={14}/></button></div>
  </>;
}

function Infrastructure({ resources, currency }) {
  const running = resources.filter(resource => String(resource.status || '').toLowerCase() === 'running').length;
  const storage = resources.reduce((sum, resource) => sum + Number(resource.storageGB || 0), 0);
  const regions = new Set(resources.map(resource => resource.region).filter(Boolean)).size;
  return <><div className="stat-grid"><StatCard label="Provisioned resources" value={numberText(resources.length)} change="Saved inventory" icon={Server} foot="configured resources"/><StatCard label="Running instances" value={numberText(running)} change={`${resources.length ? (running / resources.length * 100).toFixed(1) : '0.0'}%`} icon={Activity} foot="resource availability"/><StatCard label="Attached storage" value={resources.some(resource => resource.storageGB !== undefined && resource.storageGB !== '') ? `${numberText(storage)} GB` : '—'} change="Saved capacity" icon={HardDrive} foot="provisioned storage"/><StatCard label="Regions deployed" value={numberText(regions)} change="Configured regions" icon={Globe2} foot="deployment footprint"/></div>
    <section className="panel table-panel"><div className="panel-head"><div><h3>Compute instances & services</h3><p>Allocated resources and automatic budget-based estimates</p></div></div><div className="table-scroll"><table><thead><tr><th>RESOURCE</th><th>PROVIDER / REGION</th><th>CONFIGURATION</th><th>CPU</th><th>MEMORY</th><th>MONTHLY COST</th><th>STATUS</th></tr></thead><tbody>{resources.map(resource => <tr key={resource._id || resource.name}><td><b>{resource.name || 'Unnamed resource'}</b><small>{resource.category || resource.environment || ''}</small></td><td>{[resource.provider, resource.region].filter(Boolean).join(' · ') || '—'}</td><td>{resource.specification || '—'}</td><td><Meter value={resource.cpuPercent}/></td><td><Meter value={resource.memoryPercent}/></td><td><b>{money(resource.monthlyCost, currency)}</b></td><td><Status status={resource.status}/></td></tr>)}</tbody></table>{resources.length === 0 && <div className="no-results">No infrastructure resources have been configured yet.</div>}</div></section>
    <div className="info-banner"><ShieldCheck size={18}/><div><b>Resource inventory</b><p>When no detailed inventory is supplied, CPU, memory, storage and network allocations are estimated automatically from the client contract amount. Cost per day uses the selected monthly or yearly billing cycle.</p></div></div></>;
}
function Meter({ value }) { if (value === undefined || value === null || value === '') return <span className="muted">—</span>; const n = Math.max(0, Math.min(100, Number(value))); return <div className="meter"><div><i style={{ width: `${n}%`, background: n > 75 ? '#747e8b' : '#c8cdd5' }}/></div><span>{n}%</span></div>; }

function Analytics({ series, resources, currency, todayAccrued = 0 }) {
  const latest = series[series.length - 1] || {};
  const storage = resources.reduce((sum, resource) => sum + Number(resource.storageGB || 0), 0);
  const averageCpu = avg(series, 'cpu');
  const averageMemory = avg(series, 'memory');
  const averageNetwork = avg(series, 'network');
  const iops = avg(series, 'storageIops');
  return <><div className="stat-grid"><StatCard label="Average CPU" value={`${averageCpu.toFixed(1)}%`} change="Live sample" icon={Cpu} foot="animated telemetry"/><StatCard label="Average memory" value={`${averageMemory.toFixed(1)}%`} change="Live sample" positive={false} icon={MemoryStick} foot="animated telemetry"/><StatCard label="Network throughput" value={`${averageNetwork.toFixed(1)} Mbps`} change="Live sample" icon={Network} foot="rolling average"/><StatCard label="Storage IOPS" value={numberText(iops)} change={`${numberText(storage)} GB capacity`} icon={HardDrive} foot="estimated activity"/></div>
    <section className="panel usage-panel"><div className="panel-head"><div><h3>Performance telemetry</h3><p>Automatically generated rolling sample</p></div><span className="status connected">Live simulation</span></div><div className="big-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={series}><CartesianGrid stroke="#edf0f4" vertical={false}/><XAxis dataKey="time" tick={{ fontSize: 11, fill: '#929baa' }} axisLine={false} tickLine={false}/><YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fontSize: 11, fill: '#929baa' }} axisLine={false} tickLine={false} tickFormatter={value => `${value}%`}/><Tooltip content={<ResourceTelemetryTooltip/>}/><Area dataKey="cpu" name="CPU %" stroke="#3b82f6" fill="#3b82f622" isAnimationActive animationDuration={750}/><Area dataKey="memory" name="Memory %" stroke="#20a57f" fill="#20a57f22" isAnimationActive animationDuration={750}/></AreaChart></ResponsiveContainer></div><div className="chart-bottom"><span><span className="live-dot"/> Sample data · updates automatically</span><span>{series.length} rolling points</span></div></section>
    <div className="lower-grid"><section className="panel"><div className="panel-head"><div><h3>Resource distribution</h3><p>Current allocation by resource type</p></div></div>{resources.length ? <div className="dist-legend">{Object.entries(resources.reduce((map, resource) => { const key = resource.category || 'Other'; map[key] = (map[key] || 0) + 1; return map; }, {})).map(([category, count], index) => <span key={category}><i style={{ background: ['#c8cdd5', '#9099a5', '#747e8b', '#a8afb9'][index % 4] }}/>{category}<b>{count}</b></span>)}</div> : <div className="chart-empty">No resource inventory is available.</div>}</section>
      <section className="panel"><div className="panel-head"><div><h3>Latest sample</h3><p>{dateText(latest.timestamp)}</p></div></div><div className="health-list"><div><span>Requests / second</span><b>{numberText(latest.requestRate)}</b></div><div><span>P95 latency</span><b>{latest.latencyMs} ms</b></div><div><span>Error rate</span><b>{latest.errorRate}%</b></div><div><span>Active sessions</span><b>{numberText(latest.activeSessions)}</b></div><div><span>Today's accrued cost</span><b>{todayAccrued === null || todayAccrued === undefined ? '—' : moneyPrecise(todayAccrued, currency)}</b></div></div></section></div>
  </>;
}

function Clients({ clients, setSelectedClient }) {
  return <><div className="summary-line"><b>{clients.length} client accounts</b><span> · Managed infrastructure and billing relationships</span></div><section className="panel table-panel"><div className="panel-head"><div><h3>Client directory</h3><p>Company name and agreed billing amount</p></div></div><div className="table-scroll"><table><thead><tr><th>CLIENT</th><th>PLAN</th><th>PROVIDER</th><th>INSTANCES</th><th>CONTRACT AMOUNT</th><th>STATUS</th><th/></tr></thead><tbody>{clients.map(client => <tr key={client.code} onClick={() => setSelectedClient(client)} style={{ cursor: 'pointer' }}><td><div className="table-client"><div className="client-avatar" style={{ background: client.color }}>{client.initial}</div><div><b>{client.name}</b><small>{client.code}</small></div></div></td><td><span className="plan-pill">{client.plan || '—'}</span></td><td>{client.provider || '—'}</td><td>{client.servers} instances</td><td><b>{money(client.contractAmount ?? client.monthly)} / {(client.billingCycle || 'Monthly').toLowerCase()}</b></td><td><Status status={client.status}/></td><td><ChevronRight size={16}/></td></tr>)}</tbody></table>{clients.length === 0 && <div className="no-results">No client accounts have been added.</div>}</div></section><div className="info-banner"><Building2 size={18}/><div><b>Client-level cloud information</b><p>Account and infrastructure data shown here is maintained by your provider.</p></div></div></>;
}

function CostPlans({ plans, currency }) {
  return <><div className="summary-line">Pricing structures and service inclusions configured for your account.</div>{plans.length ? <><div className="plan-grid">{plans.map((plan, index) => <div className={`plan-card ${index === plans.length - 1 ? 'featured' : ''}`} key={plan._id || plan.name}><div className="plan-top"><span>{plan.name}</span><span className="plan-symbol">{['◌', '◈', '✳'][index % 3]}</span></div><p>{plan.description || ''}</p><h2>{plan.monthlyPrice === undefined ? 'Contact us' : money(plan.monthlyPrice, plan.currency || currency)}<small> / {String(plan.billingCycle || 'month').toLowerCase()}</small></h2><div className="plan-features">{safeArray(plan.features).map(feature => <span key={feature}><Check size={14}/>{feature}</span>)}{plan.serversIncluded !== undefined && <span><Check size={14}/>{plan.serversIncluded} included servers</span>}{plan.storageGB !== undefined && <span><Check size={14}/>{plan.storageGB} GB storage</span>}</div></div>)}</div></> : <EmptyState title="No cost plans published" text="Your provider has not configured any customer-facing plans."/>}</>;
}

function Invoices({ invoices, currency }) {
  const [cycle, setCycle] = useState('All cycles'); const [status, setStatus] = useState('All statuses');
  const rows = invoices.filter(invoice => (cycle === 'All cycles' || invoice.cycle === cycle) && (status === 'All statuses' || invoice.status === status));
  const total = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const collected = invoices.filter(invoice => String(invoice.status).toLowerCase() === 'paid').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const outstanding = invoices.filter(invoice => ['pending', 'overdue'].includes(String(invoice.status).toLowerCase())).reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  return <><div className="stat-grid"><StatCard label="Total invoiced" value={money(total, currency)} change={`${invoices.length} invoices`} icon={ReceiptText} foot="published invoices"/><StatCard label="Collected" value={money(collected, currency)} change="Paid invoices" icon={Wallet} foot="recorded payments"/><StatCard label="Outstanding" value={money(outstanding, currency)} change="Pending / overdue" positive={false} icon={Clock3} foot="awaiting payment"/><StatCard label="Invoice count" value={numberText(invoices.length)} change="Stored records" icon={FileText} foot="billing history"/></div>
    <section className="panel table-panel"><div className="panel-head"><div><h3>Invoice register</h3><p>Invoices published by your cloud provider</p></div></div><div className="invoice-filters"><div className="cycle-tabs">{['All cycles', 'Weekly', 'Monthly', 'Yearly'].map(value => <button key={value} className={cycle === value ? 'on' : ''} onClick={() => setCycle(value)}>{value}</button>)}</div><select value={status} onChange={event => setStatus(event.target.value)}><option>All statuses</option><option>Paid</option><option>Pending</option><option>Overdue</option><option>Draft</option><option>Cancelled</option></select></div><div className="table-scroll"><table><thead><tr><th>INVOICE ID</th><th>CLIENT</th><th>BILLING CYCLE</th><th>ISSUE DATE</th><th>DUE DATE</th><th>TOTAL</th><th>STATUS</th><th>DOCUMENT</th></tr></thead><tbody>{rows.map(invoice => <tr key={invoice._id || invoice.id}><td><b className="linkish">{invoice.id}</b></td><td>{invoice.client}</td><td><span className="plan-pill">{invoice.cycle}</span></td><td>{invoice.date}</td><td>{invoice.due}</td><td><b>{money(invoice.amount, invoice.currency || currency)}</b></td><td><Status status={invoice.status}/></td><td>{invoice.pdfUrl ? <a className="icon-btn small" href={invoice.pdfUrl} target="_blank" rel="noreferrer" title="Open invoice"><ExternalLink size={15}/></a> : invoice._id ? <a className="icon-btn small" href={`${API}/api/public/invoices/${invoice._id}/pdf`} target="_blank" rel="noreferrer" title="Download invoice PDF"><Download size={15}/></a> : '—'}</td></tr>)}</tbody></table>{rows.length === 0 && <div className="no-results">No invoices are available for the selected filters.</div>}</div></section>
    <div className="info-banner"><ShieldCheck size={18}/><div><b>Billing records</b><p>Invoice records and document links are published by your cloud provider. Contact support if you need a copy or clarification.</p></div></div></>;
}

function Transactions({ transactions, invoices = [], client, currency }) {
  const now = new Date();
  const fromInvoices = useMemo(() => buildTransactionsFromInvoices(invoices, now), [invoices]);
  const sample = useMemo(() => buildEstimatedTransactions(client || {}, now), [client?.code, client?.name, client?.contractAmount, client?.billingCycle]);
  const published = transactions.length > 0;
  const rows = published ? transactions : fromInvoices.length ? fromInvoices : sample;
  const source = published ? 'published' : fromInvoices.length ? 'invoices' : sample.length ? 'sample' : 'none';
  const sum = summarizeTransactions(rows, invoices);
  const cur = rows[0]?.currency || currency;
  return <>
    {rows.length > 0 && <div className="txn-summary">
      <div><small>TOTAL RECEIVED</small><b>{money(sum.received, cur)}</b><em>{sum.count} successful payment{sum.count === 1 ? '' : 's'}</em></div>
      <div><small>LAST PAYMENT</small><b>{sum.last ? money(sum.last.amount, sum.last.currency || cur) : '—'}</b><em>{sum.last ? `${dateText(sum.last.date)} · ${sum.last.method || '—'}` : '—'}</em></div>
      <div><small>OUTSTANDING</small><b>{money(sum.outstanding, cur)}</b><em>Pending and overdue invoices</em></div>
      <div><small>PAYMENT METHODS</small><b>{new Set(rows.map(row => row.method).filter(Boolean)).size}</b><em>{[...new Set(rows.map(row => row.method).filter(Boolean))].slice(0, 3).join(' · ') || '—'}</em></div>
    </div>}
    <section className="panel table-panel"><div className="panel-head"><div><h3>Payment transactions</h3><p>{source === 'invoices' ? 'One payment for every paid invoice, matched to the Invoices page' : source === 'sample' ? <>Payment history from the contract amount <span className="estimated-inline-label">AUTO-GENERATED SAMPLE</span></> : 'Payment records associated with this workspace'}</p></div></div><div className="table-scroll"><table><thead><tr><th>REFERENCE</th><th>CLIENT</th><th>INVOICE</th><th>DATE</th><th>METHOD</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>{rows.map(transaction => <tr key={transaction._id || transaction.reference}><td><b>{transaction.reference || '—'}</b></td><td>{transaction.clientName || '—'}</td><td>{transaction.invoiceNumber || '—'}</td><td>{dateText(transaction.date)}</td><td>{transaction.method || '—'}</td><td><b>{money(transaction.amount, transaction.currency || currency)}</b></td><td><Status status={transaction.status}/></td></tr>)}</tbody></table>{rows.length === 0 && <div className="no-results">No payments yet. Payments appear here when an invoice is marked Paid, or once a contract amount is set for this client.</div>}</div></section>
  </>;
}

function Integrations({ integrations, resources }) {
  return integrations.length ? <div className="integration-grid">{integrations.map((integration, index) => <div className="panel integration-card" key={integration._id || integration.name}><div className={`integration-logo logo-${index % 6}`}>{(integration.name || integration.title || 'C').charAt(0)}</div><div><h3>{integration.name || integration.title}</h3><p>{integration.description || [integration.provider, integration.region].filter(Boolean).join(' · ')}</p></div><div className="integration-bottom"><Status status={integration.status}/>{integration.accountName && <span>{integration.accountName}</span>}</div></div>)}</div> : <EmptyState title="No integrations configured" text="Integration details will appear here when they are added by your provider."/>;
}

function SettingsPage({ client, profile, settings }) {
  return <div className="settings-layout"><div className="settings-menu"><b>Workspace</b><span className="chosen">Account overview</span><span>Infrastructure profile</span><span>Support</span></div><section className="panel settings-form"><h3>Workspace information</h3><p>Read-only account information maintained by your cloud provider.</p><div className="form-grid"><label>Client / organization<input readOnly value={client?.name || ''}/></label><label>Client code<input readOnly value={client?.code || ''}/></label><label>Assigned plan<input readOnly value={client?.plan || ''}/></label><label>Cloud provider<input readOnly value={client?.provider || ''}/></label><label className="wide">Environment description<textarea readOnly value={profile.description || profile.environmentDescription || ''}/></label><label>Support email<input readOnly value={settings.supportEmail || ''}/></label><label>Support website<input readOnly value={settings.supportUrl || ''}/></label></div><div className="form-actions"><span>To request a change, contact your account administrator.</span></div></section></div>;
}

export default App;
