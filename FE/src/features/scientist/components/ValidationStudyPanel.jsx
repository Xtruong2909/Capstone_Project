import { useState } from 'react'
import { FlaskConical, Info, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useValidationStudy } from '../../../hooks/useValidationStudy'
import { selectValidationCandidate } from '../utils/selectValidationCandidate'
import './ValidationStudyPanel.css'

const BASE = { n_estimators: 100, max_depth: 10, min_samples_leaf: 2, min_samples_split: 5, max_features: 1.0, bootstrap: true, random_state: 42 }
const initialCandidates = () => [
  ...[50, 100, 200].flatMap((n) => [5, 10, 15].map((depth) => ({ ...BASE, n_estimators: n, max_depth: depth }))),
  ...[1, 4].map((leaf) => ({ ...BASE, min_samples_leaf: leaf })),
  ...[2, 10].map((split) => ({ ...BASE, min_samples_split: split })),
  ...[300, 500].map((n) => ({ ...BASE, n_estimators: n })),
]
const number = (value) => Number.isFinite(value) ? value.toFixed(2) : '—'
const label = (status) => ({ READY: 'Sẵn sàng', VALIDATING: 'Đang validation', VALIDATED: 'Đã chạy đủ validation', FINALIZING: 'Đang train lại và test', COMPLETED: 'Hoàn tất', FINAL_FAILED: 'Test gặp lỗi', PENDING: 'Chưa chạy', RUNNING: 'Đang chạy', FAILED: 'Thất bại' }[status] || status)

function Metrics({ metrics }) {
  return <div className="validation-table-scroll"><table className="validation-table validation-metrics"><thead><tr><th>Khoảng dự báo</th><th>Phương pháp</th><th>MAE</th><th>RMSE</th><th>Số mẫu</th></tr></thead><tbody>
    {[1, 3, 5].flatMap((h) => ['RANDOM_FOREST'].map((method) => {
      const metric = metrics?.[method]?.[String(h)]
      return <tr key={`${h}-${method}`} className={`validation-metric-row validation-metric-row--${method.toLowerCase()} validation-metric-row--h${h}${method === 'RANDOM_FOREST' && h !== 1 ? ' validation-metric-group-start' : ''}`}><td><span className="validation-horizon">{h} phút</span></td><td><span className="validation-method">{method.replaceAll('_', ' ')}</span></td><td className="validation-metric-value">{number(metric?.mae)}</td><td className="validation-metric-value">{number(metric?.rmse)}</td><td>{metric?.sample_count ?? '—'}</td></tr>
    }))}
  </tbody></table></div>
}

