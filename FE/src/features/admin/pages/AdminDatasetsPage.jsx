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
      setError('Failed to load dataset versions.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDatasets()
  }, [])

  const handleReview = async (versionId, status) => {
    const note = prompt(
      `Enter ${status === 'APPROVED' ? 'approval' : 'rejection'} note (optional):`,
      status === 'APPROVED' ? 'Meets UAV trajectory data quality standards' : 'Does not meet quality requirements'
    )
    setActionLoading(versionId)
    try {
      await adminService.reviewDataset(versionId, { status, note })
      setDatasets((prev) =>
        prev.map((d) => (d.id === versionId ? { ...d, approval_status: status } : d))
      )
    } catch (err) {
      alert(err.response?.data?.detail || 'Dataset review action failed.')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED': return <span className="badge badge--approved">Approved</span>
      case 'REJECTED': return <span className="badge badge--rejected">Rejected</span>
      case 'PENDING':
      default:
        return <span className="badge badge--pending">Pending</span>
    }
  }

  return (
    <div>
      <div className="admin-card">
        <div className="admin-card__header">
          <h3 className="admin-card__title">
            Dataset Versions ({datasets.length})
          </h3>
          <button
            type="button"
            className="btn-action btn-action--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={fetchDatasets}
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: '#2563eb' }} />
            <p>Loading dataset versions...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle size={24} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
            <p>{error}</p>
          </div>
        ) : datasets.length === 0 ? (
          <div className="empty-state">
            <Database size={28} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
            <p>No dataset versions have been submitted by Data Engineers yet.</p>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              When a Data Engineer uploads a new pNEUMA dataset, versions will appear here for review.
            </span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Dataset Name</th>
                  <th>Version</th>
                  <th>Format</th>
                  <th>Total Records</th>
                  <th>Status</th>
                  <th>Submitted At</th>
                  <th>Review Action</th>
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
                      {new Date(item.created_at).toLocaleString('en-US')}
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
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn-action btn-action--danger"
                            disabled={actionLoading === item.id}
                            onClick={() => handleReview(item.id, 'REJECTED')}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Reviewed</span>
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
