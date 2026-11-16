import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Database, FlaskConical, FolderOpen, Layers, RefreshCw, Search, ShieldCheck, TrendingUp } from 'lucide-react'
import { useApprovedGroups, useGroupDatasets } from '../../../hooks/useScientistData'
import ScientistBackLink from '../components/ScientistBackLink'

export default function ScientistApprovedDatasetsPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { groups, isLoading: groupsLoading, error: groupsError, reload: reloadGroups } = useApprovedGroups()
  const { datasets, isLoading: datasetsLoading, error: datasetsError, reload: reloadDatasets } = useGroupDatasets(groupId)
  const group = groups.find((item) => item.group_id === groupId)
  const loading = groupId ? groupsLoading || datasetsLoading : groupsLoading
  const error = groupId ? groupsError || datasetsError : groupsError
  const visibleGroups = useMemo(() => groups.filter((item) =>
    `${item.group_name || ''} ${item.source || ''} ${item.drone_id || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [groups, search])
  const visibleDatasets = useMemo(() => datasets.filter((item) =>
    `${item.dataset_name} ${item.drone_id || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [datasets, search])

  return <div className="sci-page">
    <section className="admin-card">
      <div className="admin-card__header"><div>
        {groupId && <ScientistBackLink to="/scientist/datasets">Tất cả batch</ScientistBackLink>}
        <h2 className="admin-card__title">{groupId ? group?.group_name || 'Dataset trong batch' : 'Các batch đã được phê duyệt'}</h2>
        <p className="admin-card__subtitle">{groupId ? 'Chọn dataset để xem các Recording Session.' : 'Chọn một batch để xem các dataset đã được duyệt.'}</p>
      </div><span className="sci-pill sci-pill--version">{groupId ? datasets.length : groups.length} {groupId ? 'dataset' : 'batch'}</span></div>
      <div className="sci-toolbar"><label className="sci-search"><Search size={16} />
        <input className="admin-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder={groupId ? 'Tìm dataset…' : 'Tìm batch…'} aria-label={groupId ? 'Tìm dataset' : 'Tìm batch'} />
      </label><button type="button" className="btn-secondary" onClick={groupId ? reloadDatasets : reloadGroups} disabled={loading}><RefreshCw size={14} /> Làm mới</button></div>
    </section>

    {loading && <div className="sci-state"><div className="sci-spinner" /> Đang tải…</div>}
    {!loading && error && <div className="sci-state sci-state--error" role="alert">{error}</div>}
    {!loading && !error && groupId && !group && <div className="sci-state sci-state--error">Batch này không có trong danh sách được cấp quyền.</div>}
    {!loading && !error && (!groupId || group) && (!groupId ? visibleGroups.length === 0 : visibleDatasets.length === 0) &&
      <div className="sci-state">{search ? 'Không tìm thấy kết quả phù hợp.' : groupId ? 'Batch này chưa có dataset được duyệt.' : 'Bạn chưa được cấp quyền truy cập batch nào.'}</div>}

    {!loading && !error && !groupId && visibleGroups.length > 0 && <div className="sci-overview-list sci-hierarchy-list">
      {visibleGroups.map((item) => <div key={item.group_id} className="sci-overview-row sci-hierarchy-button">
        <Link className="sci-overview-row__left sci-batch-main-link" to={`/scientist/datasets/groups/${item.group_id}`} onClick={() => setSearch('')}><span className="sci-overview-row__avatar"><FolderOpen size={22} /></span>
          <span className="sci-overview-row__info"><span className="sci-overview-row__title-line"><span className="sci-overview-row__name">{item.group_name || `Batch ${item.group_id.slice(0, 8)}`}</span>
            <span className="sci-pill sci-pill--approved"><ShieldCheck size={12} /> Đã duyệt</span></span>
            <span className="sci-overview-row__meta"><span className="sci-overview-row__meta-item"><Database size={13} /> {item.approved_datasets} dataset đã duyệt</span>
              <span className="sci-overview-row__meta-item"><Layers size={13} /> {item.source}</span></span>
          </span></Link><span className="sci-batch-actions">
            <span className="sci-mode-switch">
              <Link className="sci-mode-switch__btn sci-mode-switch__btn--train" to={`/scientist/datasets/groups/${item.group_id}/train`}><FlaskConical size={14} /> Huấn luyện</Link>
              <Link className="sci-mode-switch__btn sci-mode-switch__btn--predict" to={`/scientist/datasets/groups/${item.group_id}/predict`}><TrendingUp size={14} /> Dự báo</Link>
            </span>
            <Link className="sci-action-chip sci-action-chip--primary" to={`/scientist/datasets/groups/${item.group_id}`} onClick={() => setSearch('')}>Xem datasets <ChevronRight size={15} /></Link>
          </span>
      </div>)}
    </div>}

    {!loading && !error && groupId && group && visibleDatasets.length > 0 && <div className="sci-overview-list sci-hierarchy-list">
      {visibleDatasets.map((item) => <button type="button" key={item.version_id} className="sci-overview-row sci-hierarchy-button"
        onClick={() => navigate(`/scientist/datasets/${item.dataset_id}/versions/${item.version_id}?groupId=${groupId}`)}>
        <span className="sci-overview-row__left"><span className="sci-overview-row__avatar"><Database size={22} /></span>
          <span className="sci-overview-row__info"><span className="sci-overview-row__name">{item.dataset_name}</span>
            <span className="sci-overview-row__meta"><span className="sci-overview-row__meta-item">{item.total_sessions} session</span>
              <span className="sci-overview-row__meta-item">{item.recording_date || 'Chưa có ngày ghi hình'}</span></span>
          </span></span><span className="sci-action-chip sci-action-chip--primary">Xem sessions <ChevronRight size={15} /></span>
      </button>)}
    </div>}
  </div>
}

