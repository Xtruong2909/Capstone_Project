import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, FlaskConical, Play, SlidersHorizontal } from 'lucide-react'
import { useExperimentSetup } from '../../../hooks/useScienceWorkflow'
import { formatNumber } from '../utils/formatters'

export default function ScientistExperimentSetupPage() {
  const { groupId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const incomingPreset = location.state?.validationPreset?.groupId === groupId
    ? location.state.validationPreset : null
  const splitId = searchParams.get('split_id')
  const { split, configuration, validationPreset, updateConfiguration, loading, busy, error, createExperiment } = useExperimentSetup(splitId, groupId, incomingPreset)

  const submit = async (event) => {
    event.preventDefault()
    const result = await createExperiment()
    if (result?.experiment_id) {
      navigate(`/scientist/experiments/groups/${result.group_id || groupId}/${result.experiment_id}?split_id=${encodeURIComponent(split.split_id)}`)
    }
  }

  return <div className="sci-page sci-experiment-setup">
    <Link className="sci-back" to={`/scientist/datasets/groups/${groupId}/train`}><ArrowLeft size={16} /> Quy trình huấn luyện</Link>
    <header className="sci-experiment-setup__hero">
      <span className="sci-experiment-setup__icon"><FlaskConical size={26} /></span>
      <div><span className="sci-training-hero__eyebrow">BƯỚC 4 · RANDOM FOREST</span>
        <h1>Cấu hình thí nghiệm</h1>
        <p>Chọn siêu tham số, kiểm tra tập Train/Test, rồi bắt đầu huấn luyện.</p></div>
    </header>

    {!splitId && <div role="alert" className="sci-training-alert">Chưa có tập Train/Test. Hãy hoàn tất bước chia dữ liệu trước khi tạo thí nghiệm.</div>}
    {loading && <div className="sci-state"><div className="sci-spinner" /> Đang tải tập Train/Test…</div>}
    {error && <div role="alert" className="sci-training-alert">{error}</div>}

    {!loading && split && <form className="sci-experiment-setup__card" onSubmit={submit}>
      <div className="sci-experiment-setup__section-heading"><SlidersHorizontal size={19} /><div>
        <h2>Cấu hình Random Forest</h2>
        <p>Mô hình dự báo số lượng phương tiện tại các mốc +1, +3 và +5 phút.</p>
      </div></div>
      {validationPreset && <p role="status" className="validation-note">Đã điền cấu hình C{validationPreset.candidateIndex + 1} tốt nhất từ validation. Kiểm tra tham số trước khi nhấn “Tạo và chạy thí nghiệm”.</p>}
      <div className="sci-experiment-setup__summary">
        <span><small>Tập Train</small><strong>{formatNumber(split.train_sample_count)} mẫu</strong></span>
        <span><small>Tập Test</small><strong>{formatNumber(split.test_sample_count)} mẫu</strong></span>
        <span><small>Tỷ lệ yêu cầu Train / Test</small><strong>{Number.isFinite(split.train_ratio_requested)
          ? `${Math.round(split.train_ratio_requested * 100)} / ${Math.round((1 - split.train_ratio_requested) * 100)}` : '—'}</strong></span>
      </div>
      <div className="sci-experiment-setup__fields">
        <label>Số cây (n_estimators)
          <input type="number" min="1" max="1000" required value={configuration.n_estimators} onChange={(event) => updateConfiguration('n_estimators', event.target.value)} />
        </label>
        <label>Độ sâu tối đa (max_depth)
          <input type="number" min="1" max="100" placeholder="Để trống nếu không giới hạn" value={configuration.max_depth} onChange={(event) => updateConfiguration('max_depth', event.target.value)} />
        </label>
        <label>Số mẫu tối thiểu ở nút lá
          <input type="number" min="1" required value={configuration.min_samples_leaf} onChange={(event) => updateConfiguration('min_samples_leaf', event.target.value)} />
        </label>
        <label>Số mẫu tối thiểu để chia nhánh
          <input type="number" min="2" required value={configuration.min_samples_split} onChange={(event) => updateConfiguration('min_samples_split', event.target.value)} />
        </label>
        <label>Số đặc trưng mỗi lần chia
          <select value={configuration.max_features} onChange={(event) => updateConfiguration('max_features', event.target.value)}>
            {!['all', 'sqrt', 'log2', '0.8', '0.5'].includes(configuration.max_features) && <option value={configuration.max_features}>{configuration.max_features}</option>}
            <option value="all">Tất cả đặc trưng</option>
            <option value="sqrt">Căn bậc hai (sqrt)</option>
            <option value="log2">Log cơ số 2 (log2)</option>
            <option value="0.8">80% đặc trưng</option>
            <option value="0.5">50% đặc trưng</option>
          </select>
        </label>
        <label>Hạt giống ngẫu nhiên
          <input type="number" min="0" max="4294967295" required value={configuration.random_state} onChange={(event) => updateConfiguration('random_state', event.target.value)} />
        </label>
      </div>
      <label className="sci-experiment-setup__checkbox"><input type="checkbox" checked={configuration.bootstrap} onChange={(event) => updateConfiguration('bootstrap', event.target.checked)} /> Lấy mẫu bootstrap khi huấn luyện</label>
      <div className="sci-experiment-setup__footer">
        <Link className="sci-training-button sci-training-button--secondary" to={`/scientist/datasets/groups/${groupId}/train`}>Quay lại</Link>
        <button type="submit" className="sci-training-button" disabled={busy}><Play size={16} /> {busy ? 'Đang huấn luyện…' : 'Tạo và chạy thí nghiệm'}</button>
      </div>
    </form>}
  </div>
}
