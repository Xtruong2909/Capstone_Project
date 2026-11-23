export default function ScientistAggregationProgress({ aggregation, starting = false, sessionsById = {}, onDismiss }) {
  if (!starting && !aggregation) return null
  const data = starting ? null : aggregation
  const total = Math.max(0, Number(data?.total_sessions) || 0)
  const completed = Math.max(0, Number(data?.completed_sessions) || 0)
  const failed = Math.max(0, Number(data?.failed_sessions) || 0)
  const processed = Math.min(total, completed + failed)
  const running = starting || ['PROCESSING', 'PENDING', 'QUEUED', 'RUNNING'].includes(data?.status)
  const canDismiss = !running && ['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes(data?.status) && typeof onDismiss === 'function'
  const indeterminate = running && processed === 0
  const percent = total ? Math.round(processed * 100 / total) : 0
  const session = data?.sessions?.find((item) => item.status === 'RUNNING')
  const filename = sessionsById[session?.session_id]?.original_filename
  return <div className={`sci-aggregation-progress${indeterminate ? ' sci-aggregation-progress--indeterminate' : ''}${canDismiss ? ' sci-aggregation-progress--dismissible' : ''}`} role="status">
    {canDismiss && <button type="button" className="sci-aggregation-progress__dismiss" onClick={onDismiss} aria-label="Ẩn tiến độ tổng hợp" title="Ẩn tiến độ tổng hợp"><span aria-hidden="true">×</span></button>}
    <div><strong>{starting ? 'Đang khởi tạo tổng hợp…' : `${completed}/${total} phiên hoàn tất`}</strong>
      <span>{indeterminate ? 'Đang chuẩn bị và đọc dữ liệu…' : `${percent}% đã xử lý`}</span></div>
    <div className="sci-aggregation-progress__track">
      <progress aria-label="Tiến độ tổng hợp dữ liệu theo phút" max={Math.max(1, total)} value={indeterminate ? undefined : processed} />
    </div>
    <span>{running ? filename ? `Đang tổng hợp: ${filename}` : 'Tiến độ tự cập nhật theo kết quả xử lý của máy chủ.'
      : data?.status === 'COMPLETED' ? 'Đã tổng hợp xong dữ liệu theo phút.' : 'Tác vụ đã dừng. Xem chi tiết kết quả bên dưới.'}</span>
    {failed > 0 && <span>{failed} phiên xử lý lỗi</span>}
  </div>
}
