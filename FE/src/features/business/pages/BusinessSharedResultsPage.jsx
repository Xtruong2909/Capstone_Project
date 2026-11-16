import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { useSharedResults, useSharedResultDetail, useSharedItemRows } from '../../../hooks/useSharedResults'
import './BusinessSharedResultsPage.css'

const PAGED_SECTIONS = new Set(['sessions', 'traffic_flow_chart', 'prediction_rows', 'forecast_results', 'forecast_chart'])
const RESOURCE_TYPES = ['DATASET', 'TRAIN_TEST', 'EXPERIMENT', 'PREDICTION']

function displayValue(value) {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function DataSection({ value }) {
  const rows = Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : null
  if (rows) {
    if (!rows.length) return <p>Chưa có dữ liệu.</p>
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    return <div className="business-table-wrap"><table><thead><tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{columns.map((col) => <td key={col}>{displayValue(row[col])}</td>)}</tr>)}</tbody></table></div>
  }
  if (value && typeof value === 'object') return <dl className="business-facts">{Object.entries(value).map(([key, entry]) =>
    <div key={key}><dt>{key}</dt><dd>{displayValue(entry)}</dd></div>)}</dl>
  return <p>{displayValue(value)}</p>
}

function SharedSection({ shareId, itemId, section, value }) {
  const [page, setPage] = useState(1)
  const isPaged = PAGED_SECTIONS.has(section)
  const { result, loading, error } = useSharedItemRows(
    isPaged ? shareId : null, itemId, isPaged ? section : null, page
  )
  const shownValue = isPaged ? result?.data : value
  return <section className="business-section">
    <h4>{section.replaceAll('_', ' ')}</h4>
    {section === 'forecast_chart' && Array.isArray(value?.historical) && <><h5>Dữ liệu quan sát</h5><DataSection value={value.historical} /></>}
    {loading ? <p>Đang tải dữ liệu…</p> : error ? <p role="alert" className="business-error">{error}</p> : <DataSection value={shownValue} />}
    {isPaged && result && <div className="business-pager">
      <span>{result.total_records} bản ghi · Trang {page}</span>
      <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button>
      <button type="button" disabled={page * result.page_size >= result.total_records} onClick={() => setPage(page + 1)}>Sau</button>
    </div>}
  </section>
}

export default function BusinessSharedResultsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [page, setPage] = useState(1)
  const [shareId, setShareId] = useState('')
  const { data, total_records: total, loading, error } = useSharedResults({ search, resourceType, page })
  const { detail, loading: detailLoading, error: detailError } = useSharedResultDetail(shareId)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return <main className="business-page">
    <header className="business-header"><div><h1>Kết quả được chia sẻ</h1><p>Xin chào {user?.full_name || 'Business User'}</p></div>
      <button type="button" onClick={handleLogout}>Đăng xuất</button></header>
    <form className="business-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()) }}>
      <input aria-label="Tìm kết quả" placeholder="Tìm theo tiêu đề" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
      <select aria-label="Loại kết quả" value={resourceType} onChange={(event) => { setPage(1); setResourceType(event.target.value) }}>
        <option value="">Tất cả loại</option>{RESOURCE_TYPES.map((type) => <option key={type}>{type}</option>)}
      </select><button type="submit">Tìm</button>
    </form>
    <div className="business-layout"><section className="business-list">
      {loading ? <p>Đang tải…</p> : error ? <p role="alert" className="business-error">{error}</p> : data.length === 0 ? <p>Chưa có kết quả nào được công bố.</p> : data.map((share) =>
        <button type="button" key={share.share_id} className={shareId === share.share_id ? 'selected' : ''} onClick={() => setShareId(share.share_id)}>
          <strong>{share.title}</strong><span>{share.available_sections.join(', ')}</span>
          <small>{share.published_at ? new Date(share.published_at).toLocaleString('vi-VN') : ''}</small>
        </button>)}
      <div className="business-pager"><span>{total} kết quả</span><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button>
        <button type="button" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Sau</button></div>
    </section><article className="business-detail">
      {!shareId ? <p>Chọn một kết quả để xem.</p> : detailLoading ? <p>Đang tải chi tiết…</p> : detailError ? <p role="alert" className="business-error">{detailError}</p> : detail && <>
        <h2>{detail.title}</h2>{detail.resources.map((resource) => <div key={resource.item_id} className="business-resource">
          <h3>{resource.resource_type}</h3>{resource.visible_sections.map((section) =>
            <SharedSection key={`${resource.item_id}:${section}`} shareId={detail.share_id} itemId={resource.item_id} section={section} value={resource.data?.[section]} />)}
        </div>)}
      </>}
    </article></div>
  </main>
}
