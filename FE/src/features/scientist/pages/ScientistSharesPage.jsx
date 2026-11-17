import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Eye, Inbox, Plus, Search, Share2, X } from 'lucide-react'
import { useAvailableShareResources, useManagedResourceShares } from '../../../hooks/useResourceSharing'
import { sharingService } from '../../../services/sharingService'
import SharedResultDataSection from '../../business/components/SharedResultDataSection'
import { extractErrorMessage } from '../utils/formatters'
import '../../business/pages/BusinessSharedResultsPage.css'
import './ScientistSharesPage.css'

const TYPES = [
  ['DATASET', 'Dataset'], ['TRAIN_TEST', 'Train/Test'],
  ['EXPERIMENT', 'Thí nghiệm'], ['PREDICTION', 'Kết quả dự báo'],
]
const TYPE_LABELS = Object.fromEntries(TYPES)
const SECTION_LABELS = {
  metadata: 'Thông tin Dataset', statistics: 'Thống kê', sessions: 'Phiên ghi hình',
  traffic_flow_chart: 'Lưu lượng theo thời gian', split_summary: 'Tổng quan Train/Test',
  train_test_counts: 'Số lượng mẫu', session_distribution: 'Phân bổ phiên ghi hình',
  split_configuration: 'Cấu hình chia tập', experiment_summary: 'Tổng quan thí nghiệm',
  hyperparameters: 'Siêu tham số', evaluation_metrics: 'Chỉ số đánh giá',
  baseline_comparison: 'So sánh mô hình', prediction_rows: 'Dự báo trên tập Test',
  horizon_comparison: 'So sánh mốc dự báo', forecast_summary: 'Tổng quan dự báo',
  model_information: 'Mô hình sử dụng', lag_features: 'Đặc trưng trễ',
  forecast_results: 'Kết quả dự báo', forecast_chart: 'Biểu đồ dự báo',
}
const keyOf = (item) => `${item.resource_type}:${item.resource_id}`
const dateOf = (value) => value ? new Date(value).toLocaleString('vi-VN') : '—'

