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
  FlaskConical,
  KeyRound,
  Plus,
  Trash2,
  X,
  TrendingUp,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import apiClient from '../../../services/apiClient'

export default function AdminOverview() {
  const [stats, setStats] = useState(null)
  const [dbStatus, setDbStatus] = useState(null)
  const [users, setUsers] = useState([])
  const [datasets, setDatasets] = useState([])
  const [experimentsData, setExperimentsData] = useState({ stats: {}, experiments: [] })
  const [accessGrants, setAccessGrants] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  // Modal grant access
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false)
  const [grantForm, setGrantForm] = useState({
    user_id: '',
    dataset_version_id: '',
    expires_at: '',
  })
  const [grantSubmitting, setGrantSubmitting] = useState(false)
  const [grantError, setGrantError] = useState(null)

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [statsData, dbHealth, usersData, datasetsData, expData, grantsData] = await Promise.all([
        adminService.getStats(),
        apiClient.get('/health/db').catch(() => ({ data: { status: 'disconnected' } })),
        adminService.getUsers({ limit: 100 }).catch(() => []),
        adminService.getDatasets({ limit: 50 }).catch(() => []),
        adminService.getExperimentsOverview().catch(() => ({ stats: {}, experiments: [] })),
        adminService.getAccessGrants({ limit: 50 }).catch(() => []),
      ])
      setStats(statsData)
      setDbStatus(dbHealth.data)
      setUsers(usersData)
      setDatasets(datasetsData)
      setExperimentsData(expData)
      setAccessGrants(grantsData)
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

  const handleGrantSubmit = async (e) => {
    e.preventDefault()
    if (!grantForm.user_id || !grantForm.dataset_version_id) {
      setGrantError('Vui lòng chọn người dùng và phiên bản dữ liệu.')
      return
    }
    setGrantSubmitting(true)
    setGrantError(null)
    try {
      await adminService.grantAccess({
        user_id: grantForm.user_id,
        dataset_version_id: grantForm.dataset_version_id,
        expires_at: grantForm.expires_at ? new Date(grantForm.expires_at).toISOString() : null,
      })
      setIsGrantModalOpen(false)
      setGrantForm({ user_id: '', dataset_version_id: '', expires_at: '' })
      const updatedGrants = await adminService.getAccessGrants()
      setAccessGrants(updatedGrants)
    } catch (err) {
      setGrantError(err.response?.data?.detail || 'Không thể cấp quyền truy cập.')
    } finally {
      setGrantSubmitting(false)
    }
  }

  const handleRevokeGrant = async (grantId) => {
    if (!confirm('Bạn có chắc chắn muốn thu hồi quyền truy cập này?')) return
    setActionLoading(grantId)
    try {
      await adminService.revokeAccess(grantId)
      setAccessGrants((prev) => prev.filter((g) => g.id !== grantId))
    } catch (err) {
      alert(err.response?.data?.detail || 'Thu hồi quyền thất bại.')
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

  // Candidate users for grant (exclude admin)
  const candidateUsers = users.filter((u) => u.role_id !== 'admin')

  // Get experiment stats
  const expStats = experimentsData.stats || {}
  const experimentsList = experimentsData.experiments || []

  const getRoleBadgeClass = (roleId) => {
    switch (roleId) {
      case 'data_engineer': return 'badge--engineer'
      case 'data_scientist': return 'badge--scientist'
      case 'business_user': return 'badge--business'
      default: return 'badge--inactive'
    }
  }

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
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Port: 8000</span>
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
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Port: 5173</span>
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

      {/* 3. Middle Section: Pending Approvals & Role Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
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

      {/* 4. PROPOSAL 1: Trung tâm Giám sát Huấn luyện Mô hình AI/ML (ML Forecasting Experiments Monitor) */}
      <div className="admin-card" style={{ marginBottom: '1.75rem' }}>
        <div className="admin-card__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FlaskConical size={18} color="#9333ea" />
            <h3 className="admin-card__title">Giám sát Thí nghiệm & Huấn luyện Mô hình AI/ML</h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: '#334155', background: '#f8fafc', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              Tổng: <strong>{expStats.total_experiments ?? 0}</strong>
            </span>
            <span style={{ fontSize: '0.75rem', color: '#2563eb', background: '#eff6ff', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
              Đang train: <strong>{expStats.running_count ?? 0}</strong>
            </span>
            <span style={{ fontSize: '0.75rem', color: '#16a34a', background: '#f0fdf4', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
              Hoàn tất: <strong>{expStats.completed_count ?? 0}</strong>
            </span>
            {expStats.best_model_name && (
              <span style={{ fontSize: '0.75rem', color: '#0f172a', background: '#faf5ff', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid #e9d5ff', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <TrendingUp size={12} color="#9333ea" />
                <span>Mô hình tối ưu: <strong>{expStats.best_model_name}</strong> (R²={expStats.best_r2_score})</span>
              </span>
            )}
          </div>
        </div>

        {experimentsList.length === 0 ? (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <FlaskConical size={32} style={{ color: '#94a3b8', margin: '0 auto 0.75rem' }} />
            <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', color: '#0f172a' }}>
              Chưa có tiến trình thí nghiệm nào được khởi tạo
            </h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', maxWidth: '640px', marginInline: 'auto' }}>
              Khi Data Scientist tiến hành huấn luyện các mô hình dự báo chuỗi thời gian (ARIMA hoặc Facebook Prophet),
              tiến trình thực thi, thời gian tính toán và chỉ số benchmark (MAE, RMSE, MAPE, R²) sẽ hiển thị theo thời gian thực tại đây.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tên thí nghiệm</th>
                  <th>Mô hình</th>
                  <th>Biến mục tiêu</th>
                  <th>Khoảng tổng hợp</th>
                  <th>Trạng thái</th>
                  <th>Người thực hiện</th>
                  <th>Đánh giá (Metrics)</th>
                  <th>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {experimentsList.map((exp) => (
                  <tr key={exp.id}>
                    <td>
                      <strong style={{ color: '#0f172a' }}>{exp.name}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {exp.dataset_name} ({exp.dataset_version_tag})
                      </div>
                    </td>
                    <td>
                      <span className="badge badge--scientist">{exp.model_type}</span>
                    </td>
                    <td>{exp.target_variable}</td>
                    <td>{exp.temporal_aggregation_sec / 60} phút</td>
                    <td>
                      <span className={`badge ${
                        exp.status === 'COMPLETED' ? 'badge--active' :
                        exp.status === 'RUNNING' ? 'badge--pending' : 'badge--rejected'
                      }`}>
                        {exp.status === 'COMPLETED' ? 'Hoàn thành' :
                         exp.status === 'RUNNING' ? 'Đang chạy' : exp.status}
                      </span>
                    </td>
                    <td>{exp.creator_name || '—'}</td>
                    <td>
                      {exp.metrics ? (
                        <div style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          <span>R²: <strong>{exp.metrics.r2_score}</strong></span> | <span>RMSE: {exp.metrics.rmse}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Chưa có metrics</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {new Date(exp.created_at).toLocaleDateString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. PROPOSAL 3: Ma trận Cấp quyền Dữ liệu (Dataset Access Governance Matrix) */}
      <div className="admin-card" style={{ marginBottom: 0 }}>
        <div className="admin-card__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <KeyRound size={18} color="#2563eb" />
            <h3 className="admin-card__title">Ma trận Phân quyền & Cấp quyền Dữ liệu UAV</h3>
          </div>

          <button
            type="button"
            className="btn-action btn-action--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
            onClick={() => setIsGrantModalOpen(true)}
          >
            <Plus size={14} />
            <span>Cấp quyền mới</span>
          </button>
        </div>

        {accessGrants.length === 0 ? (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <KeyRound size={32} style={{ color: '#94a3b8', margin: '0 auto 0.75rem' }} />
            <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', color: '#0f172a' }}>
              Chưa có quyền truy cập dữ liệu nào được gán thủ công
            </h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', maxWidth: '640px', marginInline: 'auto' }}>
              Hiện các thành viên chỉ có quyền xem mặc định theo vai trò. Bạn có thể sử dụng nút <strong>"Cấp quyền mới"</strong> phía trên
              để phân quyền trực tiếp cho Data Scientist (quyền huấn luyện mô hình) hoặc Business User (quyền xem kết quả) theo từng phiên bản dataset.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tài khoản được cấp</th>
                  <th>Vai trò</th>
                  <th>Bộ dữ liệu & Phiên bản</th>
                  <th>Người cấp</th>
                  <th>Thời hạn</th>
                  <th>Thời gian cấp</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {accessGrants.map((grant) => (
                  <tr key={grant.id}>
                    <td>
                      <strong style={{ color: '#0f172a' }}>{grant.user_name}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{grant.user_email}</div>
                    </td>
                    <td>
                      <span className={`badge ${getRoleBadgeClass(grant.user_role)}`}>
                        {grant.user_role}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500, color: '#0f172a' }}>{grant.dataset_name}</span>{' '}
                      <code style={{ background: '#f1f5f9', color: '#0f172a', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.75rem' }}>
                        {grant.version_tag}
                      </code>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{grant.granted_by_email || 'System'}</td>
                    <td>
                      {grant.expires_at ? (
                        <span style={{ fontSize: '0.8rem', color: '#d97706' }}>
                          {new Date(grant.expires_at).toLocaleDateString('vi-VN')}
                        </span>
                      ) : (
                        <span className="badge badge--active">Vô thời hạn</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(grant.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-action btn-action--danger"
                        style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}
                        disabled={actionLoading === grant.id}
                        onClick={() => handleRevokeGrant(grant.id)}
                      >
                        <Trash2 size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
                        Thu hồi
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Cấp quyền truy cập mới */}
      {isGrantModalOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsGrantModalOpen(false)
          }}
        >
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Cấp quyền truy cập Dataset</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsGrantModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleGrantSubmit} className="modal-body">
              {grantError && (
                <div style={{
                  padding: '0.75rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  color: '#dc2626',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}>
                  {grantError}
                </div>
              )}

              <div className="form-field">
                <label className="form-label">Chọn người dùng nhận quyền</label>
                <select
                  required
                  value={grantForm.user_id}
                  onChange={(e) => setGrantForm({ ...grantForm, user_id: e.target.value })}
                  className="admin-select"
                  style={{ width: '100%' }}
                >
                  <option value="">-- Chọn thành viên --</option>
                  {candidateUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email}) - [{u.role_id}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Chọn phiên bản Dataset</label>
                <select
                  required
                  value={grantForm.dataset_version_id}
                  onChange={(e) => setGrantForm({ ...grantForm, dataset_version_id: e.target.value })}
                  className="admin-select"
                  style={{ width: '100%' }}
                >
                  <option value="">-- Chọn phiên bản dữ liệu --</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.dataset_name} ({d.version_tag}) - [{d.approval_status}]
                    </option>
                  ))}
                </select>
                {datasets.length === 0 && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#d97706' }}>
                    * Hiện chưa có phiên bản dataset nào được tạo trong hệ thống.
                  </p>
                )}
              </div>

              <div className="form-field" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Thời hạn cấp quyền (Để trống nếu vô thời hạn)</label>
                <input
                  type="date"
                  value={grantForm.expires_at}
                  onChange={(e) => setGrantForm({ ...grantForm, expires_at: e.target.value })}
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsGrantModalOpen(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={grantSubmitting}
                  className="btn-action btn-action--primary"
                  style={{ padding: '0.55rem 1.25rem' }}
                >
                  {grantSubmitting ? 'Đang cấp...' : 'Xác nhận cấp quyền'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
