import { ArrowLeft, Clock, Database, Eye, FolderOpen, Layers, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useAdminDatasetReview } from '../../../hooks/useAdminDatasetReview'
import { AdminBadge, AdminFeedback, AdminModal, AdminPagination, AdminState } from '../components/AdminUi'
import AdminReviewPreview from '../components/AdminReviewPreview'

const count = (value) => Number(value).toLocaleString('vi-VN')

export default function AdminDatasetsPage() {
  const queue = useAdminDatasetReview()
  const cards = [
    [Layers, queue.groups.length, 'Batch chờ xét duyệt', 'purple'],
    [Clock, queue.groups.reduce((sum, item) => sum + item.submitted_datasets, 0), 'Tập dữ liệu chờ phê duyệt', 'amber'],
    [Database, queue.groups.reduce((sum, item) => sum + item.total_datasets, 0), 'Tập dữ liệu trong các batch', 'blue'],
  ]
  return <div className="adm-page">
    <div className="adm-bento-grid">{cards.map(([Icon, value, label, tone]) => <div className="adm-panel adm-col-4" key={label}><div className="adm-panel__body admin-review-kpi"><div className={`adm-panel__icon adm-tone--${tone}`}><Icon size={20} /></div><div><strong>{queue.resource.loading ? '…' : count(value)}</strong><span>{label}</span></div></div></div>)}</div>
    {!queue.review && <AdminFeedback mutation={queue.mutation} />}
    <div className="adm-toolbar">
      {queue.groupId ? <button type="button" className="adm-btn adm-btn--ghost" onClick={() => queue.openGroup(null)}><ArrowLeft size={16} />Danh sách batch</button>
        : <div className="adm-search-box"><Search size={16} className="adm-search-box__icon" /><input className="adm-input adm-input--search" type="search" value={queue.search} onChange={(event) => queue.setSearch(event.target.value)} placeholder="Tìm kiếm batch" aria-label="Tìm kiếm batch" /></div>}
      <button type="button" className="adm-btn adm-btn--primary" disabled={queue.resource.loading || queue.resource.refreshing || queue.mutation.busy} onClick={queue.reload}><RefreshCw size={15} />Làm mới</button>
    </div>
    <section className="adm-panel">
      <div className="adm-panel__header"><div className="adm-panel__title-group"><div className="adm-panel__icon adm-tone--amber"><ShieldCheck size={18} /></div><h3 className="adm-panel__title">{queue.group ? `Batch: ${queue.group.group_name || queue.group.drone_id}` : `Batch chờ phê duyệt (${queue.total})`}</h3></div>
        {queue.group && <div className="admin-actions"><button type="button" className="adm-btn adm-btn--danger adm-btn--sm" disabled={queue.mutation.busy} onClick={() => queue.openReview(queue.group, 'REJECTED')}>Từ chối batch</button><button type="button" className="adm-btn adm-btn--emerald adm-btn--sm" disabled={queue.mutation.busy} onClick={() => queue.openReview(queue.group, 'APPROVED')}>Phê duyệt batch</button></div>}
      </div>
      <AdminState resource={queue.resource}>
        {queue.groupId ? queue.group ? <AdminState resource={queue.datasets}>
          <div className="adm-panel__body"><p className="admin-cell-note">Kiểm tra các phiên ghi hình trước khi xét duyệt. Quyết định áp dụng cho {count(queue.group.submitted_datasets)} tập dữ liệu đang chờ trong batch.</p></div>
          <div className="adm-table-wrap"><table className="adm-table"><thead><tr>{['Tập dữ liệu', 'Thiết bị ghi hình', 'Ngày ghi hình', 'Phiên ghi hình', 'Trạng thái', 'Kiểm tra dữ liệu'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{queue.datasets.data?.datasets.map((item) => <tr key={item.dataset_id}><td><strong>{item.name}</strong></td><td>{item.drone_id}</td><td>{item.recording_date}</td><td>{count(item.total_sessions)}</td><td><AdminBadge value={item.approval_status} /></td><td><button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => queue.openPreview({ ...item, group_id: queue.group.group_id })}><Eye size={14} />Xem phiên ghi hình</button></td></tr>)}</tbody>
          </table></div>
          {queue.datasets.data?.datasets.length === 0 && <p className="adm-empty">Batch chưa có tập dữ liệu để hiển thị.</p>}
        </AdminState> : <div className="adm-empty"><h4>Batch không còn trong danh sách chờ duyệt</h4><p>Hãy quay lại danh sách hoặc làm mới để xem trạng thái hiện tại.</p></div>
          : queue.items.length ? <div className="adm-table-wrap"><table className="adm-table"><thead><tr>{['Batch', 'Thiết bị ghi hình', 'Tập dữ liệu', 'Chờ phê duyệt', 'Đã duyệt', 'Đã từ chối', 'Thao tác'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{queue.items.map((item) => <tr key={item.group_id}><td><strong>{item.group_name || 'Batch chưa đặt tên'}</strong></td><td>{item.drone_id}</td><td>{count(item.total_datasets)}</td><td><span className="adm-badge adm-badge--amber">{count(item.submitted_datasets)} chờ duyệt</span></td><td>{count(item.approved_datasets)}</td><td>{count(item.rejected_datasets)}</td><td><div className="admin-actions"><button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={() => queue.openGroup(item)}><FolderOpen size={14} />Xem tập dữ liệu</button><button type="button" className="adm-btn adm-btn--emerald adm-btn--sm" disabled={queue.mutation.busy} onClick={() => queue.openReview(item, 'APPROVED')}>Phê duyệt</button><button type="button" className="adm-btn adm-btn--danger adm-btn--sm" disabled={queue.mutation.busy} onClick={() => queue.openReview(item, 'REJECTED')}>Từ chối</button></div></td></tr>)}</tbody>
          </table></div> : <div className="adm-empty"><h4>Không có batch chờ phê duyệt</h4><p>Các batch đã gửi xét duyệt sẽ xuất hiện tại đây.</p></div>}
      </AdminState>
      {!queue.groupId && <AdminPagination page={queue.page} pageSize={queue.pageSize} total={queue.total} setPage={queue.setPage} setPageSize={queue.setPageSize} loading={queue.resource.loading} />}
    </section>
    {queue.previewItem && <AdminReviewPreview key={`${queue.previewItem.group_id}:${queue.previewItem.dataset_id}`} item={queue.previewItem} onClose={queue.closePreview} />}
    {queue.review && <AdminModal title={`${queue.review.status === 'APPROVED' ? 'Phê duyệt' : 'Từ chối'} batch · ${queue.review.item.group_name || queue.review.item.drone_id}`} className="admin-batch-review-dialog" onClose={queue.closeReview} busy={queue.mutation.busy}>
      <form onSubmit={queue.confirmReview} noValidate>
        <p>Quyết định này áp dụng cho {count(queue.review.item.submitted_datasets)} tập dữ liệu đang chờ phê duyệt trong batch.</p>
        <AdminFeedback mutation={queue.mutation} />
        <label className="form-field">Ghi chú<textarea className="admin-input" rows={4} maxLength={2000} disabled={queue.mutation.busy} value={queue.note} onChange={(event) => queue.setNote(event.target.value)} placeholder="Nhập ghi chú đánh giá (không bắt buộc)" /></label>
        <div className="modal-actions"><button type="button" className="btn-secondary" disabled={queue.mutation.busy} onClick={queue.closeReview}>Hủy</button><button type="submit" className="btn-action btn-action--primary" disabled={queue.mutation.busy}>{queue.mutation.busy ? 'Đang gửi...' : 'Xác nhận'}</button></div>
      </form>
    </AdminModal>}
  </div>
}
