import { ArrowLeft, Eye, FolderOpen, RefreshCw } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useEngineerDatasetSessions } from '../../../hooks/useEngineerDatasetSessions'
import { formatBytes } from '../utils/engineerHelpers'
import { EngineerBadge, EngineerPagination, EngineerState } from './EngineerUi'
import EngineerSessionPreview from './EngineerSessionPreview'

const previewPath = (groupId, datasetId, sessionId) => '/engineer/preview?' + new URLSearchParams({
  groupId, datasetId, ...(sessionId ? { sessionId } : {}),
}).toString()

const formatCaptureTime = (value) => {
  // Preserve the recording's local time and date from the API, without timezone conversion.
  const match = value?.match(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/)
  return match?.[1] || '—'
}

export default function EngineerDatasetSessions({ datasetId, sessionId }) {
  const navigate = useNavigate()
  const { dataset, sessions, groupId } = useEngineerDatasetSessions(datasetId)
  const batchPath = groupId ? '/engineer/preview?groupId=' + encodeURIComponent(groupId) : '/engineer/preview'
  return <div className="eng-review">
    <nav className="eng-review__breadcrumbs" aria-label="Vị trí xem trước dữ liệu">
      <Link to="/engineer/preview"><FolderOpen size={15} /> Các batch</Link>
      {groupId && <><span>/</span><Link to={batchPath}>{dataset.data?.group_name || 'Batch'}</Link></>}
      <span>/</span>
      {sessionId && groupId
        ? <Link to={previewPath(groupId, datasetId)}>{dataset.data?.name || 'Tập dữ liệu'}</Link>
        : <strong>{dataset.data?.name || 'Tập dữ liệu'}</strong>}
      {sessionId && <><span>/</span><strong>Xem trước phiên ghi hình</strong></>}
    </nav>
    <EngineerState resource={dataset}>
      {dataset.data && !groupId && <div className="eng-alert eng-alert--warning">Tập dữ liệu này chưa thuộc batch nào.</div>}
      {dataset.data && groupId && (sessionId
        ? <EngineerSessionPreview key={sessionId} groupId={groupId} datasetId={datasetId} sessionId={sessionId} />
        : <section className="adm-panel">
          <div className="adm-panel__header">
            <div>
              <h2 className="adm-panel__title">{dataset.data.name}</h2>
              <p className="eng-review__description">Chọn phiên ghi hình để kiểm tra lược đồ và xem trước dữ liệu của tập dữ liệu này.</p>
            </div>
            <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" disabled={sessions.loading}
              onClick={() => { dataset.reload(); sessions.reload() }}><RefreshCw size={14} /> Làm mới</button>
          </div>
          <div className="eng-review__summary">
            <span>{dataset.data.recording_date || 'Chưa có ngày ghi hình'}</span>
            <span>{sessions.total} phiên ghi hình</span>
            <EngineerBadge value={dataset.data.approval_status} />
          </div>
          <EngineerState resource={sessions}>
            {!sessions.loading && !sessions.error && sessions.items.length === 0
              ? <div className="adm-empty"><div className="adm-empty__title">Chưa có phiên ghi hình</div>
                <p className="adm-empty__desc">Tập dữ liệu này chưa có tệp ghi hình để xem trước.</p></div>
              : <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr>{['Tệp ghi hình', 'Khung giờ ghi hình', 'Dung lượng', 'Trạng thái tải lên', 'Thao tác'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>{sessions.items.map((session) => <tr key={session.session_id}>
                  <td className="eng-review__filename"><strong>{session.original_filename}</strong></td>
                  <td>{formatCaptureTime(session.scheduled_start)} – {formatCaptureTime(session.scheduled_end)}</td>
                  <td>{formatBytes(session.file_size)}</td>
                  <td><EngineerBadge value={session.upload_status} /></td>
                  <td><button type="button" className="adm-btn adm-btn--ghost adm-btn--sm"
                    onClick={() => navigate(previewPath(groupId, datasetId, session.session_id))}><Eye size={15} /> Xem trước</button></td>
                </tr>)}</tbody>
              </table></div>}
          </EngineerState>
          <EngineerPagination {...sessions} />
        </section>)}
    </EngineerState>
    <Link className="eng-review__back" to={sessionId && groupId ? previewPath(groupId, datasetId) : batchPath}>
      <ArrowLeft size={15} /> {sessionId ? 'Quay lại các phiên ghi hình' : 'Quay lại tập dữ liệu trong batch'}
    </Link>
  </div>
}