function ShareResourceModal({ onClose, onChanged }) {
  const [resourceType, setResourceType] = useState('DATASET')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState({})
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const { data, total_records: total, loading, error: listError } = useAvailableShareResources({
    resourceType, search, page, enabled: true, revision,
  })
  const selectedItems = Object.values(selected)
  const selectable = data.filter((item) => !item.is_shared)
  const allPageSelected = selectable.length > 0 && selectable.every((item) => selected[keyOf(item)])

  const toggleItem = (item) => setSelected((current) => {
    const next = { ...current }
    if (next[keyOf(item)]) delete next[keyOf(item)]
    else next[keyOf(item)] = item
    return next
  })
  const togglePage = () => setSelected((current) => {
    const next = { ...current }
    for (const item of selectable) {
      if (allPageSelected) delete next[keyOf(item)]
      else next[keyOf(item)] = item
    }
    return next
  })

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await sharingService.createBatch(
        selectedItems.map(({ resource_type, resource_id }) => ({ resource_type, resource_id })),
      )
      const failedKeys = new Set(result.results.filter((item) => !item.success).map(keyOf))
      setSelected(Object.fromEntries(selectedItems.filter((item) => failedKeys.has(keyOf(item))).map((item) => [keyOf(item), item])))
      setRevision((value) => value + 1)
      if (result.created_count) onChanged()
      if (result.failed_count) {
        setFeedback(`Đã chia sẻ ${result.created_count} tài nguyên. ${result.failed_count} mục chưa thể chia sẻ.`)
        setError(result.results.filter((item) => !item.success).map((item) => `${item.resource_type}: ${item.message}`).join(' · '))
        setConfirming(false)
      } else onClose()
    } catch (err) {
      setError(extractErrorMessage(err, 'Không thể chia sẻ tài nguyên. Vui lòng thử lại.'))
      setConfirming(false)
    } finally { setBusy(false) }
  }

  return <div className="share-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="share-modal" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
      <header className="share-modal__head">
        <div><h2 id="share-modal-title">Chia sẻ tài nguyên mới</h2><p>Chọn tài nguyên Data Scientist muốn chia sẻ cho Người dùng nghiệp vụ.</p></div>
        <button type="button" className="share-icon-button" aria-label="Đóng" disabled={busy} onClick={onClose}><X size={20} /></button>
      </header>
      <nav className="share-tabs" aria-label="Loại tài nguyên">
        {TYPES.map(([type, label]) => <button key={type} type="button" className={resourceType === type ? 'active' : ''}
          onClick={() => { setResourceType(type); setPage(1); setSearch(''); setSearchInput(''); setConfirming(false) }}>{label}</button>)}
      </nav>
      {confirming ? <div className="share-confirm">
        <h3>Xác nhận chia sẻ {selectedItems.length} tài nguyên?</h3>
        <p>Người dùng nghiệp vụ sẽ xem được các kết quả đã chọn. Bạn có thể thu hồi từng chia sẻ sau này.</p>
        <ul>{selectedItems.map((item) => <li key={keyOf(item)}>{TYPE_LABELS[item.resource_type]} · {item.name}</li>)}</ul>
      </div> : <>
        <form className="share-modal__toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()) }}>
          <label><Search size={17} /><input aria-label="Tìm tài nguyên" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tìm theo tên tài nguyên…" /></label>
          <button type="submit" className="share-button share-button--light">Tìm</button>
          <button type="button" className="share-button share-button--light" disabled={!selectable.length} onClick={togglePage}>{allPageSelected ? 'Bỏ chọn trang' : 'Chọn cả trang'}</button>
        </form>
        <div className="share-modal__results">
          {loading ? <p className="share-state">Đang tải tài nguyên…</p>
            : listError ? <p className="share-state share-error" role="alert">{listError}</p>
              : !data.length ? <p className="share-state">Không tìm thấy tài nguyên phù hợp.</p>
                : data.map((item) => <label key={keyOf(item)} className={`share-resource-option${item.is_shared ? ' is-shared' : ''}`}>
                  <input type="checkbox" disabled={item.is_shared} checked={Boolean(selected[keyOf(item)]) || item.is_shared} onChange={() => toggleItem(item)} />
                  <span><strong>{item.name}</strong><small>{TYPE_LABELS[item.resource_type]} · {dateOf(item.created_at)}</small></span>
                  {item.is_shared && <em>Đã chia sẻ</em>}
                </label>)}
        </div>
        <div className="share-modal__pager"><span>{total} tài nguyên · Trang {page}</span><div>
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Trang trước"><ChevronLeft size={18} /></button>
          <button type="button" disabled={page * 12 >= total} onClick={() => setPage(page + 1)} aria-label="Trang sau"><ChevronRight size={18} /></button>
        </div></div>
      </>}
      {feedback && <p className="share-feedback">{feedback}</p>}
      {error && <p className="share-error" role="alert">{error}</p>}
      <footer className="share-modal__foot"><div className="share-modal__selection"><strong>Đã chọn: {selectedItems.length}</strong>{selectedItems.length > 0 && <button type="button" disabled={busy} onClick={() => { setSelected({}); setConfirming(false) }}>Bỏ chọn</button>}</div><div>
        <button type="button" className="share-button share-button--light" disabled={busy} onClick={() => confirming ? setConfirming(false) : onClose()}>{confirming ? 'Quay lại' : 'Hủy'}</button>
        <button type="button" className="share-button share-button--primary" disabled={!selectedItems.length || busy} onClick={() => confirming ? submit() : setConfirming(true)}>{busy ? 'Đang chia sẻ…' : confirming ? 'Xác nhận chia sẻ' : 'Tiếp tục'}</button>
      </div></footer>
    </section>
  </div>
}

function ShareDetailModal({ shareId, onClose }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    sharingService.getManaged(shareId).then((value) => { if (!cancelled) setDetail(value) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được chi tiết chia sẻ.')) })
    return () => { cancelled = true }
  }, [shareId])
  return <div className="share-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="share-modal share-modal--detail" role="dialog" aria-modal="true" aria-label="Chi tiết chia sẻ">
      <header className="share-modal__head"><div><h2>Chi tiết chia sẻ</h2><p>{detail?.title || 'Đang tải…'}</p></div><button type="button" className="share-icon-button" aria-label="Đóng" onClick={onClose}><X size={20} /></button></header>
      {error && <p className="share-error" role="alert">{error}</p>}
      {detail?.resources.map((resource) => <div className="share-detail-resource" key={resource.item_id}>
        <h3>{TYPE_LABELS[resource.resource_type]} · {resource.resource_id}</h3>
        {resource.visible_sections.map((section) => <details key={section}><summary>{SECTION_LABELS[section] || section.replaceAll('_', ' ')}</summary><div className="share-detail-section"><SharedResultDataSection section={section} value={resource.data?.[section]} /></div></details>)}
      </div>)}
    </section>
  </div>
}

