import { useState } from 'react'
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
  X,
  Activity,
  ScrollText,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useAdminResource } from '../../../hooks/useAdminData'
import AdminPageSkeleton from '../components/AdminPageSkeleton'
import AdminAccessGrantsTable from '../components/AdminAccessGrantsTable'
import AdminExperimentsTable from '../components/AdminExperimentsTable'
import AdminBatchGrantPickerDialog from '../components/AdminBatchGrantPickerDialog'
import { useLanguage } from '../../../hooks/useLanguage'

export default function AdminOverview() {
  const { t } = useLanguage()
  const overview = useAdminResource(adminService.getOverviewData)
  const { stats = null, dbStatus = null, users = [], datasets = [], reviewGroups = [], reviewGroupsError = false, experimentsData = { stats: {}, experiments: [] }, accessGrants = [] } = overview.data || {}
  const isLoading = overview.loading
  const error = overview.error
  const fetchData = overview.reload
  const [warningHidden, setWarningHidden] = useState(false)
  const partialWarning = warningHidden ? null : overview.error || overview.data?.partialWarning
  const [actionNotice, setActionNotice] = useState(null)

  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false)

  if (isLoading) return <AdminPageSkeleton />

  if (error && !overview.data) {
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

  const pendingCount = reviewGroups.reduce((sum, group) => sum + group.submitted_datasets, 0)
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
              setWarningHidden(true)
              setActionNotice(null)
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 1. Overview banner */}
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

        {/* 4-column quick navigation */}
        <div className="adm-command-ribbon">
          <Link to="/admin/users" className="adm-ribbon-tile">
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                <Users size={20} />
              </div>
              <div>
                <div className="adm-ribbon-tile__val">{stats?.total_users ?? users.length}</div>
                <div className="adm-ribbon-tile__lbl">{t('Users')}</div>
              </div>
            </div>
            <ArrowRight size={16} style={{ color: '#2563eb' }} />
          </Link>

          <Link to="/admin/datasets" className="adm-ribbon-tile">
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon" style={{ background: '#fffbeb', color: '#b45309' }}>
                <Clock size={20} />
              </div>
              <div>
                <div className="adm-ribbon-tile__val">{stats?.pending_approvals ?? pendingCount}</div>
                <div className="adm-ribbon-tile__lbl">{t('Pending Approvals')}</div>
              </div>
            </div>
            <ArrowRight size={16} style={{ color: '#b45309' }} />
          </Link>

          <Link to="/admin/datasets-available" className="adm-ribbon-tile">
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon" style={{ background: '#ecfdf5', color: '#059669' }}>
                <Database size={20} />
              </div>
              <div>
                <div className="adm-ribbon-tile__val">{stats?.total_datasets ?? 0}</div>
                <div className="adm-ribbon-tile__lbl">{t('Datasets')}</div>
              </div>
            </div>
            <ArrowRight size={16} style={{ color: '#059669' }} />
          </Link>

          <Link to="/admin/audit-logs" className="adm-ribbon-tile">
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon" style={{ background: '#faf5ff', color: '#9333ea' }}>
                <ScrollText size={20} />
              </div>
              <div>
                <div className="adm-ribbon-tile__val">{stats?.total_audit_logs ?? 0}</div>
                <div className="adm-ribbon-tile__lbl">{t('Audit Logs')}</div>
              </div>
            </div>
            <ArrowRight size={16} style={{ color: '#9333ea' }} />
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
                  {approvedDatasetsCount} / {datasets.length} {t('dataset_files')}
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

      {/* 3. Pending datasets and access permissions, each on a separate full-width row */}
      <div className="adm-bento-grid">
        <div className="adm-panel adm-col-12">
          <div className="adm-panel__header">
            <div className="adm-panel__title-group">
              <div className="adm-panel__icon adm-tone--amber">
                <Clock size={18} />
              </div>
              <div>
                <h3 className="adm-panel__title">Batch chờ phê duyệt</h3>
              </div>
            </div>
            <Link to="/admin/datasets" className="adm-btn adm-btn--ghost adm-btn--sm">
              <span>{t('View All')}</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="adm-panel__body">
            {reviewGroupsError ? <p className="admin-notice admin-notice--error" role="alert">Không tải được danh sách batch chờ duyệt. Vui lòng làm mới.</p> : reviewGroups.length === 0 ? (
              <div className="adm-empty">
                <div className="adm-empty__icon adm-tone--emerald">
                  <CheckCircle2 size={24} />
                </div>
                <h4 className="adm-empty__title">Không có batch chờ phê duyệt</h4>
                <p className="adm-empty__desc">
                  Các batch đã gửi xét duyệt sẽ xuất hiện tại đây.
                </p>
              </div>
            ) : (
              <div className="adm-queue-list">
                {reviewGroups.slice(0, 4).map((item) => (
                  <div key={item.group_id} className="adm-queue-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                        {item.group_name || 'Batch chưa đặt tên'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                        <span>{item.drone_id}</span>
                        <span>•</span>
                        <span>{item.submitted_datasets} tập dữ liệu chờ duyệt / {item.total_datasets} tập dữ liệu</span>
                      </div>
                    </div>
                    <Link to={`/admin/datasets?groupId=${encodeURIComponent(item.group_id)}`} className="adm-btn adm-btn--ghost adm-btn--sm">
                      {t('Xem dữ liệu')}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <AdminAccessGrantsTable onGrant={() => setIsGrantModalOpen(true)} onChanged={fetchData} />
      </div>

      <AdminExperimentsTable experiments={experimentsList} stats={expStats} />

      {isGrantModalOpen && <AdminBatchGrantPickerDialog
        onClose={() => setIsGrantModalOpen(false)}
        onGranted={() => {
          fetchData()
          setActionNotice({ type: 'success', text: t('Dataset access permission granted.') })
        }}
      />}
    </div>
  )
}
