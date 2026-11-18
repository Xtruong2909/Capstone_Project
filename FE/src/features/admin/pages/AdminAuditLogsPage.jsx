import { useEffect, useState, useMemo } from 'react'
import { ScrollText, RefreshCw, AlertCircle, Search, ShieldAlert, CheckCircle2, Activity } from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useLanguage } from '../../../hooks/useLanguage'

export default function AdminAuditLogsPage() {
  const { t, language } = useLanguage()
  const [logs, setLogs] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('ALL')

  const fetchLogs = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await adminService.getAuditLogs()
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
      setLogs(items)
      setTotalCount(typeof data?.total === 'number' ? data.total : items.length)
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message
      setError(`${t('Failed to load system audit logs.')}${detail ? ` (${detail})` : ''}`)
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

  const summary = useMemo(() => {
    let createCount = 0
    let securityCount = 0
    logs.forEach((l) => {
      const upper = (l.action || '').toUpperCase()
      if (upper.includes('CREATE') || upper.includes('GRANT') || upper.includes('APPROVE')) createCount += 1
      if (upper.includes('DELETE') || upper.includes('REJECT') || upper.includes('REVOKE') || l.status === 'FAILED') securityCount += 1
    })
    return { total: totalCount || logs.length, createCount, securityCount }
  }, [logs, totalCount])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const actionUpper = (log.action || '').toUpperCase()
      if (actionFilter === 'CREATE' && !actionUpper.includes('CREATE') && !actionUpper.includes('GRANT') && !actionUpper.includes('APPROVE')) {
        return false
      }
      if (actionFilter === 'UPDATE' && !actionUpper.includes('UPDATE') && !actionUpper.includes('STATUS')) {
        return false
      }
      if (actionFilter === 'SECURITY' && !actionUpper.includes('DELETE') && !actionUpper.includes('REJECT') && !actionUpper.includes('REVOKE') && log.status !== 'FAILED') {
        return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchUser = (log.username || log.user_email || 'system').toLowerCase().includes(q)
        const matchAction = (log.action || '').toLowerCase().includes(q)
        const matchRes = (log.module || log.resource_type || '').toLowerCase().includes(q)
        const matchDesc = (log.description || '').toLowerCase().includes(q)
        const matchIp = (log.ip_address || '').toLowerCase().includes(q)
        return matchUser || matchAction || matchRes || matchDesc || matchIp
      }
      return true
    })
  }, [logs, searchQuery, actionFilter])

  return (
    <div className="adm-page">
      {/* 1. 3 Bento Summary Cards */}
      <div className="adm-bento-grid">
        <div className="adm-panel adm-col-4">
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--blue">
              <Activity size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {summary.total}
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginTop: '0.2rem' }}>
                {t('Total Ledger Events')}
              </div>
            </div>
          </div>
        </div>

        <div className="adm-panel adm-col-4">
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--emerald">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {summary.createCount}
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginTop: '0.2rem' }}>
                {t('Provisioning & Approvals')}
              </div>
            </div>
          </div>
        </div>

        <div className="adm-panel adm-col-4">
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--rose">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {summary.securityCount}
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginTop: '0.2rem' }}>
                {t('Revocations & Rejections')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Search & Category Filter Toolbar */}
      <div className="adm-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, flexWrap: 'wrap' }}>
          <div className="adm-search-box">
            <Search size={16} className="adm-search-box__icon" />
            <input
              type="text"
              aria-label={t('Search audit logs')}
              placeholder={t('Search by account, action, resource or IP...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="adm-input adm-input--search"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[
              { key: 'ALL', label: 'All Events' },
              { key: 'CREATE', label: 'Provisioning' },
              { key: 'UPDATE', label: 'Updates' },
              { key: 'SECURITY', label: 'Revocations' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`adm-btn adm-btn--sm ${actionFilter === tab.key ? 'adm-btn--primary' : 'adm-btn--ghost'}`}
                onClick={() => setActionFilter(tab.key)}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="adm-btn adm-btn--ghost"
          onClick={fetchLogs}
          disabled={isLoading}
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          <span>{t('Refresh')}</span>
        </button>
      </div>

      {/* 3. Immutable Audit Ledger Table */}
      <div className="adm-panel">
        <div className="adm-panel__header">
          <div className="adm-panel__title-group">
            <div className="adm-panel__icon adm-tone--purple">
              <ScrollText size={18} />
            </div>
            <div>
              <h3 className="adm-panel__title">
                {t('System Audit Logs')} ({filteredLogs.length})
              </h3>
            </div>
          </div>
        </div>

        <div className="adm-panel__body--flush">
          {isLoading ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--blue">
                <RefreshCw size={24} className="animate-spin" />
              </div>
              <h4 className="adm-empty__title">{t('Loading audit logs...')}</h4>
            </div>
          ) : error ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--rose">
                <AlertCircle size={24} />
              </div>
              <h4 className="adm-empty__title">{t(error)}</h4>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--slate">
                <ScrollText size={24} />
              </div>
              <h4 className="adm-empty__title">{t('No matching audit log entries found.')}</h4>
              <p className="adm-empty__desc">
                {t('All user creation, status updates, and dataset approval actions are automatically logged here.')}
              </p>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>{t('#ID')}</th>
                    <th>{t('Timestamp')}</th>
                    <th>{t('Account')}</th>
                    <th>{t('Action')}</th>
                    <th>{t('Module')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('IP Address')}</th>
                    <th>{t('Details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <span className="adm-code-tag">
                          #{String(log.id).slice(0, 8)}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}
                      </td>
                      <td style={{ fontWeight: 700, color: '#0f172a' }}>
                        {log.username || log.user_email || t('System Daemon')}
                      </td>
                      <td>
                        <span className={`adm-badge ${getActionBadgeClass(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td>
                        <span className="adm-badge adm-badge--slate">
                          {log.module || log.resource_type || 'System'}
                        </span>
                      </td>
                      <td>
                        <span className={`adm-badge ${log.status === 'FAILED' ? 'adm-badge--rose' : 'adm-badge--emerald'}`}>
                          {log.status || 'SUCCESS'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {log.ip_address || '127.0.0.1'}
                      </td>
                      <td style={{ maxWidth: '320px' }}>
                        {log.description || log.details ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {log.description && (
                              <span style={{ fontSize: '0.78rem', color: '#334155', fontWeight: 500 }}>
                                {log.description}
                              </span>
                            )}
                            {log.details && (
                              <code
                                style={{
                                  display: 'inline-block',
                                  fontSize: '0.72rem',
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '6px',
                                  padding: '0.2rem 0.45rem',
                                  color: '#475569',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {typeof log.details === 'object'
                                  ? JSON.stringify(log.details)
                                  : String(log.details)}
                              </code>
                            )}
                          </div>
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
