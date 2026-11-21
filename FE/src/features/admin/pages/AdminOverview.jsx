import { Link } from 'react-router-dom'
import { adminService } from '../../../services/adminService'
import { useAdminPage, useAdminResource } from '../../../hooks/useAdminData'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminBadge, AdminPagination, AdminState, AdminToolbar } from '../components/AdminUi'

export default function AdminOverview() {
  const { t, language } = useLanguage()
  const summary = useAdminResource(adminService.getStats)
  const health = useAdminResource(adminService.getDatabaseHealth)
  const experiments = useAdminPage(adminService.getExperimentsOverview)
  const reload = () => { summary.reload(); health.reload(); experiments.reload() }
  const date = (value) => value ? new Date(value).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US') : '—'
  return <div className="admin-workspace">
    <section className="admin-card">
      <AdminToolbar title={t('System Overview')} onRefresh={reload} />
      <AdminState resource={summary}>{summary.data && <>
        <div className="admin-kpi-grid">{[
          ['User Management', summary.data.total_users, '/admin/users'],
          ['Datasets', summary.data.total_datasets, '/admin/datasets'],
          ['Pending Approvals', summary.data.pending_approvals, '/admin/datasets'],
          ['Approved Datasets', summary.data.approved_versions, '/admin/datasets-available'],
          ['System Audit Logs', summary.data.total_audit_logs, '/admin/audit-logs'],
          ['Dataset Access Permissions', summary.data.total_access_grants, '/admin/datasets-available'],
        ].map(([label, value, to]) => <Link className="admin-kpi" to={to} key={label}><span>{t(label)}</span><strong>{Number(value).toLocaleString()}</strong></Link>)}</div>
        <div className="admin-overview-meta"><span>{t('Active')}: <strong>{summary.data.active_users} / {summary.data.total_users}</strong></span>{Object.entries(summary.data.users_by_role).map(([role, count]) => <span key={role}>{t(role)}: <strong>{count}</strong></span>)}</div>
      </>}</AdminState>
      <div className="admin-overview-meta"><span>PostgreSQL: <strong>{health.loading ? t('Loading...') : health.error ? t('Disconnected') : health.data?.status}</strong></span>{health.error && <span role="alert">{health.error}</span>}</div>
    </section>

    <section className="admin-card"><AdminToolbar title={t('AI/ML Experiments')} onRefresh={experiments.reload} />
      {experiments.data?.stats && <div className="admin-overview-meta">{['pending', 'running', 'completed', 'failed'].map((status) => <span key={status}>{t(status.toUpperCase())}: <strong>{experiments.data.stats[`${status}_count`]}</strong></span>)}</div>}
      <AdminState resource={experiments}><div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['Experiment Name', 'Dataset', 'Model', 'Status', 'Created By', 'MAE', 'RMSE', 'Date'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{experiments.items.map((item) => <tr key={`${item.experiment_type}:${item.id}`}>
        <td><strong>{item.name}</strong></td><td>{item.dataset_name || item.group_name || '—'}</td><td>{item.model_type}</td><td><AdminBadge value={item.status} /></td><td>{item.creator_name || '—'}</td><td>{item.metrics?.mae == null ? '—' : Number(item.metrics.mae).toFixed(2)}</td><td>{item.metrics?.rmse == null ? '—' : Number(item.metrics.rmse).toFixed(2)}</td><td>{date(item.created_at)}</td>
      </tr>)}</tbody></table></div></AdminState><AdminPagination {...experiments} />
    </section>

  </div>
}
