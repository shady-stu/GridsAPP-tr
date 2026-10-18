import { useEffect, useMemo, useReducer, useState } from "react";
import { DataTable, type Column } from "./components/DataTable";
import { OrderForm } from "./components/OrderForm";
import { createDemoProvider } from "./data/provider";
import type { Customer, Order, OrderStatus } from "./domain/schemas";
import {
  dashboardReducer,
  initialDashboardState,
} from "./state/dashboardReducer";
import "./App.css";

const provider = createDemoProvider();
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const avatarColors = ["lavender", "peach", "mint", "sky", "rose"];
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
function statusLabel(status: OrderStatus) {
  switch (status) {
    case "processing":
      return "Processing";
    case "shipped":
      return "Shipped";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function App() {
  const [state, dispatch] = useReducer(dashboardReducer, initialDashboardState);
  const [activeNav, setActiveNav] = useState("Overview");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    provider
      .loadDashboard()
      .then((result) => {
        if (!active) return;
        if (result.success)
          dispatch({ type: "load-succeeded", ...result.data });
        else dispatch({ type: "load-failed", message: result.error.message });
      })
      .catch(() => {
        if (active)
          dispatch({
            type: "load-failed",
            message:
              "Dashboard data could not be loaded. Please refresh to try again.",
          });
      });
    return () => {
      active = false;
    };
  }, []);

  const data = state.data.status === "ready" ? state.data : null;
  const visibleOrders = useMemo(() => {
    if (!data) return [];
    return data.orders.filter((order) => {
      const customer = data.customers.find(
        (entry) => entry.id === order.customerId,
      );
      const matchesCustomer =
        state.customerFilter === "all" ||
        order.customerId === state.customerFilter;
      const query = search.trim().toLowerCase();
      return (
        matchesCustomer &&
        (!query ||
          `${order.id} ${order.description} ${customer?.name ?? ""}`
            .toLowerCase()
            .includes(query))
      );
    });
  }, [data, state.customerFilter, search]);

  const orderColumns: Column<Order>[] = [
    {
      key: "id",
      header: "Order",
      render: (order) => <span className="order-id">{order.id}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      render: (order) => {
        const customer = data?.customers.find(
          (entry) => entry.id === order.customerId,
        );
        return customer ? (
          <span className="customer-cell">
            <span
              className={`avatar ${avatarColors[Number(customer.id.slice(-1)) % avatarColors.length]}`}
            >
              {initials(customer.name)}
            </span>
            <span>
              <strong>{customer.name}</strong>
              <small>{customer.company}</small>
            </span>
          </span>
        ) : (
          "Unknown customer"
        );
      },
    },
    {
      key: "description",
      header: "Description",
      render: (order) => order.description,
      className: "description-column",
    },
    {
      key: "date",
      header: "Date",
      render: (order) => (
        <span className="muted">{formatDate(order.createdAt)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (order) => (
        <span className={`status status-${order.status}`}>
          <span />
          {statusLabel(order.status)}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (order) => <strong>{currency.format(order.amount)}</strong>,
      className: "amount-column",
    },
  ];
  const customerColumns: Column<Customer>[] = [
    {
      key: "customer",
      header: "Customer",
      render: (customer) => (
        <span className="customer-cell">
          <span
            className={`avatar ${avatarColors[Number(customer.id.slice(-1)) % avatarColors.length]}`}
          >
            {initials(customer.name)}
          </span>
          <span>
            <strong>{customer.name}</strong>
            <small>{customer.email}</small>
          </span>
        </span>
      ),
    },
    {
      key: "company",
      header: "Company",
      render: (customer) => customer.company,
    },
    {
      key: "joined",
      header: "Customer since",
      render: (customer) => (
        <span className="muted">{formatDate(customer.joinedAt)}</span>
      ),
    },
    {
      key: "orders",
      header: "Orders",
      render: (customer) =>
        data?.orders.filter((order) => order.customerId === customer.id)
          .length ?? 0,
    },
  ];
  const filteredCustomers =
    data?.customers.filter((customer) =>
      `${customer.name} ${customer.company} ${customer.email}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  const completedRevenue =
    data?.orders
      .filter((order) => order.status === "completed")
      .reduce((sum, order) => sum + order.amount, 0) ?? 0;
  const pendingCount =
    data?.orders.filter(
      (order) => order.status === "processing" || order.status === "shipped",
    ).length ?? 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="Northstar home">
          <span className="brand-mark">✳</span>
          <span>
            northstar<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-logo">S</span>
          <span className="workspace-copy">
            <strong>Studio workspace</strong>
            <small>Free plan</small>
          </span>
          <span className="chevron">⌄</span>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation" className="main-nav">
          {[
            ["▦", "Overview"],
            ["♙", "Customers"],
            ["▤", "Orders"],
            ["◷", "Activity"],
          ].map(([icon, label]) => (
            <button
              className={`nav-item ${activeNav === label ? "active" : ""}`}
              key={label}
              onClick={() => {
                setActiveNav(label);
                if (
                  label === "Customers" ||
                  label === "Orders" ||
                  label === "Activity"
                )
                  document
                    .getElementById(label.toLowerCase())
                    ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <span className="nav-icon">{icon}</span>
              {label}
              {label === "Orders" && (
                <span className="nav-count">{data?.orders.length ?? "—"}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">✳</span>
            <strong>Need a hand?</strong>
            <p>Our team is here to help you get the most out of Northstar.</p>
            <button onClick={() => setActiveNav("Help center")}>
              Visit help center <span>↗</span>
            </button>
          </div>
          <button
            className="nav-item settings"
            onClick={() => setActiveNav("Settings")}
          >
            <span className="nav-icon">⚙</span>Settings
          </button>
          <div className="profile">
            <span className="profile-avatar">JD</span>
            <span>
              <strong>Jordan Davis</strong>
              <small>jordan@studio.co</small>
            </span>
            <button aria-label="Account options">···</button>
          </div>
        </div>
      </aside>
      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span>/</span>
            <strong>{activeNav}</strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search dashboard"
                placeholder="Search anything..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
            >
              ♧<i />
            </button>
            <span className="topbar-avatar">JD</span>
          </div>
        </header>
        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow date-eyebrow">
                <span className="sun-icon">☼</span> MONDAY, OCTOBER 13, 2025
              </div>
              <h1>
                Good morning, Jordan <span>✳</span>
              </h1>
              <p>Here’s what’s happening with your business today.</p>
            </div>
            <div className="welcome-actions">
              <button
                className="secondary-button"
                onClick={() => window.print()}
              >
                <span>↧</span> Export report
              </button>
              <button
                className="primary-button"
                onClick={() =>
                  document.getElementById("order-customer")?.focus()
                }
              >
                <span>＋</span> New order
              </button>
            </div>
          </section>
          {state.data.status === "loading" && (
            <section className="state-card" role="status">
              <span className="spinner" />
              Loading your workspace…
            </section>
          )}
          {state.data.status === "error" && (
            <section className="state-card error-state" role="alert">
              <span>!</span>
              <div>
                <strong>We couldn’t load your dashboard</strong>
                <p>{state.data.message}</p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    dispatch({ type: "load-started" });
                    provider
                      .loadDashboard()
                      .then((result) =>
                        result.success
                          ? dispatch({ type: "load-succeeded", ...result.data })
                          : dispatch({
                              type: "load-failed",
                              message: result.error.message,
                            }),
                      )
                      .catch(() =>
                        dispatch({
                          type: "load-failed",
                          message: "Please try again.",
                        }),
                      );
                  }}
                >
                  Try again
                </button>
              </div>
            </section>
          )}
          {data && (
            <>
              <section className="stats-grid" aria-label="Business overview">
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Total customers</span>
                    <span className="stat-icon indigo">♙</span>
                  </div>
                  <div className="stat-value">
                    {data.customers.length}
                    <span className="trend positive">↗ 12.5%</span>
                  </div>
                  <div className="stat-foot">vs. last month</div>
                  <div className="sparkline spark-purple">
                    <svg
                      viewBox="0 0 130 36"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path d="M0 28 12 23 24 26 36 15 48 19 60 12 72 18 84 9 96 14 108 5 120 10 130 3" />
                    </svg>
                  </div>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Total orders</span>
                    <span className="stat-icon orange">▤</span>
                  </div>
                  <div className="stat-value">
                    {data.orders.length}
                    <span className="trend positive">↗ 8.2%</span>
                  </div>
                  <div className="stat-foot">vs. last month</div>
                  <div className="sparkline spark-orange">
                    <svg
                      viewBox="0 0 130 36"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path d="M0 27 12 29 24 19 36 22 48 16 60 19 72 8 84 15 96 7 108 11 120 4 130 6" />
                    </svg>
                  </div>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Completed revenue</span>
                    <span className="stat-icon green">$</span>
                  </div>
                  <div className="stat-value">
                    {currency.format(completedRevenue)}
                    <span className="trend positive">↗ 18.4%</span>
                  </div>
                  <div className="stat-foot">vs. last month</div>
                  <div className="sparkline spark-green">
                    <svg
                      viewBox="0 0 130 36"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path d="M0 30 12 24 24 26 36 18 48 21 60 13 72 17 84 10 96 13 108 5 120 8 130 2" />
                    </svg>
                  </div>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Open orders</span>
                    <span className="stat-icon blue">◷</span>
                  </div>
                  <div className="stat-value">
                    {pendingCount}
                    <span className="trend neutral">On track</span>
                  </div>
                  <div className="stat-foot">Processing or shipped</div>
                  <div className="open-bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </article>
              </section>
              <section className="content-grid">
                <article className="panel orders-panel" id="orders">
                  <div className="panel-heading">
                    <div>
                      <h2>Recent orders</h2>
                      <p>A snapshot of your latest transactions.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        setActiveNav("Orders");
                        document
                          .getElementById("orders")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      View all orders <span>→</span>
                    </button>
                  </div>
                  <div className="table-toolbar">
                    <div className="filter-select">
                      <span>Showing</span>
                      <select
                        aria-label="Filter orders by customer"
                        value={state.customerFilter}
                        onChange={(event) =>
                          dispatch({
                            type: "customer-filter-changed",
                            customerId: event.target.value,
                          })
                        }
                      >
                        <option value="all">All customers</option>
                        {data.customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                      <span>⌄</span>
                    </div>
                    <span className="results-count">
                      {visibleOrders.length} orders
                    </span>
                  </div>
                  <DataTable
                    rows={visibleOrders}
                    columns={orderColumns}
                    rowKey={(order) => order.id}
                    emptyMessage="No orders match this filter."
                    label="Recent customer orders"
                  />
                  <div className="panel-footer">
                    <span>
                      Showing <strong>{visibleOrders.length}</strong> of{" "}
                      <strong>{data.orders.length}</strong> orders
                    </span>
                    <button
                      className="pagination-button"
                      aria-label="Previous page"
                      disabled
                    >
                      ‹
                    </button>
                    <button
                      className="pagination-button current-page"
                      aria-current="page"
                    >
                      1
                    </button>
                    <button
                      className="pagination-button"
                      aria-label="Next page"
                      disabled
                    >
                      ›
                    </button>
                  </div>
                </article>
                <OrderForm
                  customers={data.customers}
                  provider={provider}
                  onCreated={(order) =>
                    dispatch({ type: "order-created", order })
                  }
                />
              </section>
              {state.notice && (
                <p className="sr-only" role="status">
                  {state.notice}
                </p>
              )}
              <section className="content-grid lower-grid">
                <article className="panel customers-panel" id="customers">
                  <div className="panel-heading">
                    <div>
                      <h2>Your customers</h2>
                      <p>People who make your business happen.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setActiveNav("Customers")}
                    >
                      View all <span>→</span>
                    </button>
                  </div>
                  <DataTable
                    rows={filteredCustomers}
                    columns={customerColumns}
                    rowKey={(customer) => customer.id}
                    emptyMessage="No customers match your search."
                    label="Customer directory"
                  />
                  <div className="panel-footer">
                    <span>
                      {filteredCustomers.length} customers in your workspace
                    </span>
                  </div>
                </article>
                <article className="panel activity-panel" id="activity">
                  <div className="panel-heading">
                    <div>
                      <h2>Recent activity</h2>
                      <p>Latest updates from your workspace.</p>
                    </div>
                    <button
                      className="icon-button small-icon"
                      aria-label="Activity options"
                    >
                      ···
                    </button>
                  </div>
                  <div className="activity-list">
                    {data.activity.length ? (
                      data.activity.slice(0, 4).map((activity, index) => (
                        <div className="activity-item" key={activity.id}>
                          <span
                            className={`activity-icon activity-${activity.kind}`}
                            aria-hidden="true"
                          >
                            {activity.kind === "order_created"
                              ? "↗"
                              : activity.kind === "order_completed"
                                ? "✓"
                                : "+"}
                          </span>
                          <div>
                            <p>{activity.message}</p>
                            <time dateTime={activity.createdAt}>
                              {index === 0
                                ? "Just now"
                                : formatDate(activity.createdAt)}
                            </time>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="activity-empty">No recent activity yet.</p>
                    )}
                  </div>
                  <button
                    className="activity-link"
                    onClick={() => setActiveNav("Activity")}
                  >
                    See all activity <span>→</span>
                  </button>
                </article>
              </section>
              <footer className="page-footer">
                <span>© 2025 Northstar Studio</span>
                <span>
                  Made for your next big thing{" "}
                  <span className="footer-star">✳</span>
                </span>
                <a href="mailto:hello@northstar.example">Need help?</a>
              </footer>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
