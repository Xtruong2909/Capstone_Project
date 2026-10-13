import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Shield,
  Database,
  Clock,
  Server,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Cpu,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import apiClient from '../../../services/apiClient'

export default function AdminOverview() {
  const [stats, setStats] = useState(null)
  const [dbStatus, setDbStatus] = useState(null)
  const [users, setUsers] = useState([])
  const [datasets, setDatasets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [statsData, dbHealth, usersData, datasetsData] = await Promise.all([
        adminService.getStats(),
        apiClient.get('/health/db').catch(() => ({ data: { status: 'disconnected' } })),
        adminService.getUsers({ limit: 100 }).catch(() => []),
        adminService.getDatasets({ limit: 20 }).catch(() => []),
      ])
      setStats(statsData)
      setDbStatus(dbHealth.data)
      setUsers(usersData)
      setDatasets(datasetsData)
    } catch (err) {
      setError('Không thể tải dữ liệu thống kê từ hệ thống.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleQuickReview = async (versionId, status) => {
    const note = prompt(
      `Nhập ghi chú ${status === 'APPROVED' ? 'phê duyệt' : 'từ chối'} (tùy chọn):`,
      status === 'APPROVED' ? 'Đạt tiêu chuẩn chất lượng dữ liệu UAV' : 'Chưa đạt yêu cầu'
    )
    setActionLoading(versionId)
    try {
      await adminService.reviewDataset(versionId, { status, note })
      await fetchData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Thao tác phê duyệt thất bại.')
    } finally {
      setActionLoading(null)
    }
  }

  if (isLoading) {
    return (
      <div className="empty-state">
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem', color: '#2563eb' }} />
        <p>Đang tải dữ liệu tổng quan hệ thống...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty-state">
        <AlertCircle size={28} style={{ margin: '0 auto 1rem', color: '#dc2626' }} />
        <p>{error}</p>
        <button
          type="button"
          className="btn-action btn-action--primary"
          style={{ marginTop: '1rem' }}
          onClick={fetchData}
        >
          Thử lại
        </button>
      </div>
    )
  }

  // Calculate real role distribution
  const totalUsersCount = users.length || 1
  const roleBreakdown = {
    data_engineer: users.filter((u) => u.role_id === 'data_engineer').length,
    data_scientist: users.filter((u) => u.role_id === 'data_scientist').length,
    business_user: users.filter((u) => u.role_id === 'business_user').length,
    admin: users.filter((u) => u.role_id === 'admin').length,
  }
  const activeUsersCount = users.filter((u) => u.is_active).length

  // Filter pending datasets
  const pendingDatasets = datasets.filter((d) => d.approval_status === 'PENDING')

  return (
    <div>
      {/* 1. TOP: Hạ tầng hệ thống & Môi trường thực thi */}
      <div className="admin-card" style={{ marginBottom: '1.75rem' }}>
        <div className="admin-card__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Server size={18} color="#0f172a" />
            <h3 className="admin-card__title">Hạ tầng hệ thống & Môi trường thực thi</h3>
          </div>
          <button
            type="button"
            className="btn-action btn-action--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={fetchData}
          >
            <RefreshCw size={14} />
            <span>Làm mới</span>
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {/* PostgreSQL + PostGIS */}
          <div style={{ background: '#f8fafc', padding: '1.1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
              <Server size={20} color="#2563eb" />
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>PostgreSQL 16 + PostGIS 3.4</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className={`badge ${dbStatus?.status === 'connected' ? 'badge--active' : 'badge--inactive'}`}>
                {dbStatus?.status === 'connected' ? 'Đã kết nối' : 'Mất kết nối'}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Cổng: 5433</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Container: capstone_postgres (Healthy)</span>
          </div>

          {/* FastAPI Backend */}
          <div style={{ background: '#f8fafc', padding: '1.1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
              <Server size={20} color="#16a34a" />
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>FastAPI REST Backend</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="badge badge--active">Đang hoạt động</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Cổng: 8000</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Python 3.12 (uvicorn worker)</span>
          </div>

          {/* React Vite Frontend */}
          <div style={{ background: '#f8fafc', padding: '1.1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
              <Cpu size={20} color="#9333ea" />
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>React 19 Frontend SPA</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="badge badge--active">Đang phục vụ</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Cổng: 5173</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Vite 8 + React Router 7</span>
          </div>
        </div>
      </div>

      {/* 2. KPI Stats Grid - 100% Real DB counts */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--blue">
            <Users size={24} />
          </div>
          <div className="stat-card__info">
            <h3>{stats?.total_users ?? 0}</h3>
            <p>Người dùng hệ thống</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--purple">
            <Shield size={24} />
          </div>
          <div className="stat-card__info">
            <h3>{stats?.total_roles ?? 0}</h3>
            <p>Vai trò chuẩn hóa</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--green">
            <Database size={24} />
          </div>
          <div className="stat-card__info">
            <h3>{stats?.total_datasets ?? 0}</h3>
            <p>Bộ dữ liệu UAV</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--amber">
            <Clock size={24} />
          </div>
          <div className="stat-card__info">
            <h3>{stats?.pending_approvals ?? 0}</h3>
            <p>Chờ phê duyệt</p>
          </div>
        </div>
      </div>

      {/* 3. Pending Approvals & User Role Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
        {/* Left: Pending Dataset Approvals Queue */}
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div className="admin-card__header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Clock size={18} color="#d97706" />
              <h3 className="admin-card__title">Hàng đợi phê duyệt Dataset</h3>
              {pendingDatasets.length > 0 && (
                <span className="badge badge--pending" style={{ fontSize: '0.7rem' }}>
                  {pendingDatasets.length} cần duyệt
                </span>
              )}
            </div>
            <Link to="/admin/datasets" style={{ fontSize: '0.825rem', color: '#2563eb', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <span>Xem tất cả</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {pendingDatasets.length === 0 ? (
            <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
              <CheckCircle2 size={32} style={{ color: '#16a34a', margin: '0 auto 0.75rem' }} />
              <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', color: '#0f172a' }}>
                Hàng đợi phê duyệt trống
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                Hiện không có phiên bản dataset nào từ Data Engineer chờ phê duyệt.
              </p>
            </div>
          ) : (
            <div className="mini-approval-list">
              {pendingDatasets.slice(0, 3).map((item) => (
                <div key={item.id} className="mini-approval-item">
                  <div className="mini-approval-info">
                    <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{item.dataset_name}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                      <code style={{ background: '#f1f5f9', color: '#0f172a', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        {item.version_tag}
                      </code>
                      <span>•</span>
                      <span>{item.file_format}</span>
                      <span>•</span>
                      <span>{item.total_records.toLocaleString()} dòng</span>
                    </div>
                  </div>
                  <div className="mini-approval-actions">
                    <button
                      type="button"
                      className="btn-action btn-action--success"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                      disabled={actionLoading === item.id}
                      onClick={() => handleQuickReview(item.id, 'APPROVED')}
                    >
                      Duyệt
                    </button>
                    <button
                      type="button"
                      className="btn-action btn-action--danger"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                      disabled={actionLoading === item.id}
                      onClick={() => handleQuickReview(item.id, 'REJECTED')}
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: User Role Breakdown */}
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div className="admin-card__header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShieldCheck size={18} color="#2563eb" />
              <h3 className="admin-card__title">Cơ cấu tài khoản & Vai trò</h3>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#16a34a', background: '#f0fdf4', padding: '0.2rem 0.6rem', borderRadius: '9999px', border: '1px solid #bbf7d0', fontWeight: 600 }}>
              Hoạt động: {activeUsersCount}/{users.length}
            </span>
          </div>

          <div className="role-breakdown-card">
            {/* Visual Multi-color Progress Bar */}
            <div className="role-stacked-bar">
              <div
                className="role-stacked-segment"
                style={{ width: `${(roleBreakdown.data_engineer / totalUsersCount) * 100}%`, background: '#2563eb' }}
                title={`Data Engineer: ${roleBreakdown.data_engineer}`}
              />
              <div
                className="role-stacked-segment"
                style={{ width: `${(roleBreakdown.data_scientist / totalUsersCount) * 100}%`, background: '#9333ea' }}
                title={`Data Scientist: ${roleBreakdown.data_scientist}`}
              />
              <div
                className="role-stacked-segment"
                style={{ width: `${(roleBreakdown.business_user / totalUsersCount) * 100}%`, background: '#16a34a' }}
                title={`Business User: ${roleBreakdown.business_user}`}
              />
              <div
                className="role-stacked-segment"
                style={{ width: `${(roleBreakdown.admin / totalUsersCount) * 100}%`, background: '#dc2626' }}
                title={`Administrator: ${roleBreakdown.admin}`}
              />
            </div>

            {/* Role Stat Items */}
            <div className="role-stat-grid">
              <div className="role-stat-item">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#2563eb' }} />
                    Data Engineer
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    {Math.round((roleBreakdown.data_engineer / totalUsersCount) * 100)}%
                  </span>
                </div>
                <h4 className="role-stat-item__count">{roleBreakdown.data_engineer}</h4>
              </div>

              <div className="role-stat-item">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#9333ea' }} />
                    Data Scientist
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    {Math.round((roleBreakdown.data_scientist / totalUsersCount) * 100)}%
                  </span>
                </div>
                <h4 className="role-stat-item__count">{roleBreakdown.data_scientist}</h4>
              </div>

              <div className="role-stat-item">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#16a34a' }} />
                    Business User
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    {Math.round((roleBreakdown.business_user / totalUsersCount) * 100)}%
                  </span>
                </div>
                <h4 className="role-stat-item__count">{roleBreakdown.business_user}</h4>
              </div>

              <div className="role-stat-item">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#dc2626' }} />
                    Administrator
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    {Math.round((roleBreakdown.admin / totalUsersCount) * 100)}%
                  </span>
                </div>
                <h4 className="role-stat-item__count">{roleBreakdown.admin}</h4>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
