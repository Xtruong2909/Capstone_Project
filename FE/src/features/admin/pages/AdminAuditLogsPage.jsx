import { useEffect, useState, useMemo } from 'react'
import { ScrollText, RefreshCw, AlertCircle, Search, ShieldAlert, CheckCircle2, Activity } from 'lucide-react'
import { adminService } from '../../../services/adminService'

export default function AdminAuditLogsPage() {
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
      {/* 1. 3-Column Bento Summary Strip */}
      <div className="adm-bento-grid">
        <div className="adm-panel adm-col-4">
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--purple">
              <ScrollText size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {logs.length}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Total Logged Events
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
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {
                  logs.filter((l) => {
                    const a = (l.action || '').toUpperCase()
                    return a.includes('CREATE') || a.includes('APPROVE') || a.includes('GRANT')
                  }).length
                }
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Provisioning & Approvals
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
              <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {
                  logs.filter((l) => {
                    const a = (l.action || '').toUpperCase()
                    return a.includes('REJECT') || a.includes('DELETE') || a.includes('REVOKE')
                  }).length
                }
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Revocations & Rejections
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Search & Filter Toolbar */}
      <div className="adm-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, flexWrap: 'wrap' }}>
          <div className="adm-search-box">
            <Search size={16} className="adm-search-box__icon" />
            <input
              type="text"
              placeholder="Search actor email, action, resource, or IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="adm-input adm-input--search"
            />
          </div>

          <div className="adm-filter-pills">
            <button
              type="button"
              className={`adm-filter-pill ${actionFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setActionFilter('ALL')}
            >
              All Events
            </button>
            <button
              type="button"
              className={`adm-filter-pill ${actionFilter === 'CREATE' ? 'active' : ''}`}
              onClick={() => setActionFilter('CREATE')}
            >
              Provisioning
            </button>
            <button
              type="button"
              className={`adm-filter-pill ${actionFilter === 'UPDATE' ? 'active' : ''}`}
              onClick={() => setActionFilter('UPDATE')}
            >
              Updates
            </button>
            <button
              type="button"
              className={`adm-filter-pill ${actionFilter === 'SECURITY' ? 'active' : ''}`}
              onClick={() => setActionFilter('SECURITY')}
            >
              Revocations
            </button>
          </div>
        </div>

        <button type="button" className="adm-btn adm-btn--primary" onClick={fetchLogs}>
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {/* 3. Audit Logs Table */}
      <div className="adm-panel">
        <div className="adm-panel__header">
          <div className="adm-panel__title-group">
            <div className="adm-panel__icon adm-tone--purple">
              <Activity size={18} />
            </div>
            <div>
              <h3 className="adm-panel__title">
                Immutable Security & Governance Ledger ({filteredLogs.length})
              </h3>
              <p className="adm-panel__subtitle">
                Chronological trace of user provisioning, dataset quality gate verdicts, and permission changes
              </p>
            </div>
          </div>
        </div>

        <div className="adm-panel__body--flush">
          {isLoading ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--blue">
                <RefreshCw size={24} className="animate-spin" />
              </div>
              <h4 className="adm-empty__title">Loading Security Audit Trail...</h4>
            </div>
          ) : error ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--rose">
                <AlertCircle size={24} />
              </div>
              <h4 className="adm-empty__title">Failed to Load Audit Logs</h4>
              <p className="adm-empty__desc">{error}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--slate">
                <ScrollText size={24} />
              </div>
              <h4 className="adm-empty__title">No Audit Log Entries Found</h4>
              <p className="adm-empty__desc">
                All user creation, status updates, and dataset approval actions are automatically logged here.
              </p>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Event ID</th>
                    <th>Timestamp</th>
                    <th>Actor Account</th>
                    <th>Operation</th>
                    <th>Resource Target</th>
                    <th>Source IP</th>
                    <th>Payload Details</th>
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
