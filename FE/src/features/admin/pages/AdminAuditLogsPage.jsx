import { useState } from 'react'
import { adminService } from '../../../services/adminService'
import { useAdminPage } from '../../../hooks/useAdminData'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminBadge, AdminPagination, AdminState, AdminToolbar } from '../components/AdminUi'

export default function AdminAuditLogsPage() {
  const { t, language } = useLanguage()
  const [search, setSearch] = useState('')
  const [module, setModule] = useState('')
  const [status, setStatus] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const invalidDates = Boolean(start && end && start > end)
  const logs = useAdminPage(adminService.getAuditLogs, {
    search: search || undefined, module: module || undefined, status: status || undefined,
    start_date: start ? new Date(`${start}T00:00:00`).toISOString() : undefined,
    end_date: end ? new Date(`${end}T23:59:59.999`).toISOString() : undefined,
  }, !invalidDates)
  return <section className="admin-card">
    <AdminToolbar title={`${t('System Audit Logs')} (${logs.total})`} onRefresh={logs.reload}>
      <input className="admin-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search audit logs')} aria-label={t('Search audit logs')} />
      <select className="admin-select" value={module} onChange={(event) => setModule(event.target.value)} aria-label={t('Module')}><option value="">{t('All Modules')}</option>{['User Management', 'Authentication', 'Dataset', 'Model Training', 'Sharing'].map((name) => <option key={name} value={name}>{t(name)}</option>)}</select>
      <select className="admin-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('Status')}><option value="">{t('All Statuses')}</option><option value="SUCCESS">{t('SUCCESS')}</option><option value="FAILED">{t('FAILED')}</option></select>
      <label>{t('From')}<input className="admin-input" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <label>{t('To')}<input className="admin-input" type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} /></label>
    </AdminToolbar>
    {invalidDates ? <p className="admin-notice admin-notice--error" role="alert">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p> : <>
      <AdminState resource={logs}><div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['Timestamp', 'Account', 'Action', 'Module', 'Status'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{logs.items.map((log) => <tr key={log.id}>
        <td>{new Date(log.created_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}</td><td>{log.username || t('System')}</td><td><code>{log.action}</code></td><td>{log.module}</td><td><AdminBadge value={log.status} /></td>
      </tr>)}</tbody></table></div></AdminState><AdminPagination {...logs} />
    </>}
  </section>
}
