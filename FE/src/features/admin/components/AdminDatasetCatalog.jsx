import { useState } from 'react'
import { Database, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useAdminMutation, useAdminPage } from '../../../hooks/useAdminData'
import { useAdminSessionPreview } from '../../../hooks/useAdminSessionPreview'
import { useLanguage } from '../../../hooks/useLanguage'
import { formatAthensRecordingDateTime } from '../../scientist/utils/formatters'
import { AdminFeedback, AdminModal, AdminPagination, AdminState } from './AdminUi'
import AdminBatchGrantDialog from './AdminBatchGrantDialog'
import AdminBatchList from './AdminBatchList'
import AdminDatasetTable from './AdminDatasetTable'
import AdminApprovalBatchList from './AdminApprovalBatchList'

function SessionPreview({ dataset, session, onBack, cache }) {
  const { t } = useLanguage()
  const [page, setPage] = useState(1)
  const [columnOffset, setColumnOffset] = useState(0)
  const preview = useAdminSessionPreview({
    dataset_id: dataset.dataset_id, file_id: dataset.id, session_id: session.session_id,
    page, page_size: 20, representation: 'normalized', column_offset: columnOffset,
  }, cache)
  return <>
    <div className="admin-filters"><button className="btn-secondary" onClick={onBack}>← {t('Sessions')}</button><strong>{session.original_filename}</strong>
    </div>
    <AdminState resource={preview}>{preview.data && <>
      <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{preview.data.columns.map((column) => <th key={column.name}>{column.name}<small className="admin-cell-note">{column.type}</small></th>)}</tr></thead><tbody>{preview.data.rows.map((row, index) => <tr key={index}>{preview.data.columns.map((column) => <td key={column.name}>{row[column.name] == null ? '—' : typeof row[column.name] === 'object' ? JSON.stringify(row[column.name]) : String(row[column.name])}</td>)}</tr>)}</tbody></table>
      {!preview.data.rows.length && <p className="empty-state">{t('No results found.')}</p>}</div>
      <nav className="admin-pagination" aria-label={t('Preview pagination')}>
        <span>{t('Page')} {page} · {preview.data.pagination.returned_rows} {t('rows')}{preview.data.pagination.total_rows != null ? ` / ${preview.data.pagination.total_rows}` : ''}</span>
        <div className="admin-pagination__controls"><button className="btn-secondary" disabled={preview.loading || page <= 1} onClick={() => setPage(page - 1)}>{t('Previous')}</button><button className="btn-secondary" disabled={preview.loading || !preview.data.pagination.has_more} onClick={() => setPage(page + 1)}>{t('Next')}</button></div>
      </nav>
      {(columnOffset > 0 || preview.data.has_more_columns) && <div className="admin-pagination"><span>{columnOffset + 1}–{columnOffset + preview.data.columns.length} / {preview.data.total_columns} {t('Columns')}</span><div className="admin-actions"><button className="btn-secondary" disabled={columnOffset === 0} onClick={() => setColumnOffset(Math.max(0, columnOffset - preview.data.columns.length))}>{t('Previous Columns')}</button><button className="btn-secondary" disabled={!preview.data.has_more_columns || !preview.data.columns.length} onClick={() => setColumnOffset(columnOffset + preview.data.columns.length)}>{t('Next Columns')}</button></div></div>}
    </>}</AdminState>
  </>
}

