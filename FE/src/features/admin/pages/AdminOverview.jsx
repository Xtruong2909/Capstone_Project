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
    } catch {
      setError('Failed to load system overview statistics.')
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
      setGrantError('Please select both a user and a dataset version.')
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
      setGrantError(err.response?.data?.detail || 'Failed to grant dataset access.')
    } finally {
      setGrantSubmitting(false)
    }
  }

  const handleRevokeGrant = async (grantId) => {
    if (!confirm('Are you sure you want to revoke this access permission?')) return
    setActionLoading(grantId)
    try {
      await adminService.revokeAccess(grantId)
      setAccessGrants((prev) => prev.filter((g) => g.id !== grantId))
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to revoke access permission.')
    } finally {
      setActionLoading(null)
    }
  }

  if (isLoading) {
    return (
      <div className="adm-panel">
        <div className="adm-empty">
          <div className="adm-empty__icon adm-tone--blue">
            <RefreshCw size={24} className="animate-spin" />
          </div>
          <h4 className="adm-empty__title">Synchronizing Governance Telemetry...</h4>
          <p className="adm-empty__desc">Fetching RBAC accounts, pNEUMA quality queues, and audit logs.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="adm-panel">
        <div className="adm-empty">
          <div className="adm-empty__icon adm-tone--rose">
            <AlertCircle size={24} />
          </div>
          <h4 className="adm-empty__title">Telemetry Connection Interrupted</h4>
          <p className="adm-empty__desc">{error}</p>
          <button type="button" className="adm-btn adm-btn--primary" onClick={fetchData}>
            <RefreshCw size={15} />
            <span>Retry Connection</span>
          </button>
        </div>
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
      {/* 1. Executive Dark Command Banner */}
      <section className="adm-command-hero">
        <div className="adm-command-hero__top">
          <div>
            <span className="adm-command-hero__eyebrow">
              <ShieldCheck size={14} />
              UAV Traffic Governance & Quality Gate
            </span>
            <h2 className="adm-command-hero__title">Platform Control & Compliance Center</h2>
            <p className="adm-command-hero__desc">
              Centralized oversight for role-based account provisioning, pNEUMA drone trajectory quality
              validation, version-scoped researcher permissions, and ML forecasting audits.
            </p>
          </div>

          <div className="adm-command-hero__actions">
            <div className="adm-telemetry-chip adm-telemetry-chip--online">
              <span className={`adm-telemetry-dot ${isOnline ? '' : 'adm-telemetry-dot--offline'}`} />
              <span>{isOnline ? 'PostGIS Online' : 'Database Offline'}</span>
            </div>

            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => setIsGrantModalOpen(true)}
            >
              <KeyRound size={15} />
              <span>Issue Access Grant</span>
            </button>

            <button type="button" className="adm-btn adm-btn--glass" onClick={fetchData}>
              <RefreshCw size={15} />
              <span>Sync</span>
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
                <div className="adm-ribbon-tile__lbl">Identity Accounts</div>
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
                <div className="adm-ribbon-tile__lbl">Awaiting Quality Gate</div>
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
                <div className="adm-ribbon-tile__val">{stats?.total_datasets ?? datasets.length}</div>
                <div className="adm-ribbon-tile__lbl">Cataloged Datasets</div>
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
                <div className="adm-ribbon-tile__lbl">Security Audit Events</div>
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
                <h3 className="adm-panel__title">Governance & Pipeline Health Indicators</h3>
                <p className="adm-panel__subtitle">Real-time operational compliance ratios across all subsystems</p>
              </div>
            </div>
          </div>

          <div className="adm-panel__body">
            <div className="adm-gauge-grid">
              <div className="adm-gauge-card">
                <div className="adm-gauge-card__top">
                  <div>
                    <div className="adm-gauge-card__val">{activeUserRatePct}%</div>
                    <div className="adm-gauge-card__lbl">Active RBAC Accounts</div>
                  </div>
                  <span className="adm-badge adm-badge--blue">
                    {activeUsersCount}/{users.length} Active
                  </span>
                </div>
                <div className="adm-progress-track">
                  <div
                    className="adm-progress-fill"
                    style={{ width: `${activeUserRatePct}%`, background: '#2563eb' }}
                  />
                </div>
              </div>

              <div className="adm-gauge-card">
                <div className="adm-gauge-card__top">
                  <div>
                    <div className="adm-gauge-card__val">{approvalRatePct}%</div>
                    <div className="adm-gauge-card__lbl">Quality Gate Pass Rate</div>
                  </div>
                  <span className="adm-badge adm-badge--emerald">
                    {approvedDatasetsCount}/{datasets.length} Approved
                  </span>
                </div>
                <div className="adm-progress-track">
                  <div
                    className="adm-progress-fill"
                    style={{ width: `${approvalRatePct}%`, background: '#10b981' }}
                  />
                </div>
              </div>

              <div className="adm-gauge-card">
                <div className="adm-gauge-card__top">
                  <div>
                    <div className="adm-gauge-card__val">{experimentSuccessRatePct}%</div>
                    <div className="adm-gauge-card__lbl">ML Forecasting Completion</div>
                  </div>
                  <span className="adm-badge adm-badge--purple">
                    {completedExpsCount}/{totalFinishedOrRunningExps} Runs
                  </span>
                </div>
                <div className="adm-progress-track">
                  <div
                    className="adm-progress-fill"
                    style={{ width: `${experimentSuccessRatePct}%`, background: '#7c3aed' }}
                  />
                </div>
              </div>

              <div className="adm-gauge-card">
                <div className="adm-gauge-card__top">
                  <div>
                    <div className="adm-gauge-card__val">{validGrantRatePct}%</div>
                    <div className="adm-gauge-card__lbl">Valid Dataset Grants</div>
                  </div>
                  <span className="adm-badge adm-badge--amber">
                    {validGrantsCount}/{accessGrants.length} Valid
                  </span>
                </div>
                <div className="adm-progress-track">
                  <div
                    className="adm-progress-fill"
                    style={{ width: `${validGrantRatePct}%`, background: '#d97706' }}
                  />
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
                <Users size={18} />
              </div>
              <div>
                <h3 className="adm-panel__title">RBAC Distribution</h3>
                <p className="adm-panel__subtitle">4 Platform Actor Roles</p>
              </div>
            </div>
            <Link to="/admin/users" className="adm-btn adm-btn--ghost adm-btn--sm">
              <span>Manage</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="adm-panel__body">
            <div className="adm-rbac-stack">
              <div
                style={{
                  width: `${(roleBreakdown.data_engineer / totalUsersCount) * 100}%`,
                  background: '#2563eb',
                }}
              />
              <div
                style={{
                  width: `${(roleBreakdown.data_scientist / totalUsersCount) * 100}%`,
                  background: '#7c3aed',
                }}
              />
              <div
                style={{
                  width: `${(roleBreakdown.business_user / totalUsersCount) * 100}%`,
                  background: '#059669',
                }}
              />
              <div
                style={{
                  width: `${(roleBreakdown.admin / totalUsersCount) * 100}%`,
                  background: '#e11d48',
                }}
              />
            </div>

            <div className="adm-rbac-list">
              <div className="adm-rbac-row">
                <div className="adm-rbac-row__left">
                  <span className="adm-rbac-dot" style={{ background: '#2563eb' }} />
                  <span className="adm-rbac-row__name">Data Engineer</span>
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
                  <span className="adm-rbac-row__name">Data Scientist</span>
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
                  <span className="adm-rbac-row__name">Business User</span>
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
                  <span className="adm-rbac-row__name">Administrator</span>
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
            <Link to="/admin/datasets" className="adm-btn adm-btn--ghost adm-btn--sm">
              <span>Inspect All</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="adm-panel__body">
            {pendingDatasets.length === 0 ? (
              <div className="adm-empty" style={{ padding: '2rem 1rem' }}>
                <div className="adm-empty__icon adm-tone--emerald">
                  <CheckCircle2 size={24} />
                </div>
                <h4 className="adm-empty__title">Quality Gate Clear</h4>
                <p className="adm-empty__desc">
                  All submitted UAV trajectory datasets have been inspected.
                </p>
              </div>
            ) : (
              <div className="adm-queue-list">
                {pendingDatasets.slice(0, 4).map((item) => (
                  <div key={item.id} className="adm-queue-item">
                    <div>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>
                        {item.dataset_name}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginTop: '0.3rem',
                          fontSize: '0.75rem',
                          color: '#64748b',
                        }}
                      >
                        <span className="adm-code-tag">{item.version_tag}</span>
                        <span>•</span>
                        <strong>{item.file_format}</strong>
                        <span>•</span>
                        <span>{(item.total_records || 0).toLocaleString()} rows</span>
                      </div>
                    </div>
                    <Link to="/admin/datasets" className="adm-btn adm-btn--primary adm-btn--sm">
                      <span>Review</span>
                      <ArrowRight size={12} />
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
                <h3 className="adm-panel__title">Dataset Access Permissions</h3>
                <p className="adm-panel__subtitle">
                  {accessGrants.length} active version-specific permission grant(s)
                </p>
              </div>
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

          <div className="adm-panel__body--flush">
            {accessGrants.length === 0 ? (
              <div className="adm-empty" style={{ padding: '2rem 1rem' }}>
                <div className="adm-empty__icon adm-tone--blue">
                  <KeyRound size={24} />
                </div>
                <h4 className="adm-empty__title">No Access Grants Issued</h4>
                <p className="adm-empty__desc">
                  Grant version-scoped dataset access to Data Scientists or Business Users.
                </p>
              </div>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Recipient</th>
                      <th>Role</th>
                      <th>Dataset & Version</th>
                      <th>Expires</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessGrants.slice(0, 5).map((grant) => (
                      <tr key={grant.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{grant.user_name}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{grant.user_email}</div>
                        </td>
                        <td>
                          <span className={`adm-badge ${getRoleBadgeClass(grant.user_role)}`}>
                            {grant.user_role}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>
                            {grant.dataset_name}
                          </span>{' '}
                          <span className="adm-code-tag">{grant.version_tag}</span>
                        </td>
                        <td>
                          {grant.expires_at ? (
                            <span className="adm-badge adm-badge--amber">
                              {new Date(grant.expires_at).toLocaleDateString('en-US')}
                            </span>
                          ) : (
                            <span className="adm-badge adm-badge--emerald">Unlimited</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="adm-btn adm-btn--danger adm-btn--sm"
                            disabled={actionLoading === grant.id}
                            onClick={() => handleRevokeGrant(grant.id)}
                          >
                            <Trash2 size={13} />
                            <span>Revoke</span>
                          </button>
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
              <h3 className="adm-panel__title">Short-Term Traffic Flow Forecasting Audit</h3>
              <p className="adm-panel__subtitle">
                Tracking Random Forest, Persistence, and Historical Average experiments across 1-min & 5-min intervals
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span className="adm-badge adm-badge--slate">
              Total: {expStats.total_experiments ?? 0}
            </span>
            <span className="adm-badge adm-badge--blue">
              Running: {expStats.running_count ?? 0}
            </span>
            <span className="adm-badge adm-badge--emerald">
              Completed: {expStats.completed_count ?? 0}
            </span>
            <span className="adm-badge adm-badge--rose">
              <AlertCircle size={12} />
              <span>Failed: {expStats.failed_count ?? 0}</span>
            </span>
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
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Experiment & Dataset</th>
                    <th>Model Architecture</th>
                    <th>Target Variable</th>
                    <th>Horizon</th>
                    <th>Status</th>
                    <th>Researcher</th>
                    <th>Evaluation Metrics</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {experimentsList.map((exp) => (
                    <tr key={exp.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{exp.name}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                          {exp.dataset_name} ({exp.dataset_version_tag})
                        </div>
                      </td>
                      <td>
                        <span className="adm-badge adm-badge--purple">{exp.model_type}</span>
                      </td>
                      <td>
                        <span className="adm-code-tag">{exp.target_variable}</span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{exp.temporal_aggregation_sec / 60} min</td>
                      <td>
                        <span
                          className={`adm-badge ${
                            exp.status === 'COMPLETED'
                              ? 'adm-badge--emerald'
                              : exp.status === 'RUNNING'
                              ? 'adm-badge--amber'
                              : 'adm-badge--rose'
                          }`}
                        >
                          {exp.status}
                        </span>
                      </td>
                      <td>{exp.creator_name || '—'}</td>
                      <td>
                        {exp.metrics ? (
                          <span className="adm-code-tag">
                            MAE: {exp.metrics.mae} | RMSE: {exp.metrics.rmse}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Pending</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {new Date(exp.created_at).toLocaleDateString('en-US')}
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsGrantModalOpen(false)
          }}
        >
          <div className="adm-modal">
            <div className="adm-modal__header">
              <h3 className="adm-modal__title">Issue Version-Scoped Dataset Grant</h3>
              <button
                type="button"
                className="adm-modal__close"
                onClick={() => setIsGrantModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGrantSubmit}>
              <div className="adm-modal__body">
                {grantError && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      background: '#fff1f2',
                      border: '1px solid #fecdd3',
                      borderRadius: '10px',
                      color: '#be123c',
                      fontSize: '0.84rem',
                      marginBottom: '1rem',
                      fontWeight: 600,
                    }}
                  >
                    {grantError}
                  </div>
                )}

                <div className="adm-field">
                  <label className="adm-label">Recipient Team Member</label>
                  <select
                    required
                    value={grantForm.user_id}
                    onChange={(e) => setGrantForm({ ...grantForm, user_id: e.target.value })}
                    className="adm-select"
                  >
                    <option value="">-- Select researcher or analyst --</option>
                    {candidateUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.email}) — [{u.role_id}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="adm-field">
                  <label className="adm-label">Target Dataset Version</label>
                  <select
                    required
                    value={grantForm.dataset_version_id}
                    onChange={(e) =>
                      setGrantForm({ ...grantForm, dataset_version_id: e.target.value })
                    }
                    className="adm-select"
                  >
                    <option value="">-- Select dataset version --</option>
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.dataset_name} ({d.version_tag}) — [{d.approval_status}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="adm-field" style={{ marginBottom: 0 }}>
                  <label className="adm-label">
                    Access Expiration Date (Leave blank for permanent access)
                  </label>
                  <input
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={grantSubmitting}
                  className="adm-btn adm-btn--primary"
                >
                  <KeyRound size={15} />
                  <span>{grantSubmitting ? 'Issuing Grant...' : 'Confirm Access Grant'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
