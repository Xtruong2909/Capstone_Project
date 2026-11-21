import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Database, Eye, FolderOpen, Upload, Workflow } from 'lucide-react'
import { engineerService } from '../../../services/engineerService'
import { useEngineerPage, useEngineerResource } from '../../../hooks/useEngineerData'
import { useLanguage } from '../../../hooks/useLanguage'
import { EngineerBadge, EngineerHeader, EngineerPagination, EngineerState } from '../components/EngineerUi'

export default function EngineerCatalogPage({ overview = false }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const groupId = params.get('groupId') || ''
  const [search, setSearch] = useState('')
  const filters = { search: search.trim() || undefined }
  const groups = useEngineerPage(engineerService.listGroups, filters, !groupId)
  const datasets = useEngineerPage(engineerService.listDatasets, { ...filters, group_id: groupId }, Boolean(groupId))
  const health = useEngineerResource(engineerService.getHealth, {}, overview)
  const active = groupId ? datasets : groups
  const group = datasets.data?.groups?.[0]
  const openGroup = (id) => { setSearch(''); setParams({ groupId: id }) }
  return <section className="admin-card de-catalog">
    <EngineerHeader title={groupId ? group?.group_name || 'Batch' : overview ? 'Data Engineer Workspace' : 'Dataset Catalog'} description="Upload recordings, prepare batch data and send it for review." onBack={groupId ? () => { setSearch(''); setParams({}) } : undefined} onRefresh={active.reload}>
      <button className="btn-action btn-action--primary" onClick={() => navigate('/engineer/upload')}><Upload size={16} />{t('Upload Dataset')}</button>
      {groupId && <button className="btn-secondary" onClick={() => navigate('/engineer/pipeline-studio?groupId=' + groupId)}><Workflow size={16} />{t('Pipeline Studio')}</button>}
    </EngineerHeader>
    {overview && <div className="de-summary"><span><Database size={17} />{t('Batches')}: <strong>{groups.loading ? '…' : groups.total}</strong></span><span>PostgreSQL: <strong>{health.loading ? t('Loading...') : health.error ? t('Disconnected') : health.data?.status}</strong></span></div>}
    <div className="admin-filters">
      <input className="admin-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search batches...')} aria-label={t('Search batches...')} />
    </div>
      <EngineerState resource={active}><div className="admin-table-scroll"><table className="admin-table"><thead><tr>{(groupId ? ['Dataset', 'Recording Date', 'Sessions', 'Status', 'Action'] : ['Batch', 'Drone', 'Datasets', 'Sessions', 'Action']).map((label) => <th key={label}>{t(label)}</th>)}</tr></thead>
        <tbody>{groupId ? datasets.items.map((item) => <tr key={item.dataset_id}>
          <td><strong>{item.name}</strong></td><td>{item.recording_date}</td><td>{item.total_sessions}</td><td><EngineerBadge value={item.approval_status} /></td>
          <td><button className="btn-secondary" onClick={() => navigate('/engineer/preview?groupId=' + groupId + '&datasetId=' + item.dataset_id)}><Eye size={15} />{t('Preview')}</button></td>
        </tr>) : groups.items.map((item) => <tr key={item.group_id}>
          <td><strong>{item.group_name || item.drone_id}</strong><small className="admin-cell-note">{item.source}</small></td><td>{item.drone_id}</td><td>{item.dataset_count}</td><td>{item.total_sessions}</td>
          <td><div className="admin-actions"><button className="btn-secondary" onClick={() => openGroup(item.group_id)}><FolderOpen size={15} />{t('View Datasets')}</button><button className="btn-secondary" onClick={() => navigate('/engineer/pipeline-studio?groupId=' + item.group_id)}><Workflow size={15} />{t('Pipeline Studio')}</button></div></td>
        </tr>)}</tbody>
      </table></div></EngineerState><EngineerPagination {...active} />
  </section>
}
