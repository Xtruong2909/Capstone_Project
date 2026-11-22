import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { useEngineerNormalization } from '../../../hooks/useEngineerNormalization'
import { EngineerBadge } from './EngineerUi'

const count = (value) => value == null ? 'Chờ kết quả' : Number(value).toLocaleString('vi-VN')
const typeLabel = (type) => ({ integer: 'Số nguyên', float: 'Số thực', string: 'Văn bản', boolean: 'Đúng / sai' })[type] || type
const cellValue = (value) => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)

export default function EngineerNormalizationPanel({ groupId, workflow }) {
  const data = useEngineerNormalization(groupId, workflow)
  const mapping = workflow.mapping.resource.data
  const result = data.preview.data
  const preview = result?.preview
  const columns = preview?.columns || []
  const isPneuma = result?.is_pneuma
  const processed = data.completed + data.failed
  return <div className="de-normalization">
    <div className="de-normalization__intro">
      <div><h3>Theo dõi và kết quả chuẩn hóa</h3><p>{data.groupName ? `Batch: ${data.groupName}` : 'Chuẩn hóa toàn bộ tập dữ liệu trong batch theo ánh xạ cột đã lưu.'}</p></div>
      <span className={`de-normalization__state ${data.running ? 'is-running' : ''}`} role="status">
        {data.running ? <Loader2 size={17} className="de-normalization__spinner" /> : <CheckCircle2 size={17} />}
        {data.running ? 'Đang chuẩn hóa' : workflow.normalized ? 'Đã chuẩn hóa' : data.failed ? 'Có tập dữ liệu xử lý lỗi' : 'Sẵn sàng chuẩn hóa'}
      </span>
    </div>

    <div className="de-normalization__metrics">
      <div><span>Tập dữ liệu</span><strong>{count(data.total)}</strong></div>
      <div><span>Tệp ghi hình nguồn</span><strong>{count(data.sessionCount)}</strong></div>
      <div><span>Chuẩn hóa thành công</span><strong>{data.completed} <small>/ {data.total}</small></strong></div>
      <div><span>Cột đầu vào</span><strong>{mapping?.columns?.length ?? '—'}</strong></div>
    </div>

    <div className="de-normalization__flow" aria-label="Quy trình chuẩn hóa dữ liệu">
      {[
        ['Đọc tệp nguồn', 'Đọc các tệp CSV trong từng tập dữ liệu.'],
        ['Áp dụng ánh xạ cột', 'Sử dụng tên cột đã lưu ở bước trước.'],
        ['Chuyển đổi cấu trúc', 'Tách điểm quỹ đạo với dữ liệu pNEUMA; giữ cấu trúc bảng với CSV thông thường.'],
        ['Tạo kết quả chuẩn hóa', 'Lưu kết quả để xem trước và chuyển sang bước xuất tệp.'],
      ].map(([title, description], index) => <div key={title}>
        <span className="de-normalization__number">{index + 1}</span><h4>{title}</h4><p>{description}</p>
        {index < 3 && <ArrowRight size={17} className="de-normalization__arrow" />}
      </div>)}
    </div>

    {mapping?.columns?.length > 0 && <div className="de-normalization__schema">
      <h4>Ánh xạ cột đang áp dụng</h4>
      <div>{mapping.columns.map((column) => {
        const target = mapping.mappings?.find((item) => item.source_column === column.source_column)?.target_column || column.source_column
        return <span key={column.source_column}><code>{column.source_column}</code><ArrowRight size={13} /><code>{target}</code></span>
      })}</div>
    </div>}

    <div className="de-normalization__progress">
      <div><h4>Tiến độ theo tập dữ liệu</h4><span>Đã xử lý {processed} / {data.total}{data.failed > 0 && ` · ${data.failed} lỗi`}</span></div>
      <progress aria-label="Số tập dữ liệu đã xử lý" value={processed} max={Math.max(1, data.total)} />
      <p>{data.running ? `Đang xử lý: ${data.rows.find((row) => row.status === 'RUNNING')?.name || 'Đang chờ máy chủ cập nhật'}. Số liệu được cập nhật khi từng tập dữ liệu hoàn thành.`
        : workflow.normalized ? 'Kết quả chuẩn hóa đã sẵn sàng. Có thể xem trước bên dưới hoặc tiếp tục xuất tệp.'
          : 'Bấm “Bắt đầu chuẩn hóa” để xử lý batch. Tiến độ được tính theo số tập dữ liệu, không phải số dòng.'}</p>
    </div>
    {workflow.job.error && <p role="alert" className="de-normalization__error">{workflow.job.error}<button type="button" className="btn-secondary" onClick={workflow.job.reload}>Thử lại</button></p>}
    {workflow.dataset_files.error && <p role="alert" className="de-normalization__error">{workflow.dataset_files.error}</p>}
    <div className="admin-table-scroll"><table className="admin-table">
      <thead><tr>{['Tập dữ liệu', 'Tệp nguồn', 'Trạng thái chuẩn hóa', 'Dòng đầu vào', 'Dòng đầu ra'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{data.rows.map((row) => <tr key={row.datasetId}>
        <td><strong>{row.name}</strong>{row.error && <small role="alert" className="de-normalization__error">{row.error}</small>}</td>
        <td>{count(row.sessions)}</td><td>{!workflow.job.data || row.status === 'PENDING' ? <span className="adm-badge adm-badge--slate">{workflow.job.data ? 'Chờ xử lý' : 'Chưa bắt đầu'}</span> : <EngineerBadge value={row.status} />}</td>
        <td>{count(row.before)}</td><td>{count(row.after)}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="de-normalization__note">Với pNEUMA, dòng đầu vào chứa thông tin phương tiện và nhiều thời điểm; mỗi dòng đầu ra là một điểm quỹ đạo. Số dòng có thể tăng sau khi tách.</p>

    <div className="de-normalization__preview">
      <div className="de-normalization__preview-heading"><div><h4>Xem trước kết quả chuẩn hóa</h4><p>Tối đa 10 dòng thực tế từ kết quả xử lý.</p></div>
        {data.ready.length > 0 && <select className="admin-select" value={data.datasetId} aria-label="Tập dữ liệu đã chuẩn hóa" onChange={(event) => data.setSelected(event.target.value)}>
          {data.ready.map((row) => <option key={row.datasetId} value={row.datasetId}>{row.name}</option>)}
        </select>}
      </div>
      {!data.ready.length ? <div className="de-normalization__placeholder"><p>{data.running ? 'Khi một tập dữ liệu chuẩn hóa thành công, bạn có thể xem kết quả tại đây trong lúc các tập còn lại tiếp tục xử lý.' : 'Kết quả sẽ xuất hiện tại đây sau khi chuẩn hóa thành công.'}</p></div>
        : data.preview.loading ? <p role="status">Đang tải dữ liệu đã chuẩn hóa...</p>
          : data.preview.error ? <div role="alert" className="de-normalization__error">{data.preview.error}<button type="button" className="btn-secondary" onClick={data.preview.reload}>Thử lại</button></div>
            : preview && <>
              <div className="de-normalization__result-summary"><span>{isPneuma ? 'Dòng phương tiện đầu vào' : 'Dòng đầu vào'}: <strong>{count(result.records_before)}</strong></span><ArrowRight size={18} /><span>{isPneuma ? 'Điểm quỹ đạo đầu ra' : 'Dòng đầu ra'}: <strong>{count(result.records_after)}</strong></span></div>
              <div className="admin-table-scroll de-normalization__sample"><table className="admin-table">
                <thead><tr><th>STT</th>{columns.map((column) => <th key={column.name}><code>{column.name}</code><small>{typeLabel(column.type)}</small></th>)}</tr></thead>
                <tbody>{preview.rows.map((row, index) => <tr key={index}><td>{index + 1}</td>{columns.map((column) => <td key={column.name}>{cellValue(row[column.name])}</td>)}</tr>)}</tbody>
              </table></div>
              {preview.rows.length === 0 && <p>Kết quả chuẩn hóa không có dòng dữ liệu.</p>}
            </>}
    </div>
  </div>
}
