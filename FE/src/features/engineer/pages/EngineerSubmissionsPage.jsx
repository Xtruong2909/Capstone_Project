import { useState } from 'react'
import { engineerService } from '../../../services/engineerService'
import { useEngineerPage } from '../../../hooks/useEngineerData'
import { useLanguage } from '../../../hooks/useLanguage'
import { EngineerBadge, EngineerHeader, EngineerPagination, EngineerState } from '../components/EngineerUi'

function submittedDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN')
}

export default function EngineerSubmissionsPage() {
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [batch, setBatch] = useState(null)
  const submissions = useEngineerPage(batch ? engineerService.listSubmittedVersions : engineerService.listSubmissionBatches, {
    search: search.trim() || undefined, status: batch ? undefined : status || undefined,
    group_id: batch?.group_id || undefined, ungrouped: batch ? !batch.group_id : undefined,
  })
  const batchName = (item) => item.group_name || (item.group_id ? `${t('Batch')} ${item.group_id}` : t('Unassigned Batch'))
  return <section className="admin-card de-catalog">
    <EngineerHeader title={batch ? batchName(batch) : 'Submitted Datasets & Status'} description="Track submitted dataset versions and administrator review results." onRefresh={submissions.reload} onBack={batch ? () => { setBatch(null); setSearch('') } : undefined} />
    <div className="admin-filters">
      <input type="search" className="admin-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search submitted datasets...')} aria-label={t('Search submitted datasets...')} />
      {!batch && <select className="admin-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t('Status')}>
        <option value="">{t('All Review Statuses')}</option>
        {['SUBMITTED', 'APPROVED', 'REJECTED'].map((value) => <option key={value} value={value}>{t(value)}</option>)}
      </select>}
    </div>
    <EngineerState resource={submissions}>
      <div className="admin-table-scroll"><table className="admin-table">
        <thead><tr>{(batch ? ['Dataset', 'Version', 'Sessions'] : ['Batch', 'Datasets', 'Submitted At', 'Status', 'Note', 'Action']).map((label) => <th key={label}>{t(label)}</th>)}</tr></thead>
        <tbody>{batch ? submissions.items.map((row) => <tr key={row.version_id}>
          <td><strong>{row.dataset_name || '—'}</strong></td>
          <td>{row.version_tag}</td>
          <td>{row.source_session_count}</td>
        </tr>) : submissions.items.map((row) => <tr key={row.group_id || 'ungrouped'}>
          <td><button className="admin-batch-link" onClick={() => { setBatch(row); setSearch('') }}>{batchName(row)}</button></td>
          <td>{row.dataset_count}</td>
          <td>{submittedDate(row.submitted_at)}</td>
          <td><EngineerBadge value={row.approval_status} /></td>
          <td className="admin-wrap-cell">{row.approval_notes.length ? row.approval_notes.map((note) => <p key={note}>{note}</p>) : '—'}</td>
          <td><button className="btn-secondary" onClick={() => { setBatch(row); setSearch('') }}>{t('View Datasets')} →</button></td>
        </tr>)}</tbody>
      </table></div>
    </EngineerState>
    <EngineerPagination {...submissions} />
  </section>
}
