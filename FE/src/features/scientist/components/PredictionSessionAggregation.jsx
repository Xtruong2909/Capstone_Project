import { formatRecordingDateTime, formatRecordingTime, formatTrafficFlow } from '../utils/formatters'

export default function PredictionSessionAggregation({ filename, session, preview }) {
  const { result, page, setPage, isLoading, error } = preview
  const startTime = session.start_time || result?.data?.[0]?.timestamp
  const endTime = session.end_time || result?.data?.at(-1)?.timestamp
  const recordingDate = startTime ? formatRecordingDateTime(startTime).split(',')[0] : '—'
  const timeRange = startTime && endTime
    ? `${formatRecordingTime(startTime)} – ${formatRecordingTime(endTime)}` : '—'

  return <section className="sci-prediction-aggregation" aria-label="Tổng hợp phương tiện theo thời gian">
    <div className="sci-prediction-aggregation__heading">
      <div>
        <h4>Tổng hợp phương tiện theo thời gian</h4>
        <p>{filename}</p>
      </div>
    </div>
    <div className="sci-prediction-aggregation__summary">
      <span>Ngày ghi hình <strong>{recordingDate}</strong></span>
      <span>Khung giờ <strong>{timeRange}</strong></span>
      <span>Số mốc thời gian <strong>{result?.total_records ?? session.total_records}</strong></span>
    </div>
    {isLoading ? <div className="sci-prediction-empty" role="status">Đang tải bảng tổng hợp…</div>
      : error ? <div className="sci-prediction-empty sci-prediction-aggregation__error" role="alert">{error}</div>
        : result?.data?.length ? <>
            <div className="sci-table-wrap"><table className="sci-table">
              <thead><tr><th>Giờ</th><th>Lưu lượng xe (xe/phút)</th></tr></thead>
              <tbody>{result.data.map((row) => <tr key={`${row.session_id}:${row.timestamp}`}>
                <td>{formatRecordingTime(row.timestamp)}</td>
                <td><strong>{formatTrafficFlow(row.traffic_flow)}</strong></td>
              </tr>)}</tbody>
            </table></div>
            {result.total_pages > 1 && <div className="sci-prediction-aggregation__pager">
              <span>Trang {page}/{result.total_pages}</span>
              <div>
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Trước</button>
                <button type="button" disabled={page >= result.total_pages} onClick={() => setPage((current) => current + 1)}>Sau</button>
              </div>
            </div>}
          </> : <div className="sci-prediction-empty">Session này chưa có mốc thời gian tổng hợp.</div>}
  </section>
}
