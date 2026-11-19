import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, RefreshCw, ScrollText, Search } from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useLanguage } from '../../../hooks/useLanguage'

const ACTION_FILTERS = ['ALL', 'CREATE', 'UPDATE', 'SECURITY']

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
      setLogs(Array.isArray(data) ? data : [])
    } catch {
      setError('Failed to load system audit logs.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const getActionBadgeClass = (action = '') => {
    const upper = String(action || '').toUpperCase()
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
    const query = searchQuery.trim().toLowerCase()
    return logs.filter((log) => {
      const action = (log.action || '').toUpperCase()
      if (actionFilter === 'CREATE' && !['CREATE', 'GRANT', 'APPROVE'].some((value) => action.includes(value))) {
        return false
      }
      if (actionFilter === 'UPDATE' && !['UPDATE', 'STATUS'].some((value) => action.includes(value))) {
        return false
      }
      if (actionFilter === 'SECURITY' && !['DELETE', 'REJECT', 'REVOKE'].some((value) => action.includes(value))) {
        return false
      }
      return !query || [
        log.user_email,
        log.action,
        log.resource_type,
        log.ip_address,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    })
  }, [logs, searchQuery, actionFilter])

  return (
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

      {!isLoading && !error && logs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', padding: '1rem 1.5rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('Search audit logs')}
              aria-label={t('Search audit logs')}
            />
          </label>
          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            aria-label={t('Filter actions')}
          >
            {ACTION_FILTERS.map((filter) => (
              <option key={filter} value={filter}>{t(filter)}</option>
            ))}
          </select>
        </div>
      )}

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
      ) : filteredLogs.length === 0 ? (
        <div className="empty-state">
          <p>{t('No matching audit logs.')}</p>
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
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td><span className="adm-code-tag">#{log.id}</span></td>
                  <td style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}
                  </td>
                  <td style={{ fontWeight: 700, color: '#0f172a' }}>
                    {log.user_email || t('System')}
                  </td>
                  <td>
                    <span className={`adm-badge ${getActionBadgeClass(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td><span className="adm-badge adm-badge--slate">{log.resource_type}</span></td>
                  <td style={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace' }}>
                    {log.ip_address || '—'}
                  </td>
                  <td style={{ maxWidth: '320px' }}>
                    {log.details ? (
                      <code style={{ display: 'inline-block', fontSize: '0.74rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.25rem 0.5rem', color: '#334155', wordBreak: 'break-word' }}>
                        {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
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
  )
}
