import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Shield,
  Database,
  Clock,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  FlaskConical,
  KeyRound,
  Plus,
  Trash2,
  X,
  TrendingUp,
  Sparkles,
  Activity,
  Award,
  Layers,
  ScrollText,
  HardDrive,
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

  // Filter pending & approved datasets
  const pendingDatasets = datasets.filter((d) => d.approval_status === 'PENDING')
  const approvedDatasetsCount = datasets.filter((d) => d.approval_status === 'APPROVED').length

  // Get experiment stats
  const expStats = experimentsData.stats || {}
  const experimentsList = experimentsData.experiments || []

  // Meaningful Governance & Operational Health Rates (0% - 100%)
  const activeUserRatePct = users.length > 0
    ? Math.round((activeUsersCount / users.length) * 100)
    : 100
  const approvalRatePct = datasets.length > 0
    ? Math.round((approvedDatasetsCount / datasets.length) * 100)
    : 100
  const totalFinishedOrRunningExps = expStats.total_experiments || experimentsList.length
  const completedExpsCount = expStats.completed_count ?? experimentsList.filter((e) => e.status === 'COMPLETED').length
  const experimentSuccessRatePct = totalFinishedOrRunningExps > 0
    ? Math.round((completedExpsCount / totalFinishedOrRunningExps) * 100)
    : 100
  const nowTimestamp = Date.now()
  const validGrantsCount = accessGrants.filter(
    (g) => !g.expires_at || new Date(g.expires_at).getTime() > nowTimestamp
  ).length
  const validGrantRatePct = accessGrants.length > 0
    ? Math.round((validGrantsCount / accessGrants.length) * 100)
    : 100

  // Candidate users for grant (exclude admin)
  const candidateUsers = users.filter((u) => u.role_id !== 'admin')

  const getRoleBadgeClass = (roleId) => {
    switch (roleId) {
      case 'data_engineer': return 'badge--engineer'
      case 'data_scientist': return 'badge--scientist'
      case 'business_user': return 'badge--business'
      default: return 'badge--inactive'
    }
  }

  const isOnline = dbStatus?.status === 'connected'

  return (
    <div>
      {/* 1. Hero Banner */}
      <div className="admin-hero-banner">
        <div className="admin-hero-banner__top">
          <div className="admin-hero-banner__content">
            <h2 className="admin-hero-banner__title">Tổng quan Quản trị</h2>
          </div>

          <div className="admin-hero-banner__actions">
            <div className={`status-pill-live ${isOnline ? 'status-pill-live--online' : 'status-pill-live--offline'}`}>
              <span className={`status-pulse-dot ${isOnline ? 'status-pulse-dot--online' : 'status-pulse-dot--offline'}`} />
              <span>{isOnline ? 'CSDL trực tuyến' : 'Mất kết nối CSDL'}</span>
            </div>

            <button
              type="button"
              className="btn-hero-primary"
              onClick={() => setIsGrantModalOpen(true)}
            >
              <Plus size={16} />
              <span>Cấp quyền</span>
            </button>

            <button
              type="button"
              className="btn-hero-refresh"
              onClick={fetchData}
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Quick Navigation Tiles */}
        <div className="hero-quick-grid">
          <Link to="/admin/users" className="hero-quick-tile">
            <div className="hero-quick-tile__left">
              <div className="hero-quick-tile__icon admin-card__icon-box--blue">
                <Users size={18} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{stats?.total_users ?? users.length}</div>
                <div className="hero-quick-tile__label">Người dùng</div>
              </div>
            </div>
            <span className="hero-quick-tile__cta"><ArrowRight size={14} /></span>
          </Link>

          <Link to="/admin/datasets" className="hero-quick-tile">
            <div className="hero-quick-tile__left">
              <div className="hero-quick-tile__icon admin-card__icon-box--amber">
                <Clock size={18} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{stats?.pending_approvals ?? pendingDatasets.length}</div>
                <div className="hero-quick-tile__label">Chờ phê duyệt</div>
              </div>
            </div>
            <span className="hero-quick-tile__cta"><ArrowRight size={14} /></span>
          </Link>

          <Link to="/admin/datasets" className="hero-quick-tile">
            <div className="hero-quick-tile__left">
              <div className="hero-quick-tile__icon admin-card__icon-box--green">
                <Database size={18} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{stats?.total_datasets ?? 0}</div>
                <div className="hero-quick-tile__label">Bộ dữ liệu</div>
              </div>
            </div>
            <span className="hero-quick-tile__cta"><ArrowRight size={14} /></span>
          </Link>

          <Link to="/admin/audit-logs" className="hero-quick-tile">
            <div className="hero-quick-tile__left">
              <div className="hero-quick-tile__icon admin-card__icon-box--purple">
                <ScrollText size={18} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{stats?.total_audit_logs ?? 0}</div>
                <div className="hero-quick-tile__label">Nhật ký</div>
              </div>
            </div>
            <span className="hero-quick-tile__cta"><ArrowRight size={14} /></span>
          </Link>
        </div>
      </div>

      {/* 2. Operational & Governance Health Rate Cards */}
      <div className="stats-grid">
        <div className="stat-card stat-card--blue">
          <Users size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <h3>{activeUserRatePct}%</h3>
              <p>Tài khoản hoạt động</p>
            </div>
            <div className="stat-card__icon stat-card__icon--blue">
              <Activity size={22} />
            </div>
          </div>
          <div className="stat-card__mini-bar">
            <div
              className="stat-card__mini-bar-fill"
              style={{ width: `${activeUserRatePct}%`, background: 'linear-gradient(90deg, #2563eb, #38bdf8)' }}
            />
          </div>
        </div>

        <div className="stat-card stat-card--green">
          <CheckCircle2 size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <h3>{approvalRatePct}%</h3>
              <p>Tỷ lệ phê duyệt</p>
            </div>
            <div className="stat-card__icon stat-card__icon--green">
              <CheckCircle2 size={22} />
            </div>
          </div>
          <div className="stat-card__mini-bar">
            <div
              className="stat-card__mini-bar-fill"
              style={{ width: `${approvalRatePct}%`, background: 'linear-gradient(90deg, #059669, #34d399)' }}
            />
          </div>
        </div>

        <div className="stat-card stat-card--purple">
          <FlaskConical size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <h3>{experimentSuccessRatePct}%</h3>
              <p>Tỷ lệ huấn luyện thành công</p>
            </div>
            <div className="stat-card__icon stat-card__icon--purple">
              <FlaskConical size={22} />
            </div>
          </div>
          <div className="stat-card__mini-bar">
            <div
              className="stat-card__mini-bar-fill"
              style={{ width: `${experimentSuccessRatePct}%`, background: 'linear-gradient(90deg, #7c3aed, #c084fc)' }}
            />
          </div>
        </div>

        <div className="stat-card stat-card--amber">
          <KeyRound size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <h3>{validGrantRatePct}%</h3>
              <p>Hiệu lực cấp quyền dữ liệu</p>
            </div>
            <div className="stat-card__icon stat-card__icon--amber">
              <KeyRound size={22} />
            </div>
          </div>
          <div className="stat-card__mini-bar">
            <div
              className="stat-card__mini-bar-fill"
              style={{ width: `${validGrantRatePct}%`, background: 'linear-gradient(90deg, #d97706, #fbbf24)' }}
            />
          </div>
        </div>
      </div>

      {/* 3. Middle Section: Pending Approvals & Role Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.35rem', marginBottom: '1.75rem' }}>
        {/* Left: Pending Dataset Approvals Queue */}
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div className="admin-card__header">
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--amber">
                <Clock size={18} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 className="admin-card__title">Chờ phê duyệt</h3>
                {pendingDatasets.length > 0 && (
                  <span className="badge badge--pending">{pendingDatasets.length}</span>
                )}
              </div>
            </div>
            <Link
              to="/admin/datasets"
              style={{
                fontSize: '0.8rem',
                color: '#2563eb',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <span>Xem tất cả</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {pendingDatasets.length === 0 ? (
            <div className="vivid-empty-box">
              <div
                className="vivid-empty-box__icon"
                style={{
                  background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                  color: '#15803d',
                  border: '1px solid #86efac',
                }}
              >
                <CheckCircle2 size={26} />
              </div>
              <h4 style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                Không có dataset chờ duyệt
              </h4>
            </div>
          ) : (
            <div className="mini-approval-list">
              {pendingDatasets.slice(0, 3).map((item) => (
                <div key={item.id} className="mini-approval-item">
                  <div className="mini-approval-info">
                    <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{item.dataset_name}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                      <code style={{ background: '#ffffff', color: '#b45309', padding: '0.12rem 0.45rem', borderRadius: '6px', border: '1px solid #fcd34d', fontWeight: 600 }}>
                        {item.version_tag}
                      </code>
                      <span>•</span>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{item.file_format}</span>
                      <span>•</span>
                      <span>{(item.total_records || 0).toLocaleString()} dòng</span>
                    </div>
                  </div>
                  <div className="mini-approval-actions">
                    <button
                      type="button"
                      className="btn-action btn-action--success"
                      style={{ padding: '0.42rem 0.8rem', fontSize: '0.75rem' }}
                      disabled={actionLoading === item.id}
                      onClick={() => handleQuickReview(item.id, 'APPROVED')}
                    >
                      Phê duyệt
                    </button>
                    <button
                      type="button"
                      className="btn-action btn-action--danger"
                      style={{ padding: '0.42rem 0.8rem', fontSize: '0.75rem' }}
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
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--blue">
                <ShieldCheck size={18} />
              </div>
              <h3 className="admin-card__title">Cơ cấu Vai trò</h3>
            </div>
            <span className="badge badge--active">
              {activeUsersCount}/{users.length} hoạt động
            </span>
          </div>

          <div className="role-breakdown-card">
            {/* Visual Multi-color Progress Bar */}
            <div className="role-stacked-bar-wrapper">
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
                  style={{ width: `${(roleBreakdown.admin / totalUsersCount) * 100}%`, background: '#e11d48' }}
                  title={`Administrator: ${roleBreakdown.admin}`}
                />
              </div>
            </div>

            {/* Vivid Role Stat Items */}
            <div className="role-stat-grid">
              <div className="role-stat-item role-stat-item--blue">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#2563eb' }} />
                    Data Engineer
                  </span>
                  <span className="role-stat-item__pct">
                    {Math.round((roleBreakdown.data_engineer / totalUsersCount) * 100)}%
                  </span>
                </div>
                <div className="role-stat-item__body">
                  <h4 className="role-stat-item__count">{roleBreakdown.data_engineer}</h4>
                </div>
              </div>

              <div className="role-stat-item role-stat-item--purple">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#9333ea' }} />
                    Data Scientist
                  </span>
                  <span className="role-stat-item__pct">
                    {Math.round((roleBreakdown.data_scientist / totalUsersCount) * 100)}%
                  </span>
                </div>
                <div className="role-stat-item__body">
                  <h4 className="role-stat-item__count">{roleBreakdown.data_scientist}</h4>
                </div>
              </div>

              <div className="role-stat-item role-stat-item--green">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#16a34a' }} />
                    Business User
                  </span>
                  <span className="role-stat-item__pct">
                    {Math.round((roleBreakdown.business_user / totalUsersCount) * 100)}%
                  </span>
                </div>
                <div className="role-stat-item__body">
                  <h4 className="role-stat-item__count">{roleBreakdown.business_user}</h4>
                </div>
              </div>

              <div className="role-stat-item role-stat-item--rose">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#e11d48' }} />
                    Administrator
                  </span>
                  <span className="role-stat-item__pct">
                    {Math.round((roleBreakdown.admin / totalUsersCount) * 100)}%
                  </span>
                </div>
                <div className="role-stat-item__body">
                  <h4 className="role-stat-item__count">{roleBreakdown.admin}</h4>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Trung tâm Giám sát Huấn luyện Mô hình AI/ML (ML Forecasting Experiments Monitor) */}
      <div className="admin-card">
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--purple">
              <FlaskConical size={18} />
            </div>
            <h3 className="admin-card__title">Thí nghiệm AI/ML</h3>
          </div>
        </div>

        {/* 4-Box KPI Ribbon */}
        <div className="exp-kpi-ribbon">
          <div className="exp-kpi-box exp-kpi-box--slate">
            <div className="admin-card__icon-box" style={{ background: '#e2e8f0', color: '#334155' }}>
              <Layers size={18} />
            </div>
            <div>
              <div className="exp-kpi-box__val">{expStats.total_experiments ?? 0}</div>
              <div className="exp-kpi-box__lbl">Tổng</div>
            </div>
          </div>

          <div className="exp-kpi-box exp-kpi-box--blue">
            <div className="admin-card__icon-box admin-card__icon-box--blue">
              <Activity size={18} />
            </div>
            <div>
              <div className="exp-kpi-box__val">{expStats.running_count ?? 0}</div>
              <div className="exp-kpi-box__lbl">Đang chạy</div>
            </div>
          </div>

          <div className="exp-kpi-box exp-kpi-box--green">
            <div className="admin-card__icon-box admin-card__icon-box--green">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <div className="exp-kpi-box__val">{expStats.completed_count ?? 0}</div>
              <div className="exp-kpi-box__lbl">Hoàn tất</div>
            </div>
          </div>

          <div className="exp-kpi-box exp-kpi-box--purple">
            <div className="admin-card__icon-box admin-card__icon-box--purple">
              <Award size={18} />
            </div>
            <div>
              <div className="exp-kpi-box__val" style={{ fontSize: '1rem' }}>
                {expStats.best_r2_score != null ? `R² ${expStats.best_r2_score}` : '—'}
              </div>
              <div className="exp-kpi-box__lbl">Tốt nhất</div>
            </div>
          </div>
        </div>

        {experimentsList.length === 0 ? (
          <div className="vivid-empty-box">
            <div
              className="vivid-empty-box__icon"
              style={{
                background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                color: '#7e22ce',
                border: '1px solid #d8b4fe',
              }}
            >
              <FlaskConical size={26} />
            </div>
            <h4 style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
              Chưa có thí nghiệm nào
            </h4>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
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

      {/* 5. Ma trận Cấp quyền Dữ liệu (Dataset Access Governance Matrix) */}
      <div className="admin-card" style={{ marginBottom: 0 }}>
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--green">
              <KeyRound size={18} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 className="admin-card__title">Phân quyền Dữ liệu</h3>
              <span className="badge badge--engineer">{accessGrants.length}</span>
            </div>
          </div>

          <button
            type="button"
            className="btn-action btn-action--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.95rem', fontSize: '0.8rem' }}
            onClick={() => setIsGrantModalOpen(true)}
          >
            <Plus size={15} />
            <span>Cấp quyền</span>
          </button>
        </div>

        {accessGrants.length === 0 ? (
          <div className="vivid-empty-box">
            <div
              className="vivid-empty-box__icon"
              style={{
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                color: '#1d4ed8',
                border: '1px solid #93c5fd',
              }}
            >
              <KeyRound size={26} />
            </div>
            <h4 style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
              Chưa có quyền nào được cấp
            </h4>
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
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{grant.dataset_name}</span>{' '}
                      <code style={{ background: '#f1f5f9', color: '#0f172a', padding: '0.12rem 0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem' }}>
                        {grant.version_tag}
                      </code>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{grant.granted_by_email || 'System'}</td>
                    <td>
                      {grant.expires_at ? (
                        <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: 600 }}>
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
                        style={{ padding: '0.38rem 0.75rem', fontSize: '0.75rem' }}
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