export default function ValidationStudyPanel({ featureGenerationId, groupId, referencePath }) {
  const location = useLocation()
  const preferredStudyId = location.state?.selectedValidationStudyId || ''
  const workflow = useValidationStudy(featureGenerationId, preferredStudyId)
  const [creating, setCreating] = useState(!preferredStudyId)
  const strategy = 'DAY_BASED'
  const train = 50
  const validation = 25
  const [candidates, setCandidates] = useState(initialCandidates)
  const [detailIndex, setDetailIndex] = useState(null)
  const { study, busy } = workflow
  const bestCandidate = selectValidationCandidate(study)
  const running = busy || ['VALIDATING', 'FINALIZING'].includes(study?.status)
  const edit = (index, key, value) => setCandidates((rows) => rows.map((row, i) => i === index ? { ...row, [key]: key === 'max_depth' && value === '' ? null : Number(value) } : row))
  const submit = async (event) => {
    event.preventDefault()
    const created = await workflow.create({ split_strategy: strategy, train_ratio: train / 100, validation_ratio: validation / 100, test_previously_used: true, candidates })
    if (created) setCreating(false)
  }
  return <section className="validation-panel" aria-label="Train Validation Test">
    <header className="validation-heading"><div><span className="validation-eyebrow">LỰA CHỌN CẤU HÌNH</span><h2><FlaskConical size={22} /> Train / Validation / Test</h2><p>Chọn cấu hình bằng validation → train lại bằng train + validation → đánh giá trên test.</p></div>
      <button type="button" className="sci-training-button sci-training-button--secondary" disabled={running} onClick={() => { setCreating(!creating); setDetailIndex(null) }}><Plus size={16} /> {creating ? 'Đóng thiết lập mới' : 'Thiết lập mới'}</button>
    </header>
    {workflow.loading && <p role="status">Đang tải validation…</p>}
    {workflow.error && <div role="alert" className="sci-training-alert">{workflow.error} <button type="button" onClick={workflow.reload}>Tải lại trạng thái</button></div>}
    {(creating || (!workflow.loading && !study)) && <form onSubmit={submit} className="validation-setup">
      <div className="validation-fields"><label>Nhóm dữ liệu<input readOnly value="Theo ngày" /></label>
        <label>Train (%)<input readOnly value={train} /></label>
        <label>Validation (%)<input readOnly value={validation} /></label>
        <label>Test (%)<input readOnly value={100 - train - validation} /></label></div>
      <h3>Cấu hình thử nghiệm ({candidates.length})</h3>
      <button type="button" className="sci-training-button sci-training-button--secondary" disabled={running} onClick={() => setCandidates(initialCandidates())}>Điền bộ 15 cấu hình</button>
      <div className="validation-table-scroll"><table className="validation-table"><thead><tr><th>Cấu hình</th><th>Số cây</th><th>Độ sâu</th><th>Mẫu / lá</th><th>Mẫu / chia</th><th /></tr></thead><tbody>
        {candidates.map((row, i) => <tr key={i}><td>C{i + 1}</td>{[['n_estimators', 1, 1000], ['max_depth', 1, 100], ['min_samples_leaf', 1, 100000], ['min_samples_split', 2, 100000]].map(([key, min, max]) => <td key={key}><input aria-label={`C${i + 1} ${key}`} type="number" min={min} max={max} required={key !== 'max_depth'} value={row[key] ?? ''} placeholder="Không giới hạn" onChange={(event) => edit(i, key, event.target.value)} /></td>)}<td><button type="button" aria-label={`Xóa C${i + 1}`} disabled={candidates.length <= 2} onClick={() => setCandidates((rows) => rows.filter((_, index) => index !== i))}><Trash2 size={15} /></button></td></tr>)}
      </tbody></table></div>
      <div className="validation-actions"><button type="button" className="sci-training-button sci-training-button--secondary" disabled={candidates.length >= 20} onClick={() => setCandidates((rows) => [...rows, { ...BASE, n_estimators: 400 + rows.length }])}><Plus size={16} /> Thêm cấu hình</button>
        <button type="submit" className="sci-training-button" disabled={running || train + validation >= 100}>{busy ? 'Đang tạo…' : 'Chốt cấu hình và chia dữ liệu'}</button></div>
    </form>}
    {!workflow.loading && <h3>Lịch sử Validation</h3>}
    {!workflow.loading && workflow.studies.length === 0 && <p className="validation-note">Chưa có lượt Validation đã lưu cho batch này.</p>}
    {workflow.studies.length > 0 && <label className="validation-study-select">Lượt đã lưu<select disabled={running} value={workflow.selectedId} onChange={(event) => { workflow.setSelectedId(event.target.value); setDetailIndex(null) }}>{workflow.studies.map((item) => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString('vi-VN')} · {label(item.status)}</option>)}</select></label>}
    {study && <>
      <div className="validation-partitions">{[['train', '1. Train'], ['validation', '2. Validation'], ['test', '3. Test']].map(([key, title]) => {
        const partition = study.protocol.partitions[key]
        return <article key={key}><h3>{title}</h3><span>{partition.session_count} session</span><p>{partition.recording_dates.join(', ')}</p></article>
      })}</div>
      <p className="validation-note">{study.protocol.test_previously_used ? 'Test đã từng sử dụng: kết quả cuối mang tính đánh giá mô tả.' : 'Test được người tạo khai báo chưa sử dụng; hệ thống không xác minh được việc sử dụng ngoài lượt này.'}</p>
      <p><strong>{label(study.status)}</strong> · Đã đạt kiểm tra rò rỉ thời gian ở cả hai ranh giới.</p>
      <div className="validation-results-heading"><h3>Kết quả validation</h3>
        <button type="button" className="sci-training-button sci-training-button--secondary" disabled={busy} onClick={workflow.reload}><RefreshCw size={16} /> Cập nhật</button>
      </div><p>Chọn RMSE trung bình thấp nhất của +1, +3, +5 phút. Nếu bằng nhau, xét MAE trung bình rồi thứ tự cấu hình. Điểm test không tham gia chọn.</p>
      <div className="validation-table-scroll"><table className="validation-table"><thead><tr><th>Cấu hình</th><th>Cây / sâu / lá / chia</th><th>RMSE +1</th><th>RMSE +3</th><th>RMSE +5</th><th>RMSE TB</th><th>MAE TB</th><th>Trạng thái</th></tr></thead><tbody>
        {study.candidates.map((row) => <tr key={row.index} className={study.result?.selected_candidate_index === row.index ? 'validation-winner' : ''}><td><button type="button" onClick={() => setDetailIndex(row.index)}>C{row.index + 1}</button></td><td>{[row.hyperparameters.n_estimators, row.hyperparameters.max_depth ?? '∞', row.hyperparameters.min_samples_leaf, row.hyperparameters.min_samples_split].join(' / ')}</td>{[1, 3, 5].map((h) => <td key={h}>{number(row.metrics?.RANDOM_FOREST?.[String(h)]?.rmse)}</td>)}<td>{number(row.mean_rmse)}</td><td>{number(row.mean_mae)}</td><td><span className="validation-candidate-status">{label(row.status)}{row.status === 'COMPLETED' && <Link className="validation-candidate-info" to={`/scientist/validation-studies/${study.id}/candidates/${row.index}`} state={{ returnTo: `${location.pathname}${location.search}` }} aria-label={`Thông tin cấu hình C${row.index + 1}`}><Info size={15} /> Thông tin</Link>}</span>{row.error && <span role="alert"> · {row.error}</span>}</td></tr>)}
      </tbody></table></div>
      {detailIndex !== null && study.candidates[detailIndex]?.metrics && <><h3>Validation · C{detailIndex + 1}</h3><Metrics metrics={study.candidates[detailIndex].metrics} /></>}
      <div className="validation-actions">
        {study.status === 'VALIDATED' && <p className="validation-note">Chọn cấu hình tốt nhất sẽ huấn luyện lại và tạo 1 thí nghiệm Test cuối trong lịch sử. Nếu tiếp tục chạy ở trang Train/Test, đó là một lần chạy mới riêng biệt.</p>}
        {['READY', 'VALIDATED'].includes(study.status) && <button type="button" className="sci-training-button" disabled={running || study.status === 'VALIDATED'} onClick={workflow.run}><Play size={16} /> {busy ? 'Đang chạy…' : 'Chạy các cấu hình validation'}</button>}
        {busy && study.status !== 'FINALIZING' && <button type="button" className="sci-training-button sci-training-button--secondary" onClick={workflow.stop}>Dừng sau cấu hình hiện tại</button>}
        {!running && bestCandidate && study.result?.selected_candidate_index === bestCandidate.index && referencePath && <Link className="sci-training-button"
          to={referencePath} state={{ validationPreset: {
            groupId, featureGenerationId, studyId: study.id, candidateIndex: bestCandidate.index,
            hyperparameters: bestCandidate.hyperparameters,
          } }}>Dùng cấu hình cho train/test</Link>}
        {study.status === 'VALIDATED' && <button type="button" className="sci-training-button validation-finalize-button" disabled={running} onClick={workflow.finalize}>Chọn cấu hình tốt nhất</button>}
      </div>
      {study.result && <div className="validation-final"><h3>Kết quả test cuối · C{study.result.selected_candidate_index + 1}</h3><p>Kết quả hồi quy rừng ngẫu nhiên sau khi huấn luyện lại bằng train + validation.</p>{study.result.metrics && <Metrics metrics={study.result.metrics} />}{study.result.error && <p role="alert">{study.result.error}</p>}</div>}
    </>}
  </section>
}
