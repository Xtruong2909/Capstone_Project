import { useEffect, useState } from 'react'
import { ScrollText, RefreshCw, AlertCircle } from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useLanguage } from '../../../hooks/useLanguage'

export default function AdminAuditLogsPage() {
  const { t, language } = useLanguage()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchLogs = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await adminService.getAuditLogs()
      setLogs(data)
    } catch (err) {
      setError(t('Failed to load system audit logs.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const getActionBadgeClass = (action) => {
    if (action.includes('CREATE')) return 'badge--active'
    if (action.includes('DELETE') || action.includes('REJECT')) return 'badge--rejected'
    if (action.includes('UPDATE') || action.includes('STATUS')) return 'badge--pending'
    return 'badge--engineer'
  }

  return (
    <div>
      <div className="admin-card">
        <div className="admin-card__header">
          <h3 className="admin-card__title">
            {t('System Audit Logs')} ({logs.length})
          </h3>
          <button
            type="button"
            className="btn-action btn-action--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={fetchLogs}
          >
            <RefreshCw size={14} />
            <span>{t('Refresh')}</span>
          </button>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: '#2563eb' }} />
            <p>{t('Loading audit logs...')}</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle size={24} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
            <p>{t(error)}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <ScrollText size={28} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
            <p>{t('No audit log entries recorded yet.')}</p>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {t('All user creation, status updates, and dataset approval actions are automatically logged here.')}
            </span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('#ID')}</th>
                  <th>{t('Timestamp')}</th>
                  <th>{t('Account')}</th>
                  <th>{t('Action')}</th>
                  <th>{t('Resource Type')}</th>
                  <th>{t('IP Address')}</th>
                  <th>{t('Details')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>#{log.id}</td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(log.created_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}
                    </td>
                    <td>{log.user_email || t('System')}</td>
                    <td>
                      <span className={`badge ${getActionBadgeClass(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td>{log.resource_type}</td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{log.ip_address || '—'}</td>
                    <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#334155' }}>
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
