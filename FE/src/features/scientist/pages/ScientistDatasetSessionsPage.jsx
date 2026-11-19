import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronRight, FileSpreadsheet, FlaskConical, RefreshCw, Search, TrendingUp } from 'lucide-react'
import { useDatasetSessions, useGroupDatasets } from '../../../hooks/useScientistData'
import ScientistBackLink from '../components/ScientistBackLink'

export default function ScientistDatasetSessionsPage() {
  const { datasetId, versionId } = useParams()
  const [searchParams] = useSearchParams()
  const groupId = searchParams.get('groupId')
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { datasets } = useGroupDatasets(groupId)
  const dataset = datasets.find((item) => item.dataset_id === datasetId && item.version_id === versionId)
  const { sessions, isLoading, error, reload } = useDatasetSessions(datasetId, versionId)
  const visibleSessions = useMemo(() => sessions.filter((session) =>
    `${session.original_filename} ${session.recording_date} ${session.drone_id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [sessions, search])
  const basePath = `/scientist/datasets/${datasetId}/versions/${versionId}`
  const groupQuery = groupId ? `?groupId=${encodeURIComponent(groupId)}` : ''

  return <div className="sci-page">
    <section className="admin-card"><div className="admin-card__header"><div className="sci-dataset-session-heading">
      <ScientistBackLink to={groupId ? `/scientist/datasets/groups/${groupId}` : '/scientist/datasets'}>{groupId ? 'Dataset trong batch' : 'Tất cả batch'}</ScientistBackLink>
      <h2 className="admin-card__title">{dataset?.dataset_name || 'Recording Sessions'}</h2>
      <p className="admin-card__subtitle">Chọn một session để xem trước dữ liệu của phiên ghi hình đó.</p>
    </div><span className="sci-pill sci-pill--version">{sessions.length} session</span></div>
      <div className="sci-toolbar"><label className="sci-search"><Search size={16} /><input className="admin-input" type="search"
        aria-label="Tìm session" placeholder="Tìm theo tên file, ngày ghi hình…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="sci-toolbar__right"><Link className="btn-secondary" to={`${basePath}/train`}><FlaskConical size={14} /> Huấn luyện</Link>
          <Link className="btn-secondary" to={`${basePath}/predict`}><TrendingUp size={14} /> Dự báo</Link>
          <button type="button" className="btn-secondary" onClick={reload} disabled={isLoading}><RefreshCw size={14} /> Làm mới</button></div>
      </div></section>
    {isLoading && <div className="sci-state"><div className="sci-spinner" /> Đang tải sessions…</div>}
    {!isLoading && error && <div className="sci-state sci-state--error" role="alert">{error}</div>}
    {!isLoading && !error && visibleSessions.length === 0 && <div className="sci-state">{search ? 'Không tìm thấy session phù hợp.' : 'Dataset này chưa có session.'}</div>}
    {!isLoading && !error && visibleSessions.length > 0 && <div className="sci-overview-list sci-hierarchy-list">
      {visibleSessions.map((session) => <button type="button" key={session.session_id} className="sci-overview-row sci-hierarchy-button"
        onClick={() => navigate(`${basePath}/sessions/${session.session_id}/preview${groupQuery}`)}>
        <span className="sci-overview-row__left"><span className="sci-overview-row__avatar"><FileSpreadsheet size={22} /></span>
          <span className="sci-overview-row__info"><span className="sci-overview-row__name">{session.original_filename}</span>
            <span className="sci-overview-row__meta"><span className="sci-overview-row__meta-item"><CalendarDays size={13} /> {session.recording_date}</span>
              <span className="sci-overview-row__meta-item">{session.drone_id}</span>
              <span className="sci-overview-row__meta-item">{session.validation_status || session.upload_status}</span></span>
          </span></span><span className="sci-action-chip sci-action-chip--primary">Xem trước <ChevronRight size={15} /></span>
      </button>)}
    </div>}
  </div>
}