function DatasetSessions({ dataset, onClose }) {
  const { t } = useLanguage()
  const [session, setSession] = useState(null)
  const [previewCache] = useState(() => new Map())
  const sessions = useAdminPage(adminService.getDatasetSessions, { dataset_id: dataset.dataset_id, file_id: dataset.id })
  return <AdminModal title={dataset.dataset_name} onClose={onClose} className="admin-dataset-dialog">
    {session ? <SessionPreview key={session.session_id} dataset={dataset} session={session} cache={previewCache} onBack={() => setSession(null)} /> : <>
      <h4>{t('Recording Sessions')}</h4><AdminState resource={sessions}><div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['Session', 'Start (Athens)', 'End (Athens)', 'Status', 'Action'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{sessions.items.map((item) => <tr key={item.session_id}>
        <td><strong>{item.original_filename}</strong></td><td>{formatAthensRecordingDateTime(item.scheduled_start)}</td><td>{formatAthensRecordingDateTime(item.scheduled_end)}</td><td>{item.validation_status || item.upload_status}</td><td><button className="btn-secondary" onClick={() => setSession(item)}>{t('Preview')}</button></td>
      </tr>)}</tbody></table></div></AdminState><AdminPagination {...sessions} />
    </>}
  </AdminModal>
}

export default function AdminDatasetCatalog({ approvedOnly = false }) {
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [batchSearch, setBatchSearch] = useState('')
  const [batch, setBatch] = useState(null)
  const [status, setStatus] = useState('SUBMITTED')
  const [preview, setPreview] = useState(null)
  const [review, setReview] = useState(null)
  const [note, setNote] = useState('')
  const [batchGrant, setBatchGrant] = useState(null)
  const [batchRevoke, setBatchRevoke] = useState(null)
  const approvalStatus = approvedOnly ? 'APPROVED' : status || undefined
  const groups = useAdminPage(adminService.getDatasetGroups, { search: batchSearch || undefined, approval_status: approvalStatus }, !batch)
  const datasets = useAdminPage(adminService.getDatasetFilesPage, {
    search: search || undefined, approval_status: approvalStatus,
    group_id: batch?.group_id || undefined, ungrouped: batch ? !batch.group_id : undefined,
  }, Boolean(batch))
  const activeList = batch ? datasets : groups
  const batchName = (item) => item.group_name || (item.group_id ? `${t('Batch')} ${item.group_id}` : t('Unassigned Batch'))
  const refresh = () => { groups.reload(); datasets.reload() }
  const mutation = useAdminMutation()
  const openBatch = (item) => { setBatch(item); setSearch(''); datasets.setPage(1) }
  return <section className={`admin-card admin-catalog ${!approvedOnly ? 'admin-approval-catalog' : ''} ${batch ? 'admin-catalog--detail' : ''}`}>
      <header className="admin-catalog__header">
        <div className="admin-catalog__intro"><span className="admin-catalog__icon">{approvedOnly ? <Database size={24} /> : <ShieldCheck size={25} />}</span><div>
          <p className="admin-catalog__eyebrow">{t(approvedOnly ? 'Data Management' : 'Batch Review')}</p>
          <h2>{batch ? batchName(batch) : t(approvedOnly ? 'Approved Datasets' : 'Dataset Approval')}</h2>
          <p>{t(batch ? 'Select a dataset to preview its recording sessions.' : approvedOnly ? 'Explore approved data by batch and manage access in one place.' : 'Review datasets and approve or reject each batch with a shared comment.')}</p>
        </div></div>
        <button className="btn-secondary" onClick={refresh} disabled={activeList.loading}><RefreshCw size={16} className={activeList.loading ? 'animate-spin' : ''} />{t('Refresh')}</button>
      </header>
      <div className="admin-catalog__toolbar">
        {batch && <button className="btn-secondary" onClick={() => { setBatch(null); setSearch('') }}>← {t('Back to Batches')}</button>}
        <div className="admin-catalog__search"><Search size={18} /><input className="admin-input" type="search" value={batch ? search : batchSearch} onChange={(event) => batch ? setSearch(event.target.value) : setBatchSearch(event.target.value)} placeholder={t(batch ? 'Find a dataset...' : 'Search batches...')} aria-label={t(batch ? 'Find a dataset...' : 'Search batches...')} /></div>
        {!approvedOnly && <select className="admin-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('Status')}><option value="">{t('All Statuses')}</option>{['SUBMITTED', 'APPROVED', 'REJECTED', 'PENDING'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select>}
        <span className="admin-catalog__count">{activeList.loading ? '…' : activeList.total} {t(batch ? 'results' : 'batches')}</span>
      </div>
    {!review && <AdminFeedback mutation={mutation} />}
    {!batch ? <AdminState resource={groups}>{approvedOnly
      ? <AdminBatchList items={groups.items} batchName={batchName} onOpen={openBatch} onGrant={setBatchGrant} onRevoke={setBatchRevoke} />
      : <AdminApprovalBatchList items={groups.items} batchName={batchName} onOpen={openBatch} busy={mutation.busy} onReview={(item, status) => { mutation.clear(); setNote(''); setReview({ item, status }) }} />
    }</AdminState> : <AdminState resource={datasets}><AdminDatasetTable items={datasets.items} onPreview={setPreview} /></AdminState>}
    <AdminPagination {...activeList} />
    {preview && <DatasetSessions key={preview.id} dataset={preview} onClose={() => setPreview(null)} />}
    {batchGrant && <AdminBatchGrantDialog key={batchGrant.group_id} batch={batchGrant} onClose={() => setBatchGrant(null)} onGranted={refresh} />}
    {batchRevoke && <AdminBatchGrantDialog key={`revoke-${batchRevoke.group_id}`} batch={batchRevoke} revokeMode onClose={() => setBatchRevoke(null)} onGranted={refresh} />}
    {review && <AdminModal title={`${t(review.status === 'APPROVED' ? 'Approve' : 'Reject')} · ${batchName(review.item)}`} className="admin-batch-review-dialog" busy={mutation.busy} onClose={() => setReview(null)}>
      <form onSubmit={(event) => { event.preventDefault(); mutation.run(() => adminService.reviewBatch(review.item.group_id, { status: review.status, note: note.trim() || null }), () => { setReview(null); refresh() }) }}>
        <AdminFeedback mutation={mutation} /><p>{t('Apply this decision and comment to all submitted datasets in this batch.')}</p><label className="form-field">{t('Note')}<textarea className="admin-input" maxLength={2000} disabled={mutation.busy} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <div className="modal-actions"><button type="button" className="btn-secondary" disabled={mutation.busy} onClick={() => setReview(null)}>{t('Cancel')}</button><button className="btn-action btn-action--primary" disabled={mutation.busy}>{t('Confirm')}</button></div>
      </form>
    </AdminModal>}
  </section>
}
