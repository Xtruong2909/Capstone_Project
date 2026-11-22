import { Eye, FolderOpen, Layers, Search, Upload, Workflow } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEngineerBatchBrowser } from '../../../hooks/useEngineerData'
import { useLanguage } from '../../../hooks/useLanguage'
import { EngineerBadge, EngineerHeader, EngineerPagination, EngineerState } from './EngineerUi'
import EngineerBatchApproval from './EngineerBatchApproval'

export default function EngineerBatchBrowser({ mode = 'preview' }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const groupId = mode !== 'pipeline' ? params.get('groupId') : null
  const { search, setSearch, resource, groupName } = useEngineerBatchBrowser(groupId, mode)
  const path = mode === 'pipeline' ? '/engineer/pipeline-studio' : mode === 'catalog' ? '/engineer/datasets' : '/engineer/preview'
  const openBatch = (id) => {
    setSearch('')
    navigate(path + '?groupId=' + encodeURIComponent(id))
  }

  const isNoResults = !resource.loading && !resource.error && resource.items.length === 0

  return (
    <section className="admin-card de-catalog">
      <EngineerHeader
        title={groupId ? groupName || 'Batch' : mode === 'pipeline' ? 'Pipeline Studio' : mode === 'catalog' ? 'Dataset Catalog' : 'Schema & Data Preview'}
        onRefresh={resource.reload}
        onBack={groupId ? () => { setSearch(''); navigate(path) } : undefined}
      />
      <div className="admin-filters">
        <div className="admin-search-wrapper">
          <Search size={16} className="admin-search-icon" />
          <input
            className="admin-input admin-input--search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(groupId ? 'Find a dataset...' : 'Search batches...')}
            aria-label={t(groupId ? 'Find a dataset...' : 'Search batches...')}
          />
        </div>
        <span className="adm-badge adm-badge--blue">
          {resource.loading ? '…' : resource.total} {t(groupId ? 'Datasets' : 'Batches')}
        </span>
      </div>

      <EngineerState resource={resource}>
        {isNoResults ? (
          <div className="empty-state empty-state--card">
            <div className="empty-state__icon-box">
              <Layers size={32} />
            </div>
            <h3 className="empty-state__title">
              {t(groupId ? 'No datasets in this batch' : 'No batches found')}
            </h3>
            <p className="empty-state__description">
              {t(
                groupId
                  ? 'This batch currently has no recorded datasets.'
                  : 'Upload new drone datasets to create your first processing batch.'
              )}
            </p>
            <button
              type="button"
              className="btn-action btn-action--primary"
              onClick={() => navigate('/engineer/upload')}
            >
              <Upload size={16} />
              <span>{t('Upload Datasets')}</span>
            </button>
          </div>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  {(groupId
                    ? ['Dataset', 'Recording Date', 'Sessions', 'Status', 'Action']
                    : ['Batch', 'Datasets', 'Sessions', ...(mode === 'catalog' ? ['Trạng thái phê duyệt'] : []), 'Action']
                  ).map((label) => (
                    <th key={label}>{t(label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resource.items.map((item) =>
                  groupId ? (
                    <tr key={item.dataset_id}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td>{item.recording_date || '—'}</td>
                      <td>{item.total_sessions}</td>
                      <td>
                        <EngineerBadge value={item.approval_status} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            navigate(
                              '/engineer/preview' +
                                '?groupId=' +
                                encodeURIComponent(groupId) +
                                '&datasetId=' +
                                encodeURIComponent(item.dataset_id)
                            )
                          }
                        >
                          <Eye size={16} />
                          {mode === 'preview' ? 'Xem các phiên ghi hình' : t('Preview')}
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.group_id}>
                      <td>
                        <button
                          type="button"
                          className="admin-batch-link"
                          onClick={() => openBatch(item.group_id)}
                        >
                          {item.group_name || item.drone_id}
                        </button>
                        <small className="admin-cell-note">{item.source}</small>
                        {mode === 'pipeline' && item.pipeline && <small className="admin-cell-note">
                          {['', 'Chuẩn hóa tên cột', 'Chuẩn hóa dữ liệu', 'Xuất tệp', 'Gửi phê duyệt'][item.pipeline.step]}
                          {['PENDING', 'RUNNING'].includes(item.pipeline.job?.status) ? ' · Đang xử lý' : ''}
                        </small>}
                      </td>
                      <td>{item.dataset_count}</td>
                      <td>{item.total_sessions}</td>
                      {mode === 'catalog' && <td><EngineerBatchApproval status={item.approval_status} counts={item.approval_counts} /></td>}
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => openBatch(item.group_id)}
                        >
                          {mode === 'pipeline' ? <Workflow size={16} /> : <FolderOpen size={16} />}
                          {t(mode === 'pipeline' ? 'Open Pipeline' : 'View Datasets')}
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </EngineerState>

      {!isNoResults && <EngineerPagination {...resource} />}
    </section>
  )
}