export default function ScientistSharesPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState('')
  const [revokeId, setRevokeId] = useState('')
  const [busyId, setBusyId] = useState('')
  const [actionError, setActionError] = useState('')
  const managed = useManagedResourceShares({ search, resourceType, status, page })

  const revoke = async (shareId) => {
    setBusyId(shareId)
    setActionError('')
    try { await sharingService.revoke(shareId); setRevokeId(''); managed.reload() }
    catch (err) { setActionError(extractErrorMessage(err, 'Không thể thu hồi chia sẻ.')) }
    finally { setBusyId('') }
  }

  return <div className="sci-page share-management">
    <header className="share-management__hero"><div className="share-management__hero-icon"><Share2 size={26} /></div><div>
      <span>QUẢN LÝ TÀI NGUYÊN</span><h1>Quản lý chia sẻ</h1>
      <p>Chọn chính xác dữ liệu và kết quả cho Người dùng nghiệp vụ xem.</p>
    </div><button type="button" className="share-button share-button--primary" onClick={() => setShowCreate(true)}><Plus size={18} /> Chia sẻ mới</button></header>

    <div className="share-stats">
      <div><span>Đang chia sẻ</span><strong>{managed.active_count}</strong></div>
      <div><span>Chưa chia sẻ</span><strong>{managed.unshared_count}</strong></div>
      <div><span>Đã thu hồi</span><strong>{managed.revoked_count}</strong></div>
    </div>

    <section className="share-management__card"><div className="share-management__card-head"><div><h2>Tài nguyên đã quản lý</h2><p>Danh sách được sắp xếp theo thời gian chia sẻ mới nhất.</p></div></div>
      <form className="share-management__filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()) }}>
        <label className="share-search"><Search size={17} /><input aria-label="Tìm chia sẻ" placeholder="Tìm tài nguyên…" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
        <select aria-label="Lọc loại tài nguyên" value={resourceType} onChange={(event) => { setResourceType(event.target.value); setPage(1) }}><option value="">Tất cả loại</option>{TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select>
        <select aria-label="Lọc trạng thái" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="">Tất cả trạng thái</option><option value="PUBLISHED">Đang chia sẻ</option><option value="REVOKED">Đã thu hồi</option><option value="DRAFT">Bản nháp cũ</option></select>
        <button type="submit" className="share-button share-button--light">Tìm</button>
      </form>
      {actionError && <p className="share-error" role="alert">{actionError}</p>}
      {managed.loading ? <p className="share-state">Đang tải chia sẻ…</p>
        : managed.error ? <p className="share-state share-error" role="alert">{managed.error}</p>
          : !managed.data.length ? <div className="share-empty"><Inbox size={30} /><h3>Chưa có tài nguyên phù hợp</h3><p>Chọn “Chia sẻ mới” để bắt đầu hoặc đổi bộ lọc.</p></div>
            : <div className="share-table-wrap"><table className="share-table"><thead><tr><th>Tài nguyên</th><th>Loại</th><th>Ngày chia sẻ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
              {managed.data.map((row) => <tr key={`${row.share_id}:${row.resource_id}`}><td><strong>{row.name}</strong></td><td>{TYPE_LABELS[row.resource_type] || row.resource_type}</td><td>{dateOf(row.shared_at)}</td><td><span className={`share-status share-status--${row.status.toLowerCase()}`}>{row.status === 'PUBLISHED' ? 'Đang chia sẻ' : row.status === 'REVOKED' ? 'Đã thu hồi' : 'Bản nháp'}</span></td><td><div className="share-table-actions"><button type="button" onClick={() => setDetailId(row.share_id)}><Eye size={15} /> Xem</button>{row.status === 'PUBLISHED' && <button type="button" disabled={busyId === row.share_id} onClick={() => setRevokeId(row)}>{row.item_count > 1 ? `Thu hồi gói (${row.item_count})` : 'Thu hồi'}</button>}</div></td></tr>)}
            </tbody></table></div>}
      <div className="share-management__pager"><span>{managed.total_records} tài nguyên · Trang {page}</span><div><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={17} /> Trước</button><button type="button" disabled={page * 20 >= managed.total_records} onClick={() => setPage(page + 1)}>Sau <ChevronRight size={17} /></button></div></div>
    </section>
    {showCreate && <ShareResourceModal onClose={() => setShowCreate(false)} onChanged={managed.reload} />}
    {detailId && <ShareDetailModal shareId={detailId} onClose={() => setDetailId('')} />}
    {revokeId && <div className="share-modal-backdrop" role="presentation"><section className="share-modal share-modal--confirm" role="dialog" aria-modal="true" aria-label="Xác nhận thu hồi"><h2>Thu hồi chia sẻ?</h2><p>{revokeId.item_count > 1 ? `Chia sẻ cũ này gồm ${revokeId.item_count} tài nguyên. Thu hồi sẽ ngừng quyền xem toàn bộ gói.` : 'Người dùng nghiệp vụ sẽ mất quyền xem tài nguyên này ngay sau khi thu hồi.'}</p><div><button type="button" className="share-button share-button--light" onClick={() => setRevokeId('')}>Hủy</button><button type="button" className="share-button share-button--danger" disabled={Boolean(busyId)} onClick={() => revoke(revokeId.share_id)}><Check size={16} /> Xác nhận thu hồi</button></div></section></div>}
  </div>
}
