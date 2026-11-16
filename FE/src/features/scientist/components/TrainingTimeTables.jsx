import { BarChart3, CarFront, ChevronLeft, ChevronRight, Clock3, RefreshCw, Table2 } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { formatNumber, formatRecordingDateTime, formatRecordingTime } from '../utils/formatters'
import { sortRecordingSessions } from '../utils/sortRecordingSessions'

function shortId(value) {
  return value ? String(value).slice(0, 8) : '—'
}

function formatRecordingDate(value) {
  const [year, month, day] = String(value).split('-')
  return year && month && day ? `${day}/${month}/${year}` : String(value)
}

export function AggregationTimeTable({ aggregationId, groupId, result, sessions, sessionsById, sessionId, setSessionId, isLoading, error, reload }) {
  const rows = result?.data || []
  const orderedSessions = sortRecordingSessions(sessions, sessionsById)
  const selectedIndex = orderedSessions.findIndex((session) => session.session_id === sessionId)

  return <div className="sci-training-table-block">
    <div className="sci-training-table-heading"><div className="sci-training-table-heading__title"><Table2 size={18} /><div>
      <h3>Bảng dữ liệu theo mốc 1 phút</h3>
      <p>Chọn session để xem số lượng phương tiện theo từng phút.</p>
    </div></div><div className="sci-training-table-heading__actions">
      {sessionId && aggregationId && <Link className="sci-training-button sci-training-button--chart" to={`/scientist/datasets/groups/${groupId}/train/aggregation-charts?aggregationId=${encodeURIComponent(aggregationId)}&sessionId=${encodeURIComponent(sessionId)}&sessionName=${encodeURIComponent(sessionsById[sessionId]?.original_filename || '')}`}><BarChart3 size={15} /> Xem biểu đồ</Link>}
      <button type="button" className="sci-training-button sci-training-button--secondary" onClick={reload} disabled={isLoading || !sessionId}><RefreshCw size={14} /> Làm mới bảng</button>
    </div></div>
    <label className="sci-training-session-picker">Chọn session
      <select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
        <option value="">Chọn một session để xem bảng</option>
        {orderedSessions.map((session, index) => <option key={session.session_id} value={session.session_id}>
          {sessionsById[session.session_id]?.original_filename || `Phiên ${index + 1}`}
        </option>)}
      </select>
    </label>
    {!sessionId && <div className="sci-training-table-state">Chọn session ở trên để xem dữ liệu theo thời gian.</div>}
    {error && <div role="alert" className="sci-training-alert">{error}</div>}
    {isLoading && <div className="sci-training-table-state">Đang tải các mốc thời gian…</div>}
    {!isLoading && !error && sessionId && result && rows.length === 0 && <div className="sci-training-table-state">Session này chưa có dữ liệu theo phút.</div>}
    {!isLoading && !error && rows.length > 0 && <>
      <div className="sci-training-table-scroll"><table className="sci-training-table sci-training-table--aggregation"><thead><tr>
        <th scope="col"><span className="sci-training-column-title"><Clock3 size={16} /> Giờ</span></th>
        <th scope="col"><span className="sci-training-column-title"><CarFront size={16} /> Số lượng phương tiện</span></th>
      </tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.session_id}:${row.timestamp}`}>
          <td>{formatRecordingTime(row.timestamp)}</td>
          <td><strong>{formatNumber(row.vehicle_count)}</strong></td>
        </tr>)}</tbody></table></div>
    </>}
    {selectedIndex >= 0 && <div className="sci-training-table-footer">
      <span>Session {selectedIndex + 1}/{orderedSessions.length}{result && !error && !isLoading ? ` · ${formatNumber(result.total_records)} mốc thời gian` : ''}</span>
      <div>
        <button type="button" className="sci-training-button sci-training-button--secondary" disabled={selectedIndex === 0} onClick={() => setSessionId(orderedSessions[selectedIndex - 1].session_id)}><ChevronLeft size={15} /> Session trước</button>
        <button type="button" className="sci-training-button sci-training-button--secondary" disabled={selectedIndex === orderedSessions.length - 1} onClick={() => setSessionId(orderedSessions[selectedIndex + 1].session_id)}>Session sau <ChevronRight size={15} /></button>
      </div>
    </div>}
  </div>
}

export function FeaturePreviewTable({ result, sessionsById, page, setPage, isLoading, error, reload }) {
  const rows = result?.data || []
  const totalPages = Math.max(1, result?.total_pages || 1)
  const recordingDates = result?.recording_dates || []
  const pendingScrollPosition = useRef(null)

  useLayoutEffect(() => {
    if (pendingScrollPosition.current == null) return
    window.scrollTo({ top: pendingScrollPosition.current, left: window.scrollX, behavior: 'instant' })
    pendingScrollPosition.current = null
  }, [page])

  const changePage = (nextPage) => {
    pendingScrollPosition.current = window.scrollY
    setPage(nextPage)
  }

  return <div className="sci-training-table-block">
    <div className="sci-training-table-heading"><div className="sci-training-table-heading__title"><Table2 size={18} /><div>
      <h3>Bảng lag features và giá trị dự báo</h3>
      <p>Mỗi trang tối đa 2 ngày ghi hình · Lag 1–5 là các phút trước; +1, +3, +5 là mốc cần dự báo.</p>
    </div></div><button type="button" className="sci-training-button sci-training-button--secondary" onClick={reload} disabled={isLoading}><RefreshCw size={14} /> Làm mới bảng</button></div>
    {error && <div role="alert" className="sci-training-alert">{error}</div>}
    {isLoading && <div className="sci-training-table-state">Đang tải lag features…</div>}
    {!isLoading && !error && result && rows.length === 0 && <div className="sci-training-table-state">Chưa có mẫu lag features để hiển thị.</div>}
    {!isLoading && !error && rows.length > 0 && <>
      <div className="sci-training-table-scroll sci-training-features-scroll"><table className="sci-training-table sci-training-table--features"><thead><tr>
        <th scope="col">Session</th><th scope="col">Thời gian</th>
        {[1, 2, 3, 4, 5].map((lag) => <th scope="col" key={`lag-${lag}`}>Lag {lag}</th>)}
        {[1, 3, 5].map((horizon) => <th scope="col" key={`target-${horizon}`}>+{horizon} phút</th>)}
      </tr></thead><tbody>{rows.map((row) => <tr key={`${row.session_id}:${row.timestamp}`}>
        <td title={sessionsById[row.session_id]?.original_filename}>{sessionsById[row.session_id]?.original_filename || 'Phiên chưa xác định'}</td>
        <td>{formatRecordingDateTime(row.timestamp)}</td>
        {[1, 2, 3, 4, 5].map((lag) => <td key={`lag-${lag}`}>{formatNumber(row[`lag_${lag}`])}</td>)}
        {[1, 3, 5].map((horizon) => <td key={`target-${horizon}`}><strong>{formatNumber(row[`target_h${horizon}`])}</strong></td>)}
      </tr>)}</tbody></table></div>
      <div className="sci-training-table-footer"><span>
        {recordingDates.length ? `${recordingDates.map(formatRecordingDate).join(' · ')} · ` : ''}
        {formatNumber(rows.length)} mẫu trên trang · Trang {page}/{totalPages}
      </span><div>
        <button type="button" className="sci-training-button sci-training-button--secondary" disabled={page <= 1 || isLoading} onClick={() => changePage(page - 1)}><ChevronLeft size={15} /> Trước</button>
        <button type="button" className="sci-training-button sci-training-button--secondary" disabled={page >= totalPages || isLoading} onClick={() => changePage(page + 1)}>Sau <ChevronRight size={15} /></button>
      </div></div>
    </>}
  </div>
}

export function ChronologicalSplitTable({ split, datasets, sessionsById }) {
  const names = new Map(datasets.map((item) => [item.dataset_id, item.dataset_name]))
  const rows = [
    ...(split.train_sessions || []).map((item) => ({ ...item, partition: 'Train' })),
    ...(split.test_sessions || []).map((item) => ({ ...item, partition: 'Test' })),
  ].sort((left, right) => String(left.recording_date).localeCompare(String(right.recording_date)))

  return <div className="sci-training-table-block sci-training-split-block">
    <div className="sci-training-table-heading__title"><Clock3 size={18} /><div><h3>Phân chia theo thời gian</h3>
      <p>Giữ nguyên thứ tự ngày và session · Train/Test 70/30</p></div></div>
    {rows.length === 0 ? <div className="sci-training-table-state">API chưa trả về danh sách session đã chia.</div> : <div className="sci-training-table-scroll sci-training-split-scroll"><table className="sci-training-table"><thead><tr><th>Ngày ghi hình</th><th>Dataset</th><th>Phiên ghi hình</th><th>Tập</th><th>Số mẫu</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.partition}:${row.session_id}`}><td>{row.recording_date || '—'}</td>
        <td title={row.dataset_id}>{names.get(row.dataset_id) || shortId(row.dataset_id)}</td>
        <td>{sessionsById[row.session_id]?.original_filename || `Phiên ${index + 1}`}</td>
        <td><span className={`sci-training-partition sci-training-partition--${row.partition.toLowerCase()}`}>{row.partition}</span></td>
        <td><strong>{formatNumber(row.sample_count)}</strong></td>
      </tr>)}</tbody></table></div>}
  </div>
}
