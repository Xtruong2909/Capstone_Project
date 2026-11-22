import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useDatasetPreview } from '../../../hooks/useScientistData'
import { formatBytes, formatNumber } from '../utils/formatters'

export default function ScientistDatasetPreviewPage() {
  const { datasetId, fileId, sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const groupId = searchParams.get('groupId')
  const groupQuery = groupId ? `?groupId=${encodeURIComponent(groupId)}` : ''
  const basePath = `/scientist/datasets/${datasetId}/files/${fileId}`
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const pendingScrollPosition = useRef(null)
  const { preview, isLoading, error, reload } = useDatasetPreview(datasetId, fileId, {
    sessionId, page, pageSize, representation: 'normalized',
  })
  const columns = preview?.columns || []
  const rows = preview?.rows || []
  const pagination = preview?.pagination
  const totalRows = pagination?.total_rows
  const visibleWarnings = (preview?.warnings || []).filter((warning) =>
    !warning.startsWith('Đã bỏ qua ô rỗng cuối dòng'))

  useLayoutEffect(() => {
    if (pendingScrollPosition.current == null) return
    window.scrollTo({ top: pendingScrollPosition.current, left: window.scrollX, behavior: 'instant' })
    pendingScrollPosition.current = null
  }, [page])

  const changePage = (nextPage) => {
    pendingScrollPosition.current = window.scrollY
    setPage(nextPage)
  }

  return <div className="sci-page">
    <Link className="sci-back" to={`${basePath}${groupQuery}`}><ArrowLeft size={16} /> Quay lại danh sách sessions</Link>
    <section className="admin-card" style={{ marginTop: '1rem' }}>
      <div className="admin-card__header"><div>
        <h2 className="admin-card__title">{preview?.dataset_name || 'Xem trước Recording Session'}</h2>
        <p className="admin-card__subtitle">{preview?.original_filename || `Session ${sessionId}`}</p>
      </div></div>
      <div className="sci-card-body">
        <div className="sci-params-bar">
          <span>Session: {sessionId}</span>
          <div className="sci-params-bar__actions">
            <button type="button" className="btn-secondary" onClick={reload} disabled={isLoading}><RefreshCw size={14} /> Làm mới</button>
          </div>
        </div>
        {isLoading && <div className="sci-state"><div className="sci-spinner" /> Đang tải preview…</div>}
        {!isLoading && error && <div className="sci-state sci-state--error" role="alert">{error}</div>}
        {!isLoading && !error && preview && <>
          <div className="sci-meta"><span>Định dạng: {preview.file_format?.toUpperCase()}</span>
            <span>Kích thước: {formatBytes(preview.file_size)}</span>
            <span>Số cột: {preview.total_columns ?? columns.length}</span>
            <span>Số dòng: {totalRows == null ? 'Chưa xác định' : formatNumber(totalRows)}</span></div>
          {visibleWarnings.map((warning, index) => <div className="sci-warning" key={index}>{warning}</div>)}
          <div className="sci-preview-columns"><strong>Cấu trúc cột</strong><div className="sci-chips">
            {columns.map((column) => <span className="sci-chip" data-type={column.type?.toLowerCase()} key={column.name}>
              <span className="sci-chip__name" title={column.name}>{column.name}</span><small>{column.type}</small>
            </span>)}
          </div></div>
          {rows.length === 0 ? <div className="sci-state">Session này chưa có dòng dữ liệu để xem trước.</div> : <>
            <div className="sci-table-wrap"><table className="sci-table"><thead><tr><th>#</th>{columns.map((column) => <th key={column.name}>{column.name}</th>)}</tr></thead>
              <tbody>{rows.map((row, index) => <tr key={`${page}:${index}`}><td>{(page - 1) * pageSize + index + 1}</td>
                {columns.map((column) => <td key={column.name}>{row[column.name] == null ? '—' : String(row[column.name])}</td>)}</tr>)}</tbody></table></div>
            <div className="sci-pager"><div className="sci-pager__summary"><label htmlFor="sci-page-size">Dòng/trang</label>
              <select id="sci-page-size" className="sci-dataset-select" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
                {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select><span>Trang {page}{totalRows != null ? ` / ${Math.max(1, Math.ceil(totalRows / pageSize))}` : ''}</span></div>
              <div className="sci-pager__controls"><button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}><ChevronLeft size={14} /> Trước</button>
                <button type="button" className="btn-secondary" disabled={!pagination?.has_more} onClick={() => changePage(page + 1)}>Sau <ChevronRight size={14} /></button></div></div>
          </>}
        </>}
      </div>
    </section>
  </div>
}
