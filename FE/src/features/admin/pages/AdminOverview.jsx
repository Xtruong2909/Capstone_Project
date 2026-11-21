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
  Layers,
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
  const [partialWarning, setPartialWarning] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [confirmRevokeId, setConfirmRevokeId] = useState(null)
  const [actionNotice, setActionNotice] = useState(null)

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
    setPartialWarning(null)
    try {
      const results = await Promise.allSettled([
        adminService.getStats(),
        apiClient.get('/health/db'),
        adminService.getUsers({ limit: 100 }),
        adminService.getDatasets({ limit: 50 }),
        adminService.getExperimentsOverview(),
        adminService.getAccessGrants({ limit: 50 }),
      ])

      const [statsRes, dbRes, usersRes, datasetsRes, expRes, grantsRes] = results
      const allCoreFailed = [statsRes, usersRes, datasetsRes, expRes, grantsRes].every(
        (r) => r.status === 'rejected'
      )

      if (allCoreFailed) {
        const firstErr = statsRes.reason || usersRes.reason
        const status = firstErr?.response?.status
        const detail = firstErr?.response?.data?.detail || firstErr?.message || ''
        setError(
          status === 401 || status === 403
            ? t('Session expired or insufficient Admin permissions. Please sign in again.')
            : `${t('Failed to load system overview statistics.')}${detail ? ` (${detail})` : ''}`
        )
        return
      }

      const usersData = usersRes.status === 'fulfilled' && Array.isArray(usersRes.value) ? usersRes.value : []
      const datasetsData =
        datasetsRes.status === 'fulfilled' && Array.isArray(datasetsRes.value) ? datasetsRes.value : []
      const expData =
        expRes.status === 'fulfilled' && expRes.value ? expRes.value : { stats: {}, experiments: [] }
      const grantsData =
        grantsRes.status === 'fulfilled' && Array.isArray(grantsRes.value) ? grantsRes.value : []
      const dbHealth =
        dbRes.status === 'fulfilled' && dbRes.value?.data ? dbRes.value.data : { status: 'disconnected' }

      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setStats(statsRes.value)
      } else {
        // Fallback stats computed from loaded endpoints if /admin/stats is unavailable
        const pendingCount = datasetsData.filter(
          (d) => d.approval_status === 'PENDING' || d.approval_status === 'SUBMITTED'
        ).length
        setStats({
          total_users: usersData.length,
          pending_approvals: pendingCount,
          total_datasets: datasetsData.length,
          total_audit_logs: 0,
        })
        const statsErr = statsRes.reason?.response?.data?.detail || statsRes.reason?.message
        setPartialWarning(
          `${t('Overview stats endpoint unavailable — showing fallback telemetry.')}${statsErr ? ` (${statsErr})` : ''}`
        )
      }

      setDbStatus(dbHealth)
      setUsers(usersData)
      setDatasets(datasetsData)
      setExperimentsData(expData)
      setAccessGrants(grantsData)
    } catch (err) {
      setError(`${t('Failed to load system overview statistics.')}${err?.message ? ` (${err.message})` : ''}`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (!isGrantModalOpen) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsGrantModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isGrantModalOpen])

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
      setActionNotice({ type: 'success', text: t('Dataset access permission granted.') })
    } catch (err) {
      setGrantError(err.response?.data?.detail || t('Failed to grant dataset access.'))
    } finally {
      setGrantSubmitting(false)
    }
  }

  const handleRevokeGrant = async (grantId) => {
    if (confirmRevokeId !== grantId) {
      setConfirmRevokeId(grantId)
      return
    }
    setActionLoading(grantId)
    setConfirmRevokeId(null)
    try {
      await adminService.revokeAccess(grantId)
      setAccessGrants((prev) => prev.filter((g) => g.id !== grantId))
      setActionNotice({ type: 'success', text: t('Access permission revoked.') })
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: err.response?.data?.detail || t('Failed to revoke access permission.'),
      })
    } finally {
      setActionLoading(null)
    }
  }

  if (isLoading) {
    return (
      <div className="adm-empty">
        <div className="adm-empty__icon adm-tone--blue">
          <RefreshCw size={24} className="animate-spin" />
        </div>
        <h4 className="adm-empty__title">{t('Loading system overview...')}</h4>
      </div>
    )
  }

  if (error) {
    return (
      <div className="adm-empty">
        <div className="adm-empty__icon adm-tone--rose">
          <AlertCircle size={24} />
        </div>
        <h4 className="adm-empty__title">{t(error)}</h4>
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          style={{ marginTop: '1rem' }}
          onClick={fetchData}
        >
          {t('Retry')}
        </button>
      </div>
    )
  }

  const totalUsersCount = users.length || 1
  const roleBreakdown = {
    data_engineer: users.filter((u) => u.role_id === 'data_engineer').length,
    data_scientist: users.filter((u) => u.role_id === 'data_scientist').length,
    business_user: users.filter((u) => u.role_id === 'business_user').length,
    admin: users.filter((u) => u.role_id === 'admin').length,
  }
  const activeUsersCount = users.filter((u) => u.is_active).length

  const pendingDatasets = datasets.filter(
    (d) => d.approval_status === 'PENDING' || d.approval_status === 'SUBMITTED'
  )
  const approvedDatasetsCount = datasets.filter((d) => d.approval_status === 'APPROVED').length

  const expStats = experimentsData.stats || {}
  const experimentsList = experimentsData.experiments || []

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

  return (
    <div className="adm-page">
      {(partialWarning || actionNotice) && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            borderRadius: '12px',
            fontSize: '0.82rem',
            fontWeight: 600,
            background:
              actionNotice?.type === 'success'
                ? '#ecfdf5'
                : actionNotice?.type === 'error'
                ? '#fff1f2'
                : '#fffbeb',
            color:
              actionNotice?.type === 'success'
                ? '#047857'
                : actionNotice?.type === 'error'
                ? '#be123c'
                : '#b45309',
            border:
              actionNotice?.type === 'success'
                ? '1px solid #a7f3d0'
                : actionNotice?.type === 'error'
                ? '1px solid #fecdd3'
                : '1px solid #fde68a',
          }}
        >
          <span>{actionNotice?.text || partialWarning}</span>
          <button
            type="button"
            className="adm-btn adm-btn--ghost adm-btn--sm"
            aria-label={t('Dismiss notice')}
            onClick={() => {
              setPartialWarning(null)
              setActionNotice(null)
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 1. Dark Command Hero Banner */}
      <section className="adm-command-hero">
        <div className="adm-command-hero__top">
          <div>
            <div className="adm-command-hero__eyebrow">
              <ShieldCheck size={13} />
              <span>{t('UAV Traffic Governance & Quality Gate')}</span>
            </div>
            <h2 className="adm-command-hero__title">{t('Administration Overview')}</h2>
            <p className="adm-command-hero__desc">
              {t('Monitor pNEUMA dataset approvals, RBAC identity health, and short-term traffic forecasting experiments.')}
            </p>
          </div>

          <div className="adm-command-hero__actions">
            <button
              type="button"
              className="adm-btn adm-btn--glass"
              onClick={fetchData}
              disabled={isLoading}
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
              <span>{t('Sync')}</span>
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => setIsGrantModalOpen(true)}
            >
              <Plus size={15} />
              <span>{t('Issue Access Grant')}</span>
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
                <div className="adm-ribbon-tile__val">{stats?.total_users ?? users.length}</div>
                <div className="adm-ribbon-tile__lbl">{t('Users')}</div>
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
                <div className="adm-ribbon-tile__val">{stats?.pending_approvals ?? pendingDatasets.length}</div>
                <div className="adm-ribbon-tile__lbl">{t('Pending Approvals')}</div>
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
                <div className="adm-ribbon-tile__val">{stats?.total_datasets ?? 0}</div>
                <div className="adm-ribbon-tile__lbl">{t('Datasets')}</div>
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
                <div className="adm-ribbon-tile__val">{stats?.total_audit_logs ?? 0}</div>
                <div className="adm-ribbon-tile__lbl">{t('Audit Logs')}</div>
              </div>
            </div>
            <ArrowRight size={16} style={{ color: '#d8b4fe' }} />
          </Link>
        </div>
      </section>

      {/* 2. Bento Row 1: Operational Health Gauges (8 cols) + RBAC Distribution (4 cols) */}
      <div className="adm-bento-grid">
        <div className="adm-panel adm-col-8">
          <div className="adm-panel__header">
            <div className="adm-panel__title-group">
              <div className="adm-panel__icon adm-tone--blue">
                <Activity size={18} />
              </div>
              <div>
                <h3 className="adm-panel__title">{t('Platform Health Telemetry')}</h3>
              </div>
            </div>
            <span className={`adm-badge ${dbStatus?.status === 'connected' ? 'adm-badge--emerald' : 'adm-badge--slate'}`}>
              {dbStatus?.status === 'connected' ? t('PostGIS Connected') : t('Local Mode')}
            </span>
          </div>

          <div className="adm-panel__body">
            <div className="adm-gauge-grid">
              <div className="adm-gauge-card">
                <div className="adm-gauge-card__top">
                  <span className="adm-gauge-card__lbl">{t('Active Accounts')}</span>
                  <div className="adm-panel__icon adm-tone--blue">
                    <Users size={16} />
                  </div>
                </div>
                <div className="adm-gauge-card__val">{activeUserRatePct}%</div>
                <div className="adm-gauge-card__meta">
                  {activeUsersCount} / {users.length} {t('verified')}
                </div>
              </div>

              <div className="adm-gauge-card">
                <div className="adm-gauge-card__top">
                  <span className="adm-gauge-card__lbl">{t('Approval Rate')}</span>
                  <div className="adm-panel__icon adm-tone--emerald">
                    <CheckCircle2 size={16} />
                  </div>
                </div>
                <div className="adm-gauge-card__val">{approvalRatePct}%</div>
                <div className="adm-gauge-card__meta">
                  {approvedDatasetsCount} / {datasets.length} {t('versions')}
                </div>
              </div>

              <div className="adm-gauge-card">
                <div className="adm-gauge-card__top">
                  <span className="adm-gauge-card__lbl">{t('Training Success')}</span>
                  <div className="adm-panel__icon adm-tone--purple">
                    <FlaskConical size={16} />
                  </div>
                </div>
                <div className="adm-gauge-card__val">{experimentSuccessRatePct}%</div>
                <div className="adm-gauge-card__meta">
                  {completedExpsCount} / {totalFinishedOrRunningExps} {t('runs')}
                </div>
              </div>

              <div className="adm-gauge-card">
                <div className="adm-gauge-card__top">
                  <span className="adm-gauge-card__lbl">{t('Valid Grants')}</span>
                  <div className="adm-panel__icon adm-tone--amber">
                    <KeyRound size={16} />
                  </div>
                </div>
                <div className="adm-gauge-card__val">{validGrantRatePct}%</div>
                <div className="adm-gauge-card__meta">
                  {validGrantsCount} / {accessGrants.length} {t('active')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RBAC Role Distribution (4 cols) */}
        <div className="adm-panel adm-col-4">
          <div className="adm-panel__header">
            <div className="adm-panel__title-group">
              <div className="adm-panel__icon adm-tone--purple">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 className="adm-panel__title">{t('Role Distribution')}</h3>
              </div>
            </div>
          </div>

          <div className="adm-panel__body">
            <div className="adm-rbac-stack">
              <div style={{ width: `${(roleBreakdown.data_engineer / totalUsersCount) * 100}%`, background: '#2563eb' }} />
              <div style={{ width: `${(roleBreakdown.data_scientist / totalUsersCount) * 100}%`, background: '#7c3aed' }} />
              <div style={{ width: `${(roleBreakdown.business_user / totalUsersCount) * 100}%`, background: '#059669' }} />
              <div style={{ width: `${(roleBreakdown.admin / totalUsersCount) * 100}%`, background: '#e11d48' }} />
            </div>

            <div className="adm-rbac-list">
              <div className="adm-rbac-row">
                <div className="adm-rbac-row__left">
                  <span className="adm-rbac-dot" style={{ background: '#2563eb' }} />
                  <span className="adm-rbac-row__name">{t('Data Engineer')}</span>
                </div>
                <div className="adm-rbac-row__right">
                  <span className="adm-rbac-row__count">{roleBreakdown.data_engineer}</span>
                  <span className="adm-rbac-row__pct">
                    {Math.round((roleBreakdown.data_engineer / totalUsersCount) * 100)}%
                  </span>
                </div>
              </div>

              <div className="adm-rbac-row">
                <div className="adm-rbac-row__left">
                  <span className="adm-rbac-dot" style={{ background: '#7c3aed' }} />
                  <span className="adm-rbac-row__name">{t('Data Scientist')}</span>
                </div>
                <div className="adm-rbac-row__right">
                  <span className="adm-rbac-row__count">{roleBreakdown.data_scientist}</span>
                  <span className="adm-rbac-row__pct">
                    {Math.round((roleBreakdown.data_scientist / totalUsersCount) * 100)}%
                  </span>
                </div>
              </div>

              <div className="adm-rbac-row">
                <div className="adm-rbac-row__left">
                  <span className="adm-rbac-dot" style={{ background: '#059669' }} />
                  <span className="adm-rbac-row__name">{t('Business User')}</span>
                </div>
                <div className="adm-rbac-row__right">
                  <span className="adm-rbac-row__count">{roleBreakdown.business_user}</span>
                  <span className="adm-rbac-row__pct">
                    {Math.round((roleBreakdown.business_user / totalUsersCount) * 100)}%
                  </span>
                </div>
              </div>

              <div className="adm-rbac-row">
                <div className="adm-rbac-row__left">
                  <span className="adm-rbac-dot" style={{ background: '#e11d48' }} />
                  <span className="adm-rbac-row__name">{t('Administrator')}</span>
                </div>
                <div className="adm-rbac-row__right">
                  <span className="adm-rbac-row__count">{roleBreakdown.admin}</span>
                  <span className="adm-rbac-row__pct">
                    {Math.round((roleBreakdown.admin / totalUsersCount) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bento Row 2: Quality Gate Queue (5 cols) + Granular Access Permissions (7 cols) */}
      <div className="adm-bento-grid">
        <div className="adm-panel adm-col-5">
          <div className="adm-panel__header">
            <div className="adm-panel__title-group">
              <div className="adm-panel__icon adm-tone--amber">
                <Clock size={18} />
              </div>
              <div>
                <h3 className="adm-panel__title">{t('Quality Gate Queue')}</h3>
              </div>
            </div>
            <Link to="/admin/datasets" className="adm-btn adm-btn--ghost adm-btn--sm">
              <span>{t('View All')}</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="adm-panel__body">
            {pendingDatasets.length === 0 ? (
              <div className="adm-empty">
                <div className="adm-empty__icon adm-tone--emerald">
                  <CheckCircle2 size={24} />
                </div>
                <h4 className="adm-empty__title">{t('No pending datasets')}</h4>
                <p className="adm-empty__desc">
                  {t('All submitted pNEUMA trajectory versions have been reviewed.')}
                </p>
              </div>
            ) : (
              <div className="adm-queue-list">
                {pendingDatasets.slice(0, 4).map((item) => (
                  <div key={item.id} className="adm-queue-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                        {item.dataset_name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                        <code style={{ background: '#fffbeb', color: '#b45309', padding: '0.1rem 0.4rem', borderRadius: '6px', border: '1px solid #fde68a', fontWeight: 700 }}>
                          {item.version_tag}
                        </code>
                        <span>•</span>
                        <span>{item.file_format}</span>
                        <span>•</span>
                        <span>{(item.total_records || 0).toLocaleString()} rows</span>
                      </div>
                    </div>
                    <Link to="/admin/datasets" className="adm-btn adm-btn--ghost adm-btn--sm">
                      {t('Inspect')}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Granular Access Permissions (7 cols) */}
        <div className="adm-panel adm-col-7">
          <div className="adm-panel__header">
            <div className="adm-panel__title-group">
              <div className="adm-panel__icon adm-tone--emerald">
                <KeyRound size={18} />
              </div>
              <div>
                <h3 className="adm-panel__title">{t('Dataset Access Permissions')}</h3>
              </div>
            </div>
            <button
              type="button"
              className="adm-btn adm-btn--primary adm-btn--sm"
              onClick={() => setIsGrantModalOpen(true)}
            >
              <Plus size={14} />
              <span>{t('Grant Access')}</span>
            </button>
          </div>

          <div className="adm-panel__body--flush">
            {accessGrants.length === 0 ? (
              <div className="adm-empty">
                <div className="adm-empty__icon adm-tone--blue">
                  <KeyRound size={24} />
                </div>
                <h4 className="adm-empty__title">{t('No access grants issued yet')}</h4>
                <p className="adm-empty__desc">
                  {t('Issue scoped dataset permissions to Data Scientists or Business Users.')}
                </p>
              </div>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>{t('Granted User')}</th>
                      <th>{t('Role')}</th>
                      <th>{t('Dataset & Version')}</th>
                      <th>{t('Expiration')}</th>
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
                          <span className={`adm-badge ${getRoleBadgeClass(grant.user_role)}`}>
                            {t(grant.user_role)}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{grant.dataset_name}</span>{' '}
                          <code style={{ background: '#f1f5f9', color: '#0f172a', padding: '0.12rem 0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem' }}>
                            {grant.version_tag}
                          </code>
                        </td>
                        <td>
                          {grant.expires_at ? (
                            <span className="adm-badge adm-badge--amber">
                              {new Date(grant.expires_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')}
                            </span>
                          ) : (
                            <span className="adm-badge adm-badge--emerald">{t('Unlimited')}</span>
                          )}
                        </td>
                        <td>
                          {confirmRevokeId === grant.id ? (
                            <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                              <button
                                type="button"
                                className="adm-btn adm-btn--danger adm-btn--sm"
                                disabled={actionLoading === grant.id}
                                onClick={() => handleRevokeGrant(grant.id)}
                              >
                                {t('Confirm')}
                              </button>
                              <button
                                type="button"
                                className="adm-btn adm-btn--ghost adm-btn--sm"
                                onClick={() => setConfirmRevokeId(null)}
                              >
                                {t('Cancel')}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="adm-btn adm-btn--danger adm-btn--sm"
                              disabled={actionLoading === grant.id}
                              onClick={() => handleRevokeGrant(grant.id)}
                            >
                              <Trash2 size={12} />
                              <span>{t('Revoke')}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              <h3 className="adm-panel__title">{t('Short-Term Traffic Flow Forecasting Audit')}</h3>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span className="adm-badge adm-badge--slate">
              <Layers size={12} />
              {t('Total')}: {expStats.total_experiments ?? 0}
            </span>
            <span className="adm-badge adm-badge--blue">
              {t('Running')}: {expStats.running_count ?? 0}
            </span>
            <span className="adm-badge adm-badge--emerald">
              {t('Completed')}: {expStats.completed_count ?? 0}
            </span>
            <span className="adm-badge adm-badge--rose">
              {t('Failed')}: {expStats.failed_count ?? 0}
            </span>
          </div>
        </div>

        <div className="adm-panel__body--flush">
          {experimentsList.length === 0 ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--purple">
                <FlaskConical size={24} />
              </div>
              <h4 className="adm-empty__title">{t('No experiments recorded yet')}</h4>
              <p className="adm-empty__desc">
                {t('Experiments trained by Data Scientists will automatically appear in this audit ledger.')}
              </p>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>{t('Experiment Name')}</th>
                    <th>{t('Model')}</th>
                    <th>{t('Target Variable')}</th>
                    <th>{t('Aggregation Window')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('Metrics (MAE / RMSE)')}</th>
                    <th>{t('Created Date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {experimentsList.map((exp) => (
                    <tr key={exp.id}>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{exp.experiment_name}</strong>
                      </td>
                      <td>
                        <span className="adm-badge adm-badge--purple">{exp.model_type}</span>
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#475569' }}>{exp.target_variable || 'flow'}</td>
                      <td style={{ fontSize: '0.82rem', color: '#475569' }}>{exp.aggregation_window || '5min'}</td>
                      <td>
                        <span
                          className={`adm-badge ${
                            exp.status === 'COMPLETED'
                              ? 'adm-badge--emerald'
                              : exp.status === 'FAILED'
                              ? 'adm-badge--rose'
                              : 'adm-badge--amber'
                          }`}
                        >
                          {exp.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>
                        {exp.metrics && (exp.metrics.mae !== undefined || exp.metrics.rmse !== undefined) ? (
                          <span>
                            MAE: {exp.metrics.mae ?? '—'} | RMSE: {exp.metrics.rmse ?? '—'}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {new Date(exp.created_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Grant Dataset Access Modal */}
      {isGrantModalOpen && (
        <div
          className="adm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="grant-access-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsGrantModalOpen(false)
          }}
        >
          <div className="adm-modal">
            <div className="adm-modal__header">
              <h3 id="grant-access-modal-title" className="adm-modal__title">
                {t('Grant Dataset Access')}
              </h3>
              <button
                type="button"
                className="adm-modal__close"
                aria-label={t('Close modal')}
                onClick={() => setIsGrantModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGrantSubmit}>
              <div className="adm-modal__body">
                {grantError && (
                  <div className="adm-badge adm-badge--rose" style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', marginBottom: '1rem' }}>
                    {t(grantError)}
                  </div>
                )}

                <div className="adm-field">
                  <label htmlFor="grant-user-select" className="adm-label">
                    {t('Select Recipient User')}
                  </label>
                  <select
                    id="grant-user-select"
                    required
                    value={grantForm.user_id}
                    onChange={(e) => setGrantForm({ ...grantForm, user_id: e.target.value })}
                    className="adm-select"
                  >
                    <option value="">{t('-- Select team member --')}</option>
                    {candidateUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.email}) - [{u.role_id}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="adm-field">
                  <label htmlFor="grant-dataset-select" className="adm-label">
                    {t('Select Dataset Version')}
                  </label>
                  <select
                    id="grant-dataset-select"
                    required
                    value={grantForm.dataset_version_id}
                    onChange={(e) => setGrantForm({ ...grantForm, dataset_version_id: e.target.value })}
                    className="adm-select"
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

                <div className="adm-field">
                  <label htmlFor="grant-expires-input" className="adm-label">
                    {t('Expiration Date (Leave blank for unlimited access)')}
                  </label>
                  <input
                    id="grant-expires-input"
                    type="date"
                    value={grantForm.expires_at}
                    onChange={(e) => setGrantForm({ ...grantForm, expires_at: e.target.value })}
                    className="adm-input"
                  />
                </div>
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
