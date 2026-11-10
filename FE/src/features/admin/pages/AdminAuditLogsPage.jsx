import { useEffect, useState, useMemo } from 'react'
import { ScrollText, RefreshCw, AlertCircle, Search, ShieldAlert, CheckCircle2, Activity } from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useLanguage } from '../../../hooks/useLanguage'

export default function AdminAuditLogsPage() {
  const { t, language } = useLanguage()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('ALL')

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

  const getActionBadgeClass = (action = '') => {
    const upper = action.toUpperCase()
    if (upper.includes('CREATE') || upper.includes('APPROVE') || upper.includes('GRANT')) {
      return 'adm-badge--emerald'
    }
    if (upper.includes('DELETE') || upper.includes('REJECT') || upper.includes('REVOKE')) {
      return 'adm-badge--rose'
    }
    if (upper.includes('UPDATE') || upper.includes('STATUS')) {
      return 'adm-badge--amber'
    }
    return 'adm-badge--blue'
  }

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const actionUpper = (log.action || '').toUpperCase()
      if (actionFilter === 'CREATE' && !actionUpper.includes('CREATE') && !actionUpper.includes('GRANT')) {
        return false
      }
      if (actionFilter === 'UPDATE' && !actionUpper.includes('UPDATE') && !actionUpper.includes('STATUS')) {
        return false
      }
      if (actionFilter === 'SECURITY' && !actionUpper.includes('DELETE') && !actionUpper.includes('REJECT') && !actionUpper.includes('REVOKE')) {
        return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchUser = (log.user_email || 'system').toLowerCase().includes(q)
        const matchAction = (log.action || '').toLowerCase().includes(q)
        const matchRes = (log.resource_type || '').toLowerCase().includes(q)
        const matchIp = (log.ip_address || '').toLowerCase().includes(q)
        return matchUser || matchAction || matchRes || matchIp
      }
      return true
    })
  }, [logs, searchQuery, actionFilter])

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
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <span className="adm-code-tag">#{log.id}</span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString('en-US')}
                      </td>
                      <td style={{ fontWeight: 700, color: '#0f172a' }}>
                        {log.user_email || 'System Daemon'}
                      </td>
                      <td>
                        <span className={`adm-badge ${getActionBadgeClass(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td>
                        <span className="adm-badge adm-badge--slate">{log.resource_type}</span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {log.ip_address || '127.0.0.1'}
                      </td>
                      <td style={{ maxWidth: '320px' }}>
                        {log.details ? (
                          <code
                            style={{
                              display: 'inline-block',
                              fontSize: '0.74rem',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              padding: '0.25rem 0.5rem',
                              color: '#334155',
                              wordBreak: 'break-word',
                            }}
                          >
                            {typeof log.details === 'object'
                              ? JSON.stringify(log.details)
                              : String(log.details)}
                          </code>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
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
  )
}
