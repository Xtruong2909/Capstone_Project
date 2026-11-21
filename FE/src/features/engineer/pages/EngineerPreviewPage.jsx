import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { engineerService } from '../../../services/engineerService'
import { useEngineerPage, useEngineerResource } from '../../../hooks/useEngineerData'
import { useLanguage } from '../../../hooks/useLanguage'
import { formatAthensRecordingDateTime } from '../../scientist/utils/formatters'
import { EngineerBadge, EngineerHeader, EngineerPagination, EngineerState } from '../components/EngineerUi'
import EngineerBatchBrowser from '../components/EngineerBatchBrowser'

function SessionData({ groupId, datasetId, session, onBack }) {
  const { t } = useLanguage()
  const [page, setPage] = useState(1)
  const [columnOffset, setColumnOffset] = useState(0)
  const preview = useEngineerResource(engineerService.previewSession, { group_id: groupId, dataset_id: datasetId, session_id: session.session_id, page, page_size: 20, representation: 'normalized', column_offset: columnOffset })
  const data = preview.data
  return <section className="admin-card"><EngineerHeader title={session.original_filename} onBack={onBack} onRefresh={preview.reload} />
    <EngineerState resource={preview}>{data && <>
      <div className="de-preview-table"><table className="admin-table"><thead><tr>{data.columns.map((column) => <th key={column.name}>{column.name}<small className="admin-cell-note">{column.type}</small></th>)}</tr></thead><tbody>{data.rows.map((row, index) => <tr key={index}>{data.columns.map((column) => <td key={column.name}>{row[column.name] == null ? '—' : typeof row[column.name] === 'object' ? JSON.stringify(row[column.name]) : String(row[column.name])}</td>)}</tr>)}</tbody></table>{!data.rows.length && <p className="empty-state">{t('No results found.')}</p>}</div>
      <nav className="admin-pagination" aria-label={t('Preview pagination')}><span>{t('Page')} {page} · {data.pagination.returned_rows} {t('rows')}{data.pagination.total_rows != null ? ' / ' + data.pagination.total_rows.toLocaleString() : ''}</span><div className="admin-actions"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('Previous')}</button><button className="btn-secondary" disabled={!data.pagination.has_more || page >= 10000} onClick={() => setPage(page + 1)}>{t('Next')}</button></div></nav>
      {(columnOffset > 0 || data.has_more_columns) && <nav className="admin-pagination"><span>{columnOffset + 1}–{columnOffset + data.columns.length} / {data.total_columns} {t('Columns')}</span><div className="admin-actions"><button className="btn-secondary" disabled={!columnOffset} onClick={() => setColumnOffset(Math.max(0, columnOffset - data.columns.length))}>{t('Previous Columns')}</button><button className="btn-secondary" disabled={!data.has_more_columns} onClick={() => setColumnOffset(columnOffset + data.columns.length)}>{t('Next Columns')}</button></div></nav>}
    </>}</EngineerState>
  </section>
}

function DatasetSessions({ groupId, datasetId }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const sessions = useEngineerPage(engineerService.listSessions, { group_id: groupId, dataset_id: datasetId })
  if (session) return <SessionData key={session.session_id} groupId={groupId} datasetId={datasetId} session={session} onBack={() => setSession(null)} />
  return <section className="admin-card"><EngineerHeader title="Recording Sessions" description="Recording times are displayed in Athens local time." onBack={() => navigate('/engineer/preview?groupId=' + groupId)} onRefresh={sessions.reload} />
    <EngineerState resource={sessions}><div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['Session', 'Start (Athens)', 'End (Athens)', 'Status', 'Action'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{sessions.items.map((row) => <tr key={row.session_id}><td><strong>{row.original_filename}</strong></td><td>{formatAthensRecordingDateTime(row.scheduled_start)}</td><td>{formatAthensRecordingDateTime(row.scheduled_end)}</td><td><EngineerBadge value={row.upload_status} /></td><td><button className="btn-secondary" onClick={() => setSession(row)}>{t('Preview')}</button></td></tr>)}</tbody></table></div></EngineerState><EngineerPagination {...sessions} />
  </section>
}

export default function EngineerPreviewPage() {
  const { t } = useLanguage()
  const [params] = useSearchParams()
  const datasetId = params.get('datasetId')
  const detail = useEngineerResource(engineerService.getDataset, { dataset_id: datasetId }, Boolean(datasetId) && !params.get('groupId'))
  const groupId = params.get('groupId') || detail.data?.group_id
  if (datasetId && groupId) return <DatasetSessions key={groupId + datasetId} groupId={groupId} datasetId={datasetId} />
  if (datasetId) return <EngineerState resource={detail}><p className="empty-state">{t('Select a dataset from the catalog to preview its sessions.')}</p></EngineerState>
  return <EngineerBatchBrowser key={groupId || 'batches'} mode="preview" />
}
