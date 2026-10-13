import { useEffect, useState } from 'react'
import { ScrollText, RefreshCw, AlertCircle } from 'lucide-react'
import { adminService } from '../../../services/adminService'

export default function AdminAuditLogsPage() {
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
      setError('Không thể tải nhật ký hoạt động hệ thống.')
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
            Nhật ký kiểm toán hệ thống ({logs.length})
          </h3>
          <button
            type="button"
            className="btn-action btn-action--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={fetchLogs}
          >
            <RefreshCw size={14} />
            <span>Làm mới</span>
          </button>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: '#2563eb' }} />
            <p>Đang tải nhật ký kiểm toán...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle size={24} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
            <p>{error}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <ScrollText size={28} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
            <p>Chưa có nhật ký hoạt động nào được ghi nhận.</p>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Mọi hành vi thêm tài khoản, cập nhật trạng thái, phê duyệt dataset sẽ tự động được ghi lại tại đây.
            </span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#ID</th>
                  <th>Thời gian</th>
                  <th>Tài khoản</th>
                  <th>Hành động</th>
                  <th>Loại tài nguyên</th>
                  <th>Địa chỉ IP</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>#{log.id}</td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td>{log.user_email || 'System'}</td>
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
