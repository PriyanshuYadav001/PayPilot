import React from 'react';
import { DollarSign, AlertCircle, Clock, CheckCircle, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { StatusBadge as StatusBadgeComp } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';

const navGroups = [
  { label: "Dashboard", icon: 'LayoutDashboard', route: 'dashboard' },
  { label: "Customers", icon: 'Users', route: 'customers' },
  { label: "Invoices", icon: 'Receipt', route: 'invoices' },
  { label: "Payments", icon: 'CreditCard', route: 'payments' },
  { label: "Follow-ups", icon: 'RefreshCw', route: 'followups' },
  { label: "Analytics", icon: 'Activity', route: 'analytics' },
];

const customers = [
  { name: "Northstar Labs", status: "Healthy", outstanding: "$42,850", overdue: "$12,400", lastPayment: "Aug 12, 2026", nextFollowup: "Today" },
  { name: "Orbit Systems", status: "Needs attention", outstanding: "$28,600", overdue: "$8,200", lastPayment: "Aug 08, 2026", nextFollowup: "Tomorrow" },
  { name: "Helio Works", status: "Healthy", outstanding: "$18,240", overdue: "$0", lastPayment: "Aug 02, 2026", nextFollowup: "Aug 19" },
  { name: "Morrow & Co.", status: "Needs attention", outstanding: "$9,840", overdue: "$3,100", lastPayment: "Jul 28, 2026", nextFollowup: "Aug 21" },
  { name: "Pinecone Studio", status: "Healthy", outstanding: "$6,720", overdue: "$0", lastPayment: "Jul 22, 2026", nextFollowup: "Completed" },
];

const invoices = [
  { id: "INV-2048", customer: "Northstar Labs", amount: "$12,400", due: "Aug 14, 2026", status: "Overdue", balance: "$0", nextFollowup: "Today" },
  { id: "INV-2043", customer: "Orbit Systems", amount: "$8,200", due: "Aug 18, 2026", status: "Pending", balance: "$0", nextFollowup: "Tomorrow" },
  { id: "INV-2036", customer: "Helio Works", amount: "$18,240", due: "Aug 02, 2026", status: "Paid", balance: "$18,240", nextFollowup: "—" },
  { id: "INV-2029", customer: "Morrow & Co.", amount: "$6,740", due: "Jul 28, 2026", status: "Partially paid", balance: "$3,640", nextFollowup: "Aug 21" },
  { id: "INV-2018", customer: "Pinecone Studio", amount: "$4,500", due: "Jul 22, 2026", status: "Paid", balance: "$4,500", nextFollowup: "—" },
];

const activity = [
  { id: "1", type: "payment", text: "Payment received", detail: "Helio Works paid INV-2036", amount: "$18,240", time: "2m ago", tone: "success" },
  { id: "2", type: "followup", text: "Follow-up sent", detail: "WhatsApp reminder to Northstar Labs", invoice: "INV-2048", time: "26m ago", tone: "info" },
  { id: "3", type: "promise", text: "Payment promise", detail: "Orbit Systems promised Aug 18", amount: "$8,200", time: "1h ago", tone: "warning" },
  { id: "4", type: "invoice", text: "Invoice created", detail: "INV-2048 for Northstar Labs", amount: "$12,400", time: "3h ago", tone: "neutral" },
];

function getStatusClass(status: string) {
  const lower = status.toLowerCase();
  if (lower.includes("paid") || status === "Completed") return "success";
  if (lower.includes("overdue") || status.toLowerCase().includes("failed")) return "danger";
  if (lower.includes("promise")) return "warning";
  return "neutral";
}

function StatusBadge({ status }: { status: string }) {
  const statusClass = getStatusClass(status);
  return (
    <span className={`status status-${statusClass}`}>
      <span className="status-dot" />
      {status}
    </span>
  );
}

function StatCard({ label, value, detail, trend, icon: Icon, accent = "emerald" }: any) {
  const trendClass = trend?.startsWith("+") ? "trend-up" : trend === "—" ? "trend-flat" : "trend-down";
  return (
    <div className="stat-card bg-slate-800/80 border border-slate-700/60 rounded-2xl p-6 shadow-lg hover:border-emerald-500/20 transition-colors duration-300">
      <div className="stat-top flex items-center justify-between">
        <span className="eyebrow text-slate-400 text-sm">{label}</span>
        <Icon className="w-5 h-5 text-emerald-400" />
      </div>
      <div className="stat-value text-3xl font-bold mt-2">{value}</div>
      {trend && (
        <div className="stat-detail mt-2 flex items-center justify-center gap-2">
          <span className={`trend ${trendClass}`}>{trend}</span>
        </div>
      )}
      <div className="text-slate-500 text-xs mt-1">{detail}</div>
    </div>
  );
}

function SectionHeader({ eyebrow, title, action }: any) {
  return (
    <div className="section-header">
      <div>
        <div className="eyebrow text-slate-400 text-xs">{eyebrow}</div>
        <h2 className="text-lg font-semibold text-slate-200">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, text, icon: Icon = () => <DollarSign className="w-8 h-8 text-slate-500" /> }: any) {
  return (
    <div className="empty-state text-center py-12">
      <Icon className="w-12 h-12 mx-auto text-slate-500 mb-3" />
      <strong className="text-slate-300">{title}</strong>
      <p className="text-slate-500 mt-2">{text}</p>
    </div>
  );
}

function DataTable({ type }: { type: "invoices" | "customers" | "payments" }) {
  if (type === "customers") {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Status</th>
              <th>Outstanding</th>
              <th>Overdue</th>
              <th>Last payment</th>
              <th>Next follow-up</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.name} className="hover:bg-slate-900/50 transition-colors">
                <td>
                  <div className="person">
                    <span className="avatar avatar-sm">{c.name.slice(0, 2)}</span>
                    <div>
                      <strong>{c.name}</strong>
                      <small>{c.status}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <StatusBadgeComp status={c.status === "Healthy" ? "Healthy" : "Needs attention"} />
                </td>
                <td className="money">{c.outstanding}</td>
                <td>{c.overdue}</td>
                <td>{c.lastPayment}</td>
                <td>{c.nextFollowup}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (type === "payments") {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Payment ID</th>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["PAY-8942", "INV-2036", "Helio Works", "$18,240", "ACH", "Succeeded", "Aug 15, 2026"],
              ["PAY-8931", "INV-2029", "Morrow & Co.", "$3,640", "Card", "Succeeded", "Aug 13, 2026"],
              ["PAY-8910", "INV-2018", "Pinecone Studio", "$4,500", "ACH", "Succeeded", "Aug 10, 2026"],
              ["PAY-8894", "INV-2007", "Verdant Retail", "$2,180", "Card", "Refunded", "Aug 08, 2026"],
            ].map((p) => (
              <tr key={p[0]} className="hover:bg-slate-900/50 transition-colors">
                <td className="mono">{p[0]}</td>
                <td className="mono">{p[1]}</td>
                <td>{p[2]}</td>
                <td className="money">{p[3]}</td>
                <td>{p[4]}</td>
                <StatusBadgeComp status={p[5]} />
                <td>{p[6]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Due date</th>
            <th>Status</th>
            <th>Balance</th>
            <th>Next follow-up</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id} className="hover:bg-slate-900/50 transition-colors">
              <td className="mono">{i.id}</td>
              <td><strong>{i.customer}</strong></td>
              <td className="money">{i.amount}</td>
              <td>{i.due}</td>
              <StatusBadgeComp status={i.status} />
              <td className={i.balance !== "$0" ? "money danger-text" : "money"}>
                {i.balance}
              </td>
              <td>{i.nextFollowup}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [active, setActive] = React.useState("dashboard");
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const content = React.useMemo(
    () => active === "dashboard" ? <Dashboard /> : <GenericPage page={active} query={query} setQuery={setQuery} />,
    [active, query]
  );

  return (
    <div className="app-shell">
      {/* Sidebar - simplified for demo */}
      <aside className="sidebar collapsed">
        <div className="brand">
          <span>PayPilot</span>
        </div>
        <nav>
          {navGroups.map((nav) => (
            <button
              key={nav.label}
              className={`nav-item ${active === nav.label ? "active" : ""}`}
              onClick={() => setActive(nav.label)}
            >
              <span className="w-5 h-5">{nav.icon}</span>
              <span>{nav.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="top-title">
            <span>PayPilot</span>
            <ChevronRight size={13} />
            <b>{active.charAt(0).toUpperCase() + active.slice(1)}</b>
          </div>
          <div className="top-actions">
            <button className="btn btn-outline btn-sm">
              <Search size={12} /> Search
            </button>
            <button className="btn btn-ghost btn-sm">
              <Bell size={12} />
            </button>
          </div>
        </header>

        <main className="workspace">
          {content}
        </main>
      </main>
    </div>
  );
}

function GenericPage({ page }: { page: string }, query: string, setQuery: any) {
  const config: any = {
    Customers: {
      icon: 'Users',
      eyebrow: "Relationship ledger",
      title: "Customers",
      desc: "Know who owes you, what they owe, and what happens next.",
    },
    Invoices: {
      icon: 'Receipt',
      eyebrow: "Accounts receivable",
      title: "Invoices",
      desc: "A clear view of every invoice from issue to collection.",
    },
    Payments: {
      icon: 'CreditCard',
      eyebrow: "Cash movement",
      title: "Payments",
      desc: "Track successful, pending, failed, and refunded payments.",
    },
    "Payment Links": {
      icon: 'Link',
      eyebrow: "Frictionless collection",
      title: "Payment links",
      desc: "Give customers a direct route from reminder to paid.",
    },
    Followups: {
      icon: 'RefreshCw',
      eyebrow: "Collection system",
      title: "Follow-ups",
      desc: "Turn overdue invoices into a consistent, measurable workflow.",
    },
    Communications: {
      icon: 'MessageSquare',
      eyebrow: "Unified inbox",
      title: "Communications",
      desc: "Every customer conversation, with its financial context attached.",
    },
    Calls: {
      icon: 'Phone',
      eyebrow: "Conversation intelligence",
      title: "Calls",
      desc: "Review scheduled calls, outcomes, and payment promises.",
    },
    Analytics: {
      icon: 'Activity',
      eyebrow: "Performance",
      title: "Analytics",
      desc: "See the signals behind your collection rate.",
    },
    Billing: {
      icon: 'CreditCard',
      eyebrow: "Workspace plan",
      title: "Billing",
      desc: "Your plan, usage, and billing history in one place.",
    },
    Settings: {
      icon: 'Settings',
      eyebrow: "Workspace controls",
      title: "Settings",
      desc: "Tune PayPilot to how your team collects revenue.",
    },
  };

  const c = config[page] || config.Customers;
  const Icon = c.icon;

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div className="heading-icon">
          <Icon size={18} />
        </div>
        <div>
          <p className="eyebrow">{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p className="muted">{c.desc}</p>
        </div>
        <button className="btn btn-primary page-action">Action</button>
      </div>

      {(page === "Customers" || page === "Invoices" || page === "Payments") ? (
        <>
          <div className="subnav">
            <button className="active">All</button>
            <button>Needs attention</button>
            <button>Recently updated</button>
            <div className="subnav-spacer" />
            <div className="search-inline">
              <Search size={14} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`Search ${page.toLowerCase()}...`}
              />
            </div>
            <button className="btn btn-secondary">Filters</button>
          </div>
          <div className="metric-strip">
            <span>
              <b>
                {page === "Payments" ? "$126,460" : page === "Invoices" ? "48" : "126"}
              </b>
              <small>
                {page === "Payments" ? "Total collected" : page === "Invoices" ? "Total invoices" : "Active customers"}
              </small>
            </span>
            <span>
              <b>
                {page === "Payments" ? "$4,280" : page === "Invoices" ? "$42,850" : "$184,620"}
              </b>
              <small>
                {page === "Payments" ? "Pending" : page === "Invoices" ? "Overdue" : "Outstanding"}
              </small>
            </span>
            <span>
              <b>
                {page === "Payments" ? "98.2%" : page === "Invoices" ? "82.4%" : "91.6%"}
              </b>
              <small>Health score</small>
            </span>
          </div>
          <section className="panel">
            <DataTable type={c.table} />
          </section>
        </>
      ) : (
        <RoutePlaceholder page={page} action={c.action} />
      )}
    </div>
  );
}

function RoutePlaceholder({ page, action }: { page: string; action: string }) {
  const isFollow = page === "Follow-ups";

  return (
    <div className="dashboard-grid secondary-grid">
      <section className="panel">
        <SectionHeader
          eyebrow={isFollow ? "Automation map" : "Workspace overview"}
          title={isFollow ? "A calmer way to collect" : `${page} at a glance`}
          action={<button className="btn btn-primary">{action}</button>}
        />
        {isFollow ? (
          <div className="flow">
            <div className="flow-node trigger">
              <span className="flow-kicker">Trigger</span>
              <strong>Invoice becomes overdue</strong>
            </div>
            <ChevronDown />
            <div className="flow-node">
              <span className="flow-kicker">Wait 1 day</span>
              <strong>Send WhatsApp reminder</strong>
            </div>
            <ChevronDown />
            <div className="flow-node">
              <span className="flow-kicker">Wait 3 days</span>
              <strong>Send email reminder</strong>
            </div>
            <ChevronDown />
            <div className="flow-node">
              <span className="flow-kicker">Wait 7 days</span>
              <strong>Place a call</strong>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={() => <DollarSign className="w-8 h-8 text-slate-500" />}
            title={`Your ${page.toLowerCase()} workspace is ready`}
            text="Mock data and reusable surfaces are in place. Connect the real workflow when you are ready."
          />
        )}
      </section>
      <section className="panel">
        <SectionHeader
          eyebrow={isFollow ? "At a glance" : "This period"}
          action={<button className="btn btn-outline"><MoreHorizontal size={17} /></button>}
        />
        <div className="placeholder-stats">
          <div>
            <span className="eyebrow">Completed</span>
            <strong>
              {page === "Calls" ? "38" : page === "Analytics" ? "82.4%" : "24"}
            </strong>
            <small className="trend-up">+12.6%</small>
          </div>
          <div>
            <span className="eyebrow">Pending</span>
            <strong>
              {page === "Calls" ? "7" : "16"}
            </strong>
            <small>requires review</small>
          </div>
          <div>
            <span className="eyebrow">Failed</span>
            <strong>
              {page === "Calls" ? "2" : "3"}
            </strong>
            <small className="danger-text">needs attention</small>
          </div>
        </div>
      </section>
    </div>
  );
}