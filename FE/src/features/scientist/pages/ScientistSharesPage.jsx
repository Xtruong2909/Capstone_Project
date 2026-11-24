import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Eye, Inbox, Plus, Search, Share2 } from 'lucide-react'
import { useManagedResourceShares } from '../../../hooks/useResourceSharing'
import { sharingService } from '../../../services/sharingService'
import ShareSelectionModal from '../components/ShareSelectionModal'
import ShareDetailModal from '../components/ShareDetailModal'
import { extractErrorMessage } from '../utils/formatters'
import '../../business/pages/BusinessSharedResultsPage.css'
import './ScientistSharesPage.css'

const TYPES = [
  ['DATASET', 'Dataset'], ['TRAIN_TEST', 'Train/Test'],
  ['EXPERIMENT', 'Thí nghiệm'], ['PREDICTION', 'Kết quả dự báo'],
]
const TYPE_LABELS = Object.fromEntries(TYPES)
const dateOf = (value) => value ? new Date(value).toLocaleString('vi-VN') : '—'

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
            : <div className="share-table-wrap"><table className="share-table">
              <thead><tr>
                <th scope="col">Tài nguyên</th>
                <th scope="col">Loại</th>
                <th scope="col">Người nhận</th>
                <th scope="col">Ngày chia sẻ</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr></thead><tbody>
              {managed.data.map((row) => <tr key={`${row.share_id}:${row.resource_id}`}>
                <td><strong>{row.name}</strong></td>
                <td>{TYPE_LABELS[row.resource_type] || row.resource_type}</td>
                <td><div className="share-recipient-names">
                  {row.recipients?.length ? row.recipients.map((user) => (
                    <span key={user.user_id} title={user.email}>
                      {user.full_name}<small>{user.email}</small>
                    </span>
                  )) : <span>Chưa chọn người nhận</span>}
                </div></td>
                <td>{dateOf(row.shared_at)}</td>
                <td><span className={`share-status share-status--${row.status.toLowerCase()}`}>{row.status === 'PUBLISHED' ? 'Đang chia sẻ' : row.status === 'REVOKED' ? 'Đã thu hồi' : 'Bản nháp'}</span></td>
                <td><div className="share-table-actions"><button type="button" onClick={() => setDetailId(row.share_id)}><Eye size={15} /> Xem</button>{row.status === 'PUBLISHED' && <button type="button" disabled={busyId === row.share_id} onClick={() => setRevokeId(row)}>{row.item_count > 1 ? `Thu hồi gói (${row.item_count})` : 'Thu hồi'}</button>}</div></td>
              </tr>)}
            </tbody></table></div>}
      <div className="share-management__pager"><span>{managed.total_records} tài nguyên · Trang {page}</span><div><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={17} /> Trước</button><button type="button" disabled={page * 20 >= managed.total_records} onClick={() => setPage(page + 1)}>Sau <ChevronRight size={17} /></button></div></div>
    </section>
    {showCreate && <ShareSelectionModal onClose={() => setShowCreate(false)} onChanged={managed.reload} />}
    {detailId && <ShareDetailModal shareId={detailId} onClose={() => setDetailId('')} />}
    {revokeId && <div className="share-modal-backdrop" role="presentation"><section className="share-modal share-modal--confirm" role="dialog" aria-modal="true" aria-label="Xác nhận thu hồi"><h2>Thu hồi chia sẻ?</h2><p>{revokeId.item_count > 1 ? `Chia sẻ cũ này gồm ${revokeId.item_count} tài nguyên. Thu hồi sẽ ngừng quyền xem toàn bộ gói.` : 'Người dùng nghiệp vụ sẽ mất quyền xem tài nguyên này ngay sau khi thu hồi.'}</p><div><button type="button" className="share-button share-button--light" onClick={() => setRevokeId('')}>Hủy</button><button type="button" className="share-button share-button--danger" disabled={Boolean(busyId)} onClick={() => revoke(revokeId.share_id)}><Check size={16} /> Xác nhận thu hồi</button></div></section></div>}
  </div>
}
