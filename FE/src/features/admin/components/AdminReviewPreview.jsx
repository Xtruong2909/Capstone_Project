import { useAdminReviewPreview } from '../../../hooks/useAdminDatasetReview'
import { AdminBadge, AdminModal, AdminState } from './AdminUi'

const types = { integer: 'Số nguyên', float: 'Số thực', string: 'Văn bản', boolean: 'Đúng / sai' }
const count = (value) => Number(value).toLocaleString('vi-VN')

export default function AdminReviewPreview({ item, onClose }) {
  const data = useAdminReviewPreview(item)
  const preview = data.preview.data
  const pagination = preview?.pagination
  return <AdminModal title={`Kiểm tra dữ liệu · ${item.name}`} onClose={onClose} className="admin-dataset-dialog admin-review-preview">
    <div className="admin-review-preview__toolbar"><span>Batch: {item.group_name || '—'} · {item.total_sessions} phiên ghi hình</span><AdminBadge value={item.approval_status} /></div>
    <AdminState resource={data.sessions}>
      {data.sessions.data?.sessions.length > 0 ? <div className="admin-review-preview__sessions">
        <label>Tệp phiên ghi hình<select className="admin-select" value={data.session?.session_id || ''} onChange={(event) => data.setSession(event.target.value)}>
          {data.sessions.data.sessions.map((session) => <option key={session.session_id} value={session.session_id}>{session.original_filename}</option>)}
        </select></label>
        {data.sessions.data.total > 10 && <div className="admin-actions">
          <button type="button" className="btn-secondary" disabled={data.sessions.loading || data.sessionPage <= 1} onClick={() => data.setSessionPage(data.sessionPage - 1)}>Tệp trước</button>
          <span>Trang tệp {data.sessionPage} / {Math.ceil(data.sessions.data.total / 10)}</span>
          <button type="button" className="btn-secondary" disabled={data.sessions.loading || data.sessionPage * 10 >= data.sessions.data.total} onClick={() => data.setSessionPage(data.sessionPage + 1)}>Tệp tiếp</button>
        </div>}
      </div> : <p>Không có phiên ghi hình được liên kết với tập dữ liệu này.</p>}
    </AdminState>
    {data.session && <AdminState resource={data.preview}>
      {preview && <>
        <div className="admin-review-preview__meta"><strong>{preview.original_filename}</strong><span>{preview.representation === 'normalized' ? 'Dữ liệu đã chuẩn hóa' : 'Dữ liệu gốc'}</span><span>{preview.columns.length} cột</span></div>
        <div className="admin-table-scroll"><table className="admin-table">
          <thead><tr><th>STT</th>{preview.columns.map((column) => <th key={column.name}><code>{column.name}</code><small className="admin-cell-note">{types[column.type] || column.type}</small></th>)}</tr></thead>
          <tbody>{preview.rows.map((row, index) => <tr key={index}><td>{((pagination?.page || data.page) - 1) * (pagination?.page_size || 10) + index + 1}</td>{preview.columns.map((column) => <td key={column.name}>{row[column.name] == null ? '—' : typeof row[column.name] === 'object' ? JSON.stringify(row[column.name]) : String(row[column.name])}</td>)}</tr>)}</tbody>
        </table>{preview.rows.length === 0 && <p className="empty-state">Tệp không có dòng dữ liệu để hiển thị.</p>}</div>
        <nav className="admin-pagination" aria-label="Phân trang dữ liệu xem trước">
          <span>Trang {pagination?.page || data.page} · Hiển thị {pagination?.returned_rows ?? preview.rows.length} dòng{pagination?.total_rows != null ? ` / ${count(pagination.total_rows)} dòng` : ''}</span>
          <div className="admin-actions"><button type="button" className="btn-secondary" disabled={data.preview.loading || data.page <= 1} onClick={() => data.setPage(data.page - 1)}>Trước</button><button type="button" className="btn-secondary" disabled={data.preview.loading || !pagination?.has_more} onClick={() => data.setPage(data.page + 1)}>Tiếp</button></div>
        </nav>
        {(data.columnOffset > 0 || preview.has_more_columns) && <div className="admin-pagination"><span>Cột {data.columnOffset + 1}–{data.columnOffset + preview.columns.length} / {preview.total_columns}</span><div className="admin-actions"><button type="button" className="btn-secondary" disabled={data.columnOffset === 0} onClick={data.previousColumns}>Cột trước</button><button type="button" className="btn-secondary" disabled={!preview.has_more_columns} onClick={data.nextColumns}>Cột tiếp</button></div></div>}
      </>}
    </AdminState>}
    <div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Đóng</button></div>
  </AdminModal>
}
