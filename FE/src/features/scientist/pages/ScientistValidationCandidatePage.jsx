import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Info } from 'lucide-react'
import { useValidationCandidate } from '../../../hooks/useValidationCandidate'
import { useGroupDatasets, useGroupSessionMetadata } from '../../../hooks/useScientistData'
import { PredictionDetailsTable } from '../components/ExperimentDetailTables'
import { ActualPredictedChart } from '../components/ExperimentResultCharts'
import ValidationSessionsSummaryTable from '../components/ValidationSessionsSummaryTable'
import '../components/ValidationStudyPanel.css'

const number = value => Number.isFinite(value) ? value.toFixed(2) : '—'

export default function ScientistValidationCandidatePage() {
  const { studyId, candidateIndex } = useParams()
  const location = useLocation()
  const { study, candidate, detail, loading, error, reload } = useValidationCandidate(studyId, candidateIndex)
  const { datasets } = useGroupDatasets(detail?.group_id)
  const sessionsById = useGroupSessionMetadata(datasets)
  const allPredictions = detail?.result_tables?.prediction_details?.length
    ? detail.result_tables.prediction_details : detail?.prediction_rows || []
  const predictions = allPredictions.filter(row => row.model === 'RANDOM_FOREST')
  const returnTo = location.state?.returnTo?.startsWith('/scientist/') ? location.state.returnTo : '/scientist/datasets'
  const metrics = candidate?.metrics?.RANDOM_FOREST
  const config = candidate?.hyperparameters
  return <div className="sci-page">
    <Link className="sci-back" to={returnTo} state={{ selectedValidationStudyId: studyId }}><ArrowLeft size={16} /> Quay lại kết quả validation</Link>
    <section className="validation-panel">
      <header className="validation-heading"><div><h1><Info size={23} /> Thông tin cấu hình {candidate ? `C${candidate.index + 1}` : ''}</h1><p>Kết quả Random Forest trên tập validation.</p></div></header>
      {loading && <p role="status">Đang tải thông tin…</p>}
      {error && <div role="alert" className="sci-state sci-state--error">{error}<button type="button" className="btn-secondary" onClick={reload}>Thử lại</button></div>}
      {!loading && !error && candidate && <>
        <h3>Cấu hình Random Forest</h3>
        <div className="validation-table-scroll"><table className="validation-table"><thead><tr><th>Số cây</th><th>Độ sâu</th><th>Mẫu / lá</th><th>Mẫu / chia</th><th>Đặc trưng mỗi lần chia</th><th>Bootstrap</th><th>Seed</th></tr></thead><tbody><tr>
          <td>{config.n_estimators}</td><td>{config.max_depth ?? 'Không giới hạn'}</td><td>{config.min_samples_leaf}</td><td>{config.min_samples_split}</td><td>{config.max_features === 1 ? 'Toàn bộ' : String(config.max_features)}</td><td>{config.bootstrap ? 'Có' : 'Không'}</td><td>{config.random_state}</td>
        </tr></tbody></table></div>
        <p>Train: <strong>{study.protocol.partitions.train.sample_count} mẫu</strong> · Validation: <strong>{study.protocol.partitions.validation.sample_count} mẫu</strong> · 5 lag · Dự báo +1, +3, +5 phút.</p>
        {detail && <PredictionDetailsTable key={detail.experiment_id} rows={predictions} sessionsById={sessionsById} subsetLabel="Validation" showSessionSummary />}
        {detail && <ValidationSessionsSummaryTable predictions={predictions} sessionsById={sessionsById} candidate={candidate} />}
        {detail && <>
          <ActualPredictedChart key={detail.experiment_id} predictions={predictions} sessionsById={sessionsById} subsetLabel="Validation" />
        </>}
        <h3>Cách tính các chỉ số</h3>
        <p>Với mỗi mẫu validation, lấy dự báo trừ số lượng phương tiện thực tế tại đúng thời điểm cần dự báo.</p>
        <ul><li><strong>MAE:</strong> cộng độ lệch tuyệt đối của tất cả mẫu rồi chia cho số mẫu.</li><li><strong>RMSE:</strong> bình phương từng độ lệch, lấy trung bình rồi căn bậc hai.</li></ul>
        <div className="validation-note">
          <div>RMSE TB = ({[1, 3, 5].map(h => number(metrics?.[h]?.rmse)).join(' + ')}) / 3 = <strong>{number(candidate.mean_rmse)}</strong></div>
          <div>MAE TB = ({[1, 3, 5].map(h => number(metrics?.[h]?.mae)).join(' + ')}) / 3 = <strong>{number(candidate.mean_mae)}</strong></div>
        </div>
        <p>Hệ thống dùng số chưa làm tròn để tính trung bình; bảng hiển thị 2 chữ số thập phân.</p>
        <h3>Quy tắc lựa chọn</h3><p>Chọn cấu hình có RMSE validation trung bình thấp nhất. Nếu bằng nhau, xét MAE trung bình rồi thứ tự cấu hình. Điểm test không tham gia lựa chọn.</p>
        {study.result?.selected_candidate_index === candidate.index && <p className="validation-note"><strong>Cấu hình này đã được chọn để train lại và đánh giá test cuối.</strong></p>}
      </>}
    </section>
  </div>
}
