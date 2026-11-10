import { useState } from 'react'
import {
  Sliders,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  PlusCircle,
  ArrowLeft,
  ClipboardList,
} from 'lucide-react'
import { formatNumber } from '../utils/formatters'

const DEFAULT_PARAMS = {
  nEstimators: 100,
  maxDepth: 10,
  minSamplesSplit: 2,
  minSamplesLeaf: 1,
  maxFeatures: '1.0',
  bootstrap: true,
  randomState: 42,
}

function formatMetricVal(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  return Number(val).toFixed(4)
}

/**
 * Step 3: UI component for POST /api/model-training/experiment
 */
export default function ExperimentConfigPanel({
  datasetMeta,
  versionId,
  activeSplitContext,
  isTraining,
  trainError,
  latestExperiment,
  onRunExperiment,
  onViewExperimentDetail,
  onResetLatestExperiment,
  onBackToSplit,
  onOpenExperimentList,
  experimentCount = 0,
}) {
  const [formState, setFormState] = useState(DEFAULT_PARAMS)

  const splitId = activeSplitContext?.splitId || null
  const trainCount = activeSplitContext?.trainCount
  const testCount = activeSplitContext?.testCount
  const officialEligible = Boolean(activeSplitContext?.officialEligible)
  const evaluationMode = officialEligible
    ? activeSplitContext?.evaluationMode || 'exploratory'
    : 'exploratory'

  const datasetLabel = datasetMeta
    ? `${datasetMeta.dataset_name} (${datasetMeta.version_tag})`
    : versionId || '—'

  const handleFieldChange = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!splitId || isTraining) return
    await onRunExperiment?.({
      splitId,
      nEstimators: Number(formState.nEstimators),
      maxDepth: Number(formState.maxDepth),
      minSamplesSplit: Number(formState.minSamplesSplit),
      minSamplesLeaf: Number(formState.minSamplesLeaf),
      maxFeatures: String(formState.maxFeatures).trim(),
      bootstrap: Boolean(formState.bootstrap),
      randomState: Number(formState.randomState),
      evaluationMode,
    })
  }

  const handleCreateAnotherSameSplit = () => {
    onResetLatestExperiment?.()
  }

  return (
    <section className="admin-card">
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--blue">
            <Sliders size={18} />
          </div>
          <div>
            <h2 className="admin-card__title">
              Cấu hình và chạy thí nghiệm · Random Forest
            </h2>
            <p className="admin-card__subtitle">
              Thiết lập 7 siêu tham số cho mô hình Random Forest Regressor và huấn luyện trên tập dữ liệu đã chia.
            </p>
          </div>
        </div>

        <div className="sci-train-actions">
          {onBackToSplit && (
            <button
              type="button"
              className="btn-secondary sci-train-btn"
              onClick={onBackToSplit}
            >
              <ArrowLeft size={16} />
              <span>Quay lại Chia 70/30</span>
            </button>
          )}

          {onOpenExperimentList && (
            <button
              type="button"
              className="btn-secondary sci-train-btn"
              onClick={onOpenExperimentList}
            >
              <ClipboardList size={16} />
              <span>Danh sách thí nghiệm ({experimentCount})</span>
            </button>
          )}
        </div>
      </div>

      <div className="sci-card-body">
        {/* Top Dataset & Split Context Banner as specified in gợi ý.txt */}
        <div className="sci-exp-context-banner">
          <div className="sci-exp-context-item">
            <span className="sci-exp-context-item__label">Dataset:</span>
            <strong className="sci-exp-context-item__val" title={datasetLabel}>
              {datasetLabel}
            </strong>
          </div>

          <div className="sci-exp-context-item">
            <span className="sci-exp-context-item__label">Split:</span>
            <code className="sci-mono sci-split-code" title={splitId || ''}>
              {splitId ? `${String(splitId).slice(0, 12)}…` : 'Chưa có Split ID'}
            </code>
          </div>

          <div className="sci-exp-context-item">
            <span className="sci-exp-context-item__label">Train:</span>
            <strong className="sci-exp-context-item__val">
              {trainCount != null ? `${formatNumber(trainCount)} mẫu` : '70%'}
            </strong>
          </div>

          <div className="sci-exp-context-item">
            <span className="sci-exp-context-item__label">Test:</span>
            <strong className="sci-exp-context-item__val">
              {testCount != null ? `${formatNumber(testCount)} mẫu` : '30%'}
            </strong>
          </div>

          <div className="sci-exp-context-item">
            <span className="sci-exp-context-item__label">Đặc trưng:</span>
            <strong className="sci-exp-context-item__val">5 lag</strong>
          </div>

          <div className="sci-exp-context-item">
            <span className="sci-exp-context-item__label">Horizon:</span>
            <strong className="sci-exp-context-item__val">+1, +3, +5 phút</strong>
          </div>

          <div className="sci-exp-context-item">
            <span className="sci-exp-context-item__label">Chế độ:</span>
            <span
              className={`sci-pill ${
                evaluationMode === 'official'
                  ? 'sci-pill--approved'
                  : 'sci-pill--version'
              }`}
            >
              {evaluationMode === 'official' ? 'Đánh giá chính thức' : 'Thử nghiệm'}
            </span>
          </div>
        </div>

        {!splitId ? (
          <div className="sci-warning">
            <AlertCircle size={16} />
            <span>
              Chưa có tập Train/Test. Hãy mở tab <strong>Chuẩn bị dữ liệu</strong> để chia 70/30, hoặc chọn một thí nghiệm đã lưu trong tab <strong>Phân tích thí nghiệm</strong> để dùng lại Split.
            </span>
          </div>
        ) : (
          <form className="sci-rf-form" onSubmit={handleSubmit}>
            <div className="sci-rf-grid">
              {/* 1. Số cây (n_estimators) */}
              <div className="sci-rf-field">
                <div className="sci-rf-field__label-row">
                  <label htmlFor="rf-n-estimators">Số cây</label>
                  <code>n_estimators</code>
                </div>
                <input
                  id="rf-n-estimators"
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  required
                  disabled={isTraining}
                  value={formState.nEstimators}
                  onChange={(e) => handleFieldChange('nEstimators', e.target.value)}
                  className="sci-rf-input"
                />
                <small className="sci-rf-field__hint">Gợi ý: 100 (Từ 1 đến 1000 cây)</small>
              </div>

              {/* 2. Độ sâu tối đa (max_depth) */}
              <div className="sci-rf-field">
                <div className="sci-rf-field__label-row">
                  <label htmlFor="rf-max-depth">Độ sâu tối đa</label>
                  <code>max_depth</code>
                </div>
                <input
                  id="rf-max-depth"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  required
                  disabled={isTraining}
                  value={formState.maxDepth}
                  onChange={(e) => handleFieldChange('maxDepth', e.target.value)}
                  className="sci-rf-input"
                />
                <small className="sci-rf-field__hint">
                  Gợi ý: 10 (Nhập 0 để không giới hạn độ sâu)
                </small>
              </div>

              {/* 3. Mẫu tối thiểu để chia nhánh (min_samples_split) */}
              <div className="sci-rf-field">
                <div className="sci-rf-field__label-row">
                  <label htmlFor="rf-min-samples-split">Mẫu tối thiểu để chia nhánh</label>
                  <code>min_samples_split</code>
                </div>
                <input
                  id="rf-min-samples-split"
                  type="number"
                  min={2}
                  step={1}
                  required
                  disabled={isTraining}
                  value={formState.minSamplesSplit}
                  onChange={(e) => handleFieldChange('minSamplesSplit', e.target.value)}
                  className="sci-rf-input"
                />
                <small className="sci-rf-field__hint">Gợi ý: 2 (Tối thiểu &ge; 2)</small>
              </div>

              {/* 4. Mẫu tối thiểu tại nút lá (min_samples_leaf) */}
              <div className="sci-rf-field">
                <div className="sci-rf-field__label-row">
                  <label htmlFor="rf-min-samples-leaf">Mẫu tối thiểu tại nút lá</label>
                  <code>min_samples_leaf</code>
                </div>
                <input
                  id="rf-min-samples-leaf"
                  type="number"
                  min={1}
                  step={1}
                  required
                  disabled={isTraining}
                  value={formState.minSamplesLeaf}
                  onChange={(e) => handleFieldChange('minSamplesLeaf', e.target.value)}
                  className="sci-rf-input"
                />
                <small className="sci-rf-field__hint">Gợi ý: 1 (Tối thiểu &ge; 1)</small>
              </div>

              {/* 5. Số đặc trưng xét mỗi lần (max_features) */}
              <div className="sci-rf-field">
                <div className="sci-rf-field__label-row">
                  <label htmlFor="rf-max-features">Số đặc trưng xét mỗi lần</label>
                  <code>max_features</code>
                </div>
                <input
                  id="rf-max-features"
                  type="text"
                  list="rf-max-features-presets"
                  required
                  disabled={isTraining}
                  value={formState.maxFeatures}
                  onChange={(e) => handleFieldChange('maxFeatures', e.target.value)}
                  className="sci-rf-input"
                  placeholder="1.0"
                />
                <datalist id="rf-max-features-presets">
                  <option value="1.0">Tất cả đặc trưng (100%)</option>
                  <option value="sqrt">Căn bậc hai (sqrt)</option>
                  <option value="log2">Logarit cơ số 2 (log2)</option>
                  <option value="3">3 đặc trưng</option>
                  <option value="5">5 đặc trưng</option>
                </datalist>
                <small className="sci-rf-field__hint">
                  Gợi ý: 1.0 (Tỷ lệ 0..1.0, số nguyên 1..5, sqrt, log2, null)
                </small>
              </div>

              {/* 6. Lấy mẫu có hoàn lại (bootstrap) */}
              <div className="sci-rf-field">
                <div className="sci-rf-field__label-row">
                  <label htmlFor="rf-bootstrap">Lấy mẫu có hoàn lại</label>
                  <code>bootstrap</code>
                </div>
                <select
                  id="rf-bootstrap"
                  disabled={isTraining}
                  value={formState.bootstrap ? 'true' : 'false'}
                  onChange={(e) => handleFieldChange('bootstrap', e.target.value === 'true')}
                  className="sci-rf-input"
                >
                  <option value="true">Bật (True)</option>
                  <option value="false">Tắt (False)</option>
                </select>
                <small className="sci-rf-field__hint">Gợi ý: Bật (Bootstrap sampling)</small>
              </div>

              {/* 7. Hạt giống ngẫu nhiên (random_state) */}
              <div className="sci-rf-field">
                <div className="sci-rf-field__label-row">
                  <label htmlFor="rf-random-state">Hạt giống ngẫu nhiên</label>
                  <code>random_state</code>
                </div>
                <input
                  id="rf-random-state"
                  type="number"
                  min={0}
                  max={4294967295}
                  step={1}
                  required
                  disabled={isTraining}
                  value={formState.randomState}
                  onChange={(e) => handleFieldChange('randomState', e.target.value)}
                  className="sci-rf-input"
                />
                <small className="sci-rf-field__hint">
                  Gợi ý: 42 (Đảm bảo tái lập kết quả huấn luyện)
                </small>
              </div>
            </div>

            <div className="sci-rf-submit-bar">
              <button
                type="submit"
                className="btn-secondary"
                disabled={isTraining}
                onClick={(e) => {
                  e.preventDefault()
                  setFormState(DEFAULT_PARAMS)
                }}
              >
                Khôi phục mặc định
              </button>

              <button
                type="submit"
                className="btn-action btn-action--primary sci-train-btn"
                disabled={isTraining || !splitId}
              >
                {isTraining ? (
                  <Loader2 size={16} className="sci-spin" />
                ) : (
                  <Play size={16} />
                )}
                <span>
                  {isTraining ? 'Đang huấn luyện và đánh giá...' : 'Chạy thí nghiệm'}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Running state banner */}
        {isTraining && (
          <div className="sci-job">
            <div className="sci-job__row">
              <span className="sci-pill sci-job__status">
                <Loader2 size={13} className="sci-spin" />
                Đang huấn luyện mô hình Random Forest và các baseline (+1, +3, +5 phút)...
              </span>
            </div>
          </div>
        )}

        {/* Error state */}
        {trainError && (
          <div className="sci-state sci-state--error">
            <p style={{ margin: 0, fontWeight: 700 }}>{trainError}</p>
          </div>
        )}

        {/* Result Banner after creating experiment */}
        {!isTraining && latestExperiment && (
          <div
            className={`sci-exp-created-card ${
              latestExperiment.status === 'FAILED' ? 'sci-exp-created-card--failed' : ''
            }`}
          >
            <div className="sci-exp-created-card__head">
              <div className="sci-exp-created-card__title-group">
                {latestExperiment.status === 'FAILED' ? (
                  <AlertCircle size={20} style={{ color: '#dc2626' }} />
                ) : (
                  <CheckCircle2 size={20} style={{ color: '#16a34a' }} />
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="sci-exp-created-card__title">
                      Đã tạo thí nghiệm:{' '}
                      <strong>{latestExperiment.experiment_name}</strong>
                    </span>
                    <span
                      className={`sci-pill ${
                        latestExperiment.status === 'COMPLETED'
                          ? 'sci-pill--approved'
                          : 'sci-job__status--failed'
                      }`}
                    >
                      {latestExperiment.status}
                    </span>
                  </div>
                  <p className="sci-exp-created-card__sub">
                    Số cây: <strong>{latestExperiment.hyperparameters?.n_estimators}</strong> · Độ sâu:{' '}
                    <strong>{latestExperiment.hyperparameters?.max_depth ?? 'Không giới hạn'}</strong> ·
                    Train / Dự đoán / Tổng:{' '}
                    <strong>
                      {latestExperiment.training_time_sec != null
                        ? `${latestExperiment.training_time_sec.toFixed(4)}s`
                        : '—'}{' / '}
                      {latestExperiment.prediction_time_sec != null
                        ? `${latestExperiment.prediction_time_sec.toFixed(4)}s`
                        : '—'}{' / '}
                      {latestExperiment.execution_time_sec != null
                        ? `${latestExperiment.execution_time_sec.toFixed(4)}s`
                        : '—'}
                    </strong>
                  </p>
                </div>
              </div>
            </div>

            {latestExperiment.status === 'COMPLETED' &&
              latestExperiment.performance_by_horizon && (
                <div className="sci-exp-created-card__metrics">
                  {['1', '3', '5'].map((h) => {
                    const rf = latestExperiment.performance_by_horizon?.[h]?.random_forest
                    return (
                      <div key={h} className="sci-exp-mini-metric">
                        <span className="sci-exp-mini-metric__label">Horizon +{h} phút</span>
                        <div className="sci-exp-mini-metric__vals">
                          <span>
                            MAE: <strong>{formatMetricVal(rf?.mae)}</strong>
                          </span>
                          <span>
                            RMSE: <strong>{formatMetricVal(rf?.rmse)}</strong>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

            {latestExperiment.status === 'FAILED' && latestExperiment.error && (
              <div className="sci-state sci-state--error" style={{ padding: '0.85rem 1rem' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{latestExperiment.error}</p>
              </div>
            )}

            {/* Two Primary Actions right under result as specified in gợi ý.txt */}
            <div className="sci-exp-created-card__actions">
              <button
                type="button"
                className="btn-action btn-action--primary sci-train-btn"
                onClick={() => onViewExperimentDetail?.(latestExperiment)}
              >
                <Eye size={16} />
                <span>Xem kết quả {latestExperiment.experiment_name}</span>
              </button>

              <button
                type="button"
                className="btn-secondary sci-train-btn"
                onClick={handleCreateAnotherSameSplit}
              >
                <PlusCircle size={16} />
                <span>Tạo thí nghiệm khác với cùng dữ liệu</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

