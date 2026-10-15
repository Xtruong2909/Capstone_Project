import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  CheckCircle,
  ScrollText,
  LogOut,
  Shield,
  KeyRound,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import ChangePasswordModal from "../auth/ChangePasswordModal";
import "./AdminLayout.css";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar__header">
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo-badge">
              <Shield size={20} />
            </div>
            <div className="admin-sidebar__brand-text">
              <h2>Urban Traffic</h2>
              <span>Admin Portal</span>
            </div>
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `admin-nav-item ${isActive ? "active" : ""}`
            }
          >
            <LayoutDashboard size={18} />
            <span>Tổng quan hệ thống</span>
          </NavLink>

          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              `admin-nav-item ${isActive ? "active" : ""}`
            }
          >
            <Users size={18} />
            <span>Quản lý người dùng</span>
          </NavLink>

          <NavLink
            to="/admin/datasets"
            className={({ isActive }) =>
              `admin-nav-item ${isActive ? "active" : ""}`
            }
          >
            <CheckCircle size={18} />
            <span>Phê duyệt Dataset</span>
          </NavLink>

          <NavLink
            to="/admin/audit-logs"
            className={({ isActive }) =>
              `admin-nav-item ${isActive ? "active" : ""}`
            }
          >
            <ScrollText size={18} />
            <span>Nhật ký hoạt động</span>
          </NavLink>
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-user-profile">
            <div className="admin-avatar">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : "A"}
            </div>
            <div className="admin-user-info">
              <span className="admin-user-name">
                {user?.full_name || "Administrator"}
              </span>
              <span className="admin-user-email">
                {user?.email || "admin@gmail.com"}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="admin-change-pwd-btn"
            onClick={() => setIsChangePasswordOpen(true)}
          >
            <KeyRound size={16} />
            <span>Đổi mật khẩu</span>
          </button>
          <button
            type="button"
            className="admin-logout-btn"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="admin-main">
        <header className="admin-header">
          
          <div className="admin-header__title">
            <h1>Bảng điều khiển Quản trị viên</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div className="admin-header__badge">
              <span>Vai trò: Administrator</span>
            </div>
           
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      {/* Modal Đổi mật khẩu */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}
