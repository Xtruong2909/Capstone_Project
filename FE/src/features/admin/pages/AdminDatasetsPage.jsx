import { useEffect, useState } from 'react'
import { RefreshCw, AlertCircle, Database } from 'lucide-react'
import { adminService } from '../../../services/adminService'

export default function AdminDatasetsPage() {
  const [datasets, setDatasets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  const fetchDatasets = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await adminService.getDatasets()
      setDatasets(data)
    } catch (err) {
      setError('Không thể tải danh sách phiên bản dataset.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDatasets()
  }, [])

  const handleReview = async (versionId, status) => {
    const note = prompt(`Nhập ghi chú phê duyệt/từ chối (tùy chọn):`, status === 'APPROVED' ? 'Đạt tiêu chuẩn chất lượng' : 'Chưa đạt yêu cầu')
    setActionLoading(versionId)
    try {
      await adminService.reviewDataset(versionId, { status, note })
      setDatasets((prev) =>
        prev.map((d) => (d.id === versionId ? { ...d, approval_status: status } : d))
      )
    } catch (err) {
      alert(err.response?.data?.detail || 'Thao tác phê duyệt thất bại.')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED': return <span className="badge badge--approved">Đã phê duyệt</span>
      case 'REJECTED': return <span className="badge badge--rejected">Bị từ chối</span>
      case 'PENDING':
      default:
        return <span className="badge badge--pending">Chờ phê duyệt</span>
    }
  }

  return (
    <div>
      <div className="admin-card">
        <div className="admin-card__header">
          <h3 className="admin-card__title">
            Danh sách phiên bản Dataset ({datasets.length})
          </h3>
          <button
            type="button"
            className="btn-action btn-action--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={fetchDatasets}
          >
            <RefreshCw size={14} />
            <span>Làm mới</span>
          </button>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: '#2563eb' }} />
            <p>Đang tải danh sách dataset...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle size={24} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
            <p>{error}</p>
          </div>
        ) : datasets.length === 0 ? (
          <div className="empty-state">
            <Database size={28} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
            <p>Hiện chưa có phiên bản dataset nào được gửi lên từ Data Engineer.</p>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Khi Data Engineer tải lên và gửi bộ dữ liệu pNEUMA mới, các phiên bản sẽ xuất hiện tại đây để xem xét.
            </span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tên bộ dữ liệu</th>
                  <th>Phiên bản</th>
                  <th>Định dạng</th>
                  <th>Tổng số bản ghi</th>
                  <th>Trạng thái</th>
                  <th>Thời gian gửi</th>
                  <th>Phê duyệt</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: '#0f172a' }}>{item.dataset_name}</strong>
                    </td>
                    <td>
                      <code style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>
                        {item.version_tag}
                      </code>
                    </td>
                    <td>{item.file_format}</td>
                    <td>{item.total_records.toLocaleString()}</td>
                    <td>{getStatusBadge(item.approval_status)}</td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(item.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td>
                      {item.approval_status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn-action btn-action--success"
                            disabled={actionLoading === item.id}
                            onClick={() => handleReview(item.id, 'APPROVED')}
                          >
                            Duyệt
                          </button>
                          <button
                            type="button"
                            className="btn-action btn-action--danger"
                            disabled={actionLoading === item.id}
                            onClick={() => handleReview(item.id, 'REJECTED')}
                          >
                            Từ chối
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Đã xử lý</span>
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
  )
}
