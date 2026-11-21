import { Eye, FolderOpen, Workflow } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEngineerBatchBrowser } from '../../../hooks/useEngineerData'
import { useLanguage } from '../../../hooks/useLanguage'
import { EngineerBadge, EngineerHeader, EngineerPagination, EngineerState } from './EngineerUi'

export default function EngineerBatchBrowser({ mode = 'preview' }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const groupId = mode === 'preview' ? params.get('groupId') : null
  const { search, setSearch, resource, groupName } = useEngineerBatchBrowser(groupId)
  const path = mode === 'pipeline' ? '/engineer/pipeline-studio' : '/engineer/preview'
  const openBatch = (id) => { setSearch(''); navigate(path + '?groupId=' + encodeURIComponent(id)) }
  return <section className="admin-card de-catalog">
    <EngineerHeader title={groupId ? groupName || 'Batch' : mode === 'pipeline' ? 'Pipeline Studio' : 'Schema & Data Preview'}
      description={mode === 'pipeline' ? 'Choose a batch below to map columns, normalize data and submit versions for review.' : groupId ? 'Select a dataset to preview its recording sessions.' : 'Browse batches and datasets to inspect their recording sessions and data columns.'}
      onRefresh={resource.reload} onBack={groupId ? () => { setSearch(''); navigate(path) } : undefined} />
    <div className="admin-filters"><input className="admin-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(groupId ? 'Find a dataset...' : 'Search batches...')} aria-label={t(groupId ? 'Find a dataset...' : 'Search batches...')} /><span className="admin-catalog__count">{resource.loading ? '…' : resource.total} {t(groupId ? 'Datasets' : 'Batches')}</span></div>
    <EngineerState resource={resource}><div className="admin-table-scroll"><table className="admin-table">
      <thead><tr>{(groupId ? ['Dataset', 'Recording Date', 'Sessions', 'Status', 'Action'] : ['Batch', 'Datasets', 'Sessions', 'Action']).map((label) => <th key={label}>{t(label)}</th>)}</tr></thead>
      <tbody>{resource.items.map((item) => groupId ? <tr key={item.dataset_id}>
        <td><strong>{item.name}</strong></td><td>{item.recording_date}</td><td>{item.total_sessions}</td><td><EngineerBadge value={item.approval_status} /></td>
        <td><button className="btn-secondary" onClick={() => navigate(path + '?groupId=' + encodeURIComponent(groupId) + '&datasetId=' + encodeURIComponent(item.dataset_id))}><Eye size={16} />{t('Preview')}</button></td>
      </tr> : <tr key={item.group_id}>
        <td><button className="admin-batch-link" onClick={() => openBatch(item.group_id)}>{item.group_name || item.drone_id}</button><small className="admin-cell-note">{item.source}</small></td><td>{item.dataset_count}</td><td>{item.total_sessions}</td>
        <td><button className="btn-secondary" onClick={() => openBatch(item.group_id)}>{mode === 'pipeline' ? <Workflow size={16} /> : <FolderOpen size={16} />}{t(mode === 'pipeline' ? 'Open Pipeline' : 'View Datasets')}</button></td>
      </tr>)}</tbody>
    </table></div></EngineerState><EngineerPagination {...resource} />
  </section>
}
