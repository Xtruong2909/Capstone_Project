import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Database,
  ScrollText,
  LogOut,
  Shield,
  ChevronLeft,
  ChevronRight,
  Cpu,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import "./AdminPortal.css";

const ROUTE_META = {
  "/admin": {
    section: "Command Center",
    title: "Executive Governance & System Telemetry",
  },
  "/admin/users": {
    section: "Identity & Access",
    title: "User Directory & Role-Based Access Control",
  },
  "/admin/datasets": {
    section: "Data Quality Gate",
    title: "UAV Trajectory Quality Gate & Inspection Queue",
  },
  "/admin/datasets-available": {
    section: "Data Quality Gate",
    title: "Verified Benchmark Dataset Catalog",
  },
  "/admin/audit-logs": {
    section: "Compliance & Security",
    title: "Immutable System Audit Ledger",
  },
};

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar_collapsed_admin") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar_collapsed_admin", String(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const currentMeta = ROUTE_META[location.pathname] || ROUTE_META["/admin"];

  return (
    <div className="adm-shell">
      {/* Dark Obsidian Command Sidebar */}
      <aside
        className={`adm-sidebar ${isSidebarCollapsed ? "adm-sidebar--collapsed" : ""}`}
      >
        <button
          type="button"
          className="adm-sidebar__toggle"
          onClick={toggleSidebar}
          aria-label={
            isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
          }
          title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isSidebarCollapsed ? (
            <ChevronRight size={15} />
          ) : (
            <ChevronLeft size={15} />
          )}
        </button>

        <div className="adm-sidebar__brand">
          <div
            className="adm-sidebar__logo"
            title="Traffic Governance Control Center"
          >
            <Shield size={21} />
          </div>
          {!isSidebarCollapsed && (
            <div className="adm-sidebar__brand-info">
              <h2 className="adm-sidebar__brand-title">TRAFFIC GOV</h2>
              <span className="adm-sidebar__brand-sub">Command & Control</span>
            </div>
          )}
        </div>

        <nav className="adm-sidebar__nav">
          <div className="adm-nav-group">
            <span className="adm-nav-group__label">Command Center</span>
            <NavLink
              to="/admin"
              end
              title="Executive Overview"
              className={({ isActive }) =>
                `adm-nav-link ${isActive ? "active" : ""}`
              }
            >
              <LayoutDashboard size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">Executive Overview</span>
            </NavLink>
          </div>

          <div className="adm-nav-group">
            <span className="adm-nav-group__label">Identity & Access</span>
            <NavLink
              to="/admin/users"
              title="Users & RBAC"
              className={({ isActive }) =>
                `adm-nav-link ${isActive ? "active" : ""}`
              }
            >
              <Users size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">Users & RBAC</span>
            </NavLink>
          </div>

          <div className="adm-nav-group">
            <span className="adm-nav-group__label">Data Quality Gate</span>
            <NavLink
              to="/admin/datasets"
              end
              title="Quality Gate Queue"
              className={({ isActive }) =>
                `adm-nav-link ${isActive ? "active" : ""}`
              }
            >
              <ShieldCheck size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">Quality Gate Queue</span>
            </NavLink>

            <NavLink
              to="/admin/datasets-available"
              title="Verified Catalog"
              className={({ isActive }) =>
                `adm-nav-link ${isActive ? "active" : ""}`
              }
            >
              <Database size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">Verified Catalog</span>
            </NavLink>
          </div>

          <div className="adm-nav-group">
            <span className="adm-nav-group__label">Compliance</span>
            <NavLink
              to="/admin/audit-logs"
              title="Security Audit Logs"
              className={({ isActive }) =>
                `adm-nav-link ${isActive ? "active" : ""}`
              }
            >
              <ScrollText size={18} style={{ flexShrink: 0 }} />
              <span className="adm-nav-link__text">Security Audit Logs</span>
            </NavLink>
          </div>
        </nav>

        <div className="adm-sidebar__footer">
          <div
            className="adm-user-card"
            title={`${user?.full_name || "Administrator"} (${user?.email || "admin@gmail.com"})`}
          >
            <div className="adm-user-card__avatar">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : "A"}
            </div>
            {!isSidebarCollapsed && (
              <div className="adm-user-card__meta">
                <span className="adm-user-card__name">
                  {user?.full_name || "Administrator"}
                </span>
                <span className="adm-user-card__role">
                  {user?.email || "admin@gmail.com"}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="adm-logout-btn"
            onClick={handleLogout}
            title="Sign Out"
          >
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {!isSidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="adm-workspace">
        <header className="adm-topbar">
          <div className="adm-topbar__left">
            <span className="adm-topbar__crumb">{currentMeta.section}</span>
            <h1 className="adm-topbar__title">{currentMeta.title}</h1>
          </div>

          <div className="adm-topbar__right">
            <div className="adm-telemetry-chip adm-telemetry-chip--online">
              <span className="adm-telemetry-dot" />
              <span>PostGIS 3.4 Engine</span>
            </div>
            <div className="adm-telemetry-chip">
              <Cpu size={14} style={{ color: "#2563eb" }} />
              <span>pNEUMA Benchmark</span>
            </div>
            <span className="adm-badge adm-badge--rose">
              <Shield size={15} />
              <span>ADMIN</span>
            </span>
          </div>
        </header>

        <main className="adm-canvas">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
