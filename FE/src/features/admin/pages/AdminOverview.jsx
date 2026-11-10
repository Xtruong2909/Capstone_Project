import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
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
  Activity,
  ScrollText,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import apiClient from '../../../services/apiClient'
import { useLanguage } from '../../../hooks/useLanguage'

export default function AdminOverview() {
  const { t, language } = useLanguage()
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
      setError(t('Failed to load system overview statistics.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleGrantSubmit = async (e) => {
    e.preventDefault()
    if (!grantForm.user_id || !grantForm.dataset_version_id) {
      setGrantError(t('Please select both a user and a dataset version.'))
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
      setGrantError(err.response?.data?.detail || t('Failed to grant dataset access.'))
    } finally {
      setGrantSubmitting(false)
    }
  }

  const handleRevokeGrant = async (grantId) => {
    if (!confirm(t('Are you sure you want to revoke this access permission?'))) return
    setActionLoading(grantId)
    try {
      await adminService.revokeAccess(grantId)
      setAccessGrants((prev) => prev.filter((g) => g.id !== grantId))
    } catch (err) {
      alert(err.response?.data?.detail || t('Failed to revoke access permission.'))
    } finally {
      setActionLoading(null)
    }
  }

  if (isLoading) {
    return (
      <div className="empty-state">
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem', color: '#2563eb' }} />
        <p>{t('Loading system overview...')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty-state">
        <AlertCircle size={28} style={{ margin: '0 auto 1rem', color: '#dc2626' }} />
        <p>{t(error)}</p>
        <button
          type="button"
          className="btn-action btn-action--primary"
          style={{ marginTop: '1rem' }}
          onClick={fetchData}
        >
          {t('Retry')}
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
  const pendingDatasets = datasets.filter(
    (d) => d.approval_status === 'PENDING' || d.approval_status === 'SUBMITTED'
  )
  const approvedDatasetsCount = datasets.filter((d) => d.approval_status === 'APPROVED').length

  // Get experiment stats
  const expStats = experimentsData.stats || {}
  const experimentsList = experimentsData.experiments || []

  // Operational Health Rates
  const activeUserRatePct = users.length > 0 ? Math.round((activeUsersCount / users.length) * 100) : 100
  const approvalRatePct = datasets.length > 0 ? Math.round((approvedDatasetsCount / datasets.length) * 100) : 100
  const totalFinishedOrRunningExps = expStats.total_experiments || experimentsList.length
  const completedExpsCount =
    expStats.completed_count ?? experimentsList.filter((e) => e.status === 'COMPLETED').length
  const experimentSuccessRatePct =
    totalFinishedOrRunningExps > 0 ? Math.round((completedExpsCount / totalFinishedOrRunningExps) * 100) : 100
  const nowTimestamp = Date.now()
  const validGrantsCount = accessGrants.filter(
    (g) => !g.expires_at || new Date(g.expires_at).getTime() > nowTimestamp
  ).length
  const validGrantRatePct =
    accessGrants.length > 0 ? Math.round((validGrantsCount / accessGrants.length) * 100) : 100

  const candidateUsers = users.filter((u) => u.role_id !== 'admin')

  const getRoleBadgeClass = (roleId) => {
    switch (roleId) {
      case 'data_engineer':
        return 'adm-badge--blue'
      case 'data_scientist':
        return 'adm-badge--purple'
      case 'business_user':
        return 'adm-badge--emerald'
      default:
        return 'adm-badge--slate'
    }
  }

  const isOnline = dbStatus?.status === 'connected'

  return (
    <div>
      {/* 1. Hero Banner */}
      <div className="admin-hero-banner">
        <div className="admin-hero-banner__top">
          <div className="admin-hero-banner__content">
            <h2 className="admin-hero-banner__title">{t('Administration Overview')}</h2>
          </div>

          <div className="admin-hero-banner__actions">
            <div className={`status-pill-live ${isOnline ? 'status-pill-live--online' : 'status-pill-live--offline'}`}>
              <span className={`status-pulse-dot ${isOnline ? 'status-pulse-dot--online' : 'status-pulse-dot--offline'}`} />
              <span>{t(isOnline ? 'Database Online' : 'Database Offline')}</span>
            </div>

            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => setIsGrantModalOpen(true)}
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
              <span>{t('Refresh')}</span>
            </button>
          </div>
        </div>

        {/* 4-Column Glass Navigation Ribbon */}
        <div className="adm-command-ribbon">
          <Link to="/admin/users" className="adm-ribbon-tile">
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon" style={{ background: 'rgba(59, 130, 246, 0.25)', color: '#93c5fd' }}>
                <Users size={20} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{stats?.total_users ?? users.length}</div>
                <div className="hero-quick-tile__label">{t('Users')}</div>
              </div>
            </div>
            <ArrowRight size={16} style={{ color: '#93c5fd' }} />
          </Link>

          <Link to="/admin/datasets" className="adm-ribbon-tile">
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon" style={{ background: 'rgba(245, 158, 11, 0.25)', color: '#fcd34d' }}>
                <Clock size={20} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{stats?.pending_approvals ?? pendingDatasets.length}</div>
                <div className="hero-quick-tile__label">{t('Pending Approvals')}</div>
              </div>
            </div>
            <ArrowRight size={16} style={{ color: '#fcd34d' }} />
          </Link>

          <Link to="/admin/datasets-available" className="adm-ribbon-tile">
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon" style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#6ee7b7' }}>
                <Database size={20} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{stats?.total_datasets ?? 0}</div>
                <div className="hero-quick-tile__label">{t('Datasets')}</div>
              </div>
            </div>
            <ArrowRight size={16} style={{ color: '#6ee7b7' }} />
          </Link>

          <Link to="/admin/audit-logs" className="adm-ribbon-tile">
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon" style={{ background: 'rgba(168, 85, 247, 0.25)', color: '#d8b4fe' }}>
                <ScrollText size={20} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{stats?.total_audit_logs ?? 0}</div>
                <div className="hero-quick-tile__label">{t('Audit Logs')}</div>
              </div>
            </div>
            <ArrowRight size={16} style={{ color: '#d8b4fe' }} />
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
              <p>{t('Active Accounts')}</p>
            </div>
            <div className="stat-card__icon stat-card__icon--blue">
              <Activity size={22} />
            </div>
          </div>

        <div className="stat-card stat-card--green">
          <CheckCircle2 size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <h3>{approvalRatePct}%</h3>
              <p>{t('Approval Rate')}</p>
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
              <p>{t('Training Success Rate')}</p>
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
              <p>{t('Valid Access Grants')}</p>
            </div>
            <div className="stat-card__icon stat-card__icon--amber">
              <KeyRound size={22} />
            </div>
          </div>
        </div>

        {/* RBAC Role Distribution (4 cols) */}
        <div className="adm-panel adm-col-4">
          <div className="adm-panel__header">
            <div className="adm-panel__title-group">
              <div className="adm-panel__icon adm-tone--purple">
                <Users size={18} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 className="admin-card__title">{t('Pending Approvals')}</h3>
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
              <span>{t('View All')}</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="adm-panel__body">
            <div className="adm-rbac-stack">
              <div
                style={{
                  width: `${(roleBreakdown.data_engineer / totalUsersCount) * 100}%`,
                  background: '#2563eb',
                }}
              >
                <CheckCircle2 size={26} />
              </div>
              <h4 style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                {t('No pending datasets')}
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
                      <span>{(item.total_records || 0).toLocaleString()} rows</span>
                    </div>
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
              <h3 className="admin-card__title">{t('Role Distribution')}</h3>
            </div>
            <span className="badge badge--active">
              {activeUsersCount}/{users.length} {t('Active')}
            </span>
          </div>

          <div className="role-breakdown-card">
            {/* Visual Multi-color Progress Bar */}
            <div className="role-stacked-bar-wrapper">
              <div className="role-stacked-bar">
                <div
                  className="role-stacked-segment"
                  style={{ width: `${(roleBreakdown.data_engineer / totalUsersCount) * 100}%`, background: '#2563eb' }}
                  title={`${t('Data Engineer')}: ${roleBreakdown.data_engineer}`}
                />
                <div
                  className="role-stacked-segment"
                  style={{ width: `${(roleBreakdown.data_scientist / totalUsersCount) * 100}%`, background: '#9333ea' }}
                  title={`${t('Data Scientist')}: ${roleBreakdown.data_scientist}`}
                />
                <div
                  className="role-stacked-segment"
                  style={{ width: `${(roleBreakdown.business_user / totalUsersCount) * 100}%`, background: '#16a34a' }}
                  title={`${t('Business User')}: ${roleBreakdown.business_user}`}
                />
                <div
                  className="role-stacked-segment"
                  style={{ width: `${(roleBreakdown.admin / totalUsersCount) * 100}%`, background: '#e11d48' }}
                  title={`${t('Administrator')}: ${roleBreakdown.admin}`}
                />
              </div>
            </div>

            {/* Vivid Role Stat Items */}
            <div className="role-stat-grid">
              <div className="role-stat-item role-stat-item--blue">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#2563eb' }} />
                    {t('Data Engineer')}
                  </span>
                  <span className="role-stat-item__pct">
                    {Math.round((roleBreakdown.data_engineer / totalUsersCount) * 100)}%
                  </span>
                </div>
              </div>

              <div className="role-stat-item role-stat-item--purple">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#9333ea' }} />
                    {t('Data Scientist')}
                  </span>
                  <span className="role-stat-item__pct">
                    {Math.round((roleBreakdown.data_scientist / totalUsersCount) * 100)}%
                  </span>
                </div>
              </div>

              <div className="role-stat-item role-stat-item--green">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#16a34a' }} />
                    {t('Business User')}
                  </span>
                  <span className="role-stat-item__pct">
                    {Math.round((roleBreakdown.business_user / totalUsersCount) * 100)}%
                  </span>
                </div>
              </div>

              <div className="role-stat-item role-stat-item--rose">
                <div className="role-stat-item__header">
                  <span className="role-stat-item__name">
                    <span className="role-stat-item__dot" style={{ background: '#e11d48' }} />
                    {t('Administrator')}
                  </span>
                  <span className="role-stat-item__pct">
                    {Math.round((roleBreakdown.admin / totalUsersCount) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bento Row 2: Pending Quality Gate Queue (5 cols) + Granular Access Permissions (7 cols) */}
      <div className="adm-bento-grid">
        <div className="adm-panel adm-col-5">
          <div className="adm-panel__header">
            <div className="adm-panel__title-group">
              <div className="adm-panel__icon adm-tone--amber">
                <Clock size={18} />
              </div>
              <div>
                <h3 className="adm-panel__title">Quality Gate Queue</h3>
                <p className="adm-panel__subtitle">
                  {pendingDatasets.length} version(s) awaiting inspection
                </p>
              </div>
            </div>
            <h3 className="admin-card__title">{t('AI/ML Experiments')}</h3>
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
              <div className="exp-kpi-box__lbl">{t('Total')}</div>
            </div>
            <button
              type="button"
              className="adm-btn adm-btn--primary adm-btn--sm"
              onClick={() => setIsGrantModalOpen(true)}
            >
              <Plus size={14} />
              <span>Grant Access</span>
            </button>
          </div>

          <div className="exp-kpi-box exp-kpi-box--blue">
            <div className="admin-card__icon-box admin-card__icon-box--blue">
              <Activity size={18} />
            </div>
            <div>
              <div className="exp-kpi-box__val">{expStats.running_count ?? 0}</div>
              <div className="exp-kpi-box__lbl">{t('Running')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Full-Width Row: AI/ML Forecasting Experiments Monitor */}
      <div className="adm-panel">
        <div className="adm-panel__header">
          <div className="adm-panel__title-group">
            <div className="adm-panel__icon adm-tone--purple">
              <FlaskConical size={18} />
            </div>
            <div>
              <div className="exp-kpi-box__val">{expStats.completed_count ?? 0}</div>
              <div className="exp-kpi-box__lbl">{t('Completed')}</div>
            </div>
          </div>

          <div className="exp-kpi-box exp-kpi-box--purple">
            <div className="admin-card__icon-box admin-card__icon-box--purple">
              <AlertCircle size={18} />
            </div>
            <div>
              <div className="exp-kpi-box__val" style={{ fontSize: '1rem' }}>
                {expStats.failed_count ?? 0}
              </div>
              <div className="exp-kpi-box__lbl">{t('Failed')}</div>
            </div>
          </div>
        </div>

        <div className="adm-panel__body--flush">
          {experimentsList.length === 0 ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--purple">
                <FlaskConical size={24} />
              </div>
              <h4 className="adm-empty__title">No Forecasting Experiments Logged</h4>
              <p className="adm-empty__desc">
                Experiments trained by Data Scientists will automatically appear in this audit ledger.
              </p>
            </div>
            <h4 style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
              {t('No experiments recorded yet')}
            </h4>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('Experiment Name')}</th>
                  <th>{t('Model')}</th>
                  <th>{t('Target Variable')}</th>
                  <th>{t('Aggregation Window')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Created By')}</th>
                  <th>{t('Evaluation Metrics')}</th>
                  <th>{t('Date')}</th>
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
                    <td>{exp.temporal_aggregation_sec / 60} min</td>
                    <td>
                      <span className={`badge ${
                        exp.status === 'COMPLETED' ? 'badge--active' :
                        exp.status === 'RUNNING' ? 'badge--pending' : 'badge--rejected'
                      }`}>
                        {t(exp.status === 'COMPLETED' ? 'Completed' :
                         exp.status === 'RUNNING' ? 'Running' : exp.status)}
                      </span>
                    </td>
                    <td>{exp.creator_name || '—'}</td>
                    <td>
                      {exp.metrics ? (
                        <div style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          <span>MAE: <strong>{exp.metrics.mae}</strong></span> | <span>RMSE: {exp.metrics.rmse}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{t('No metrics')}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {new Date(exp.created_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Dataset Access Governance Matrix */}
      <div className="admin-card" style={{ marginBottom: 0 }}>
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--green">
              <KeyRound size={18} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 className="admin-card__title">{t('Dataset Access Permissions')}</h3>
              <span className="badge badge--engineer">{accessGrants.length}</span>
            </div>
          )}
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
              {t('No access grants issued yet')}
            </h4>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('Granted User')}</th>
                  <th>{t('Role')}</th>
                  <th>{t('Dataset & Version')}</th>
                  <th>{t('Granted By')}</th>
                  <th>{t('Expiration')}</th>
                  <th>{t('Granted Date')}</th>
                  <th>{t('Action')}</th>
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
                        {t(grant.user_role)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{grant.dataset_name}</span>{' '}
                      <code style={{ background: '#f1f5f9', color: '#0f172a', padding: '0.12rem 0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem' }}>
                        {grant.version_tag}
                      </code>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{grant.granted_by_email || t('System')}</td>
                    <td>
                      {grant.expires_at ? (
                        <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: 600 }}>
                          {new Date(grant.expires_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')}
                        </span>
                      ) : (
                        <span className="badge badge--active">{t('Unlimited')}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(grant.created_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')}
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
                        {t('Revoke')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grant Dataset Access Modal */}
      {isGrantModalOpen && (
        <div
          className="adm-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsGrantModalOpen(false)
          }}
        >
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>{t('Grant Dataset Access')}</h3>
              <button
                type="button"
                className="adm-modal__close"
                onClick={() => setIsGrantModalOpen(false)}
              >
                <X size={18} />
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
                  {t(grantError)}
                </div>
              )}

              <div className="form-field">
                <label className="form-label">{t('Select Recipient User')}</label>
                <select
                  required
                  value={grantForm.user_id}
                  onChange={(e) => setGrantForm({ ...grantForm, user_id: e.target.value })}
                  className="admin-select"
                  style={{ width: '100%' }}
                >
                  <option value="">{t('-- Select team member --')}</option>
                  {candidateUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email}) - [{u.role_id}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">{t('Select Dataset Version')}</label>
                <select
                  required
                  value={grantForm.dataset_version_id}
                  onChange={(e) => setGrantForm({ ...grantForm, dataset_version_id: e.target.value })}
                  className="admin-select"
                  style={{ width: '100%' }}
                >
                  <option value="">{t('-- Select dataset version --')}</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.dataset_name} ({d.version_tag}) - [{d.approval_status}]
                    </option>
                  ))}
                </select>
                {datasets.length === 0 && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#d97706' }}>
                    {t('* No dataset versions have been created in the system yet.')}
                  </p>
                )}
              </div>

              <div className="form-field" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">{t('Expiration Date (Leave blank for unlimited access)')}</label>
                <input
                  type="date"
                  value={grantForm.expires_at}
                  onChange={(e) => setGrantForm({ ...grantForm, expires_at: e.target.value })}
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div className="adm-modal__footer">
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost"
                  onClick={() => setIsGrantModalOpen(false)}
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={grantSubmitting}
                  className="adm-btn adm-btn--primary"
                >
                  {t(grantSubmitting ? 'Granting...' : 'Confirm Grant')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
