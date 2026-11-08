import { useMemo } from 'react'
import {
  GitCompareArrows,
  Trophy,
  ArrowLeft,
  Loader2,
  Info,
  Eye,
  PlusCircle,
} from 'lucide-react'

function formatMetric(val, digits = 4) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  return Number(val).toFixed(digits)
}

function formatSec(sec) {
  if (sec == null || Number.isNaN(Number(sec))) return '—'
  return `${Number(sec).toFixed(4)}s`
}

function isCompatibleWithAnchor(exp, anchor) {
  if (!exp || exp.status !== 'COMPLETED') return false
  if (!anchor) return true
  return (
    String(exp.dataset_version_id) === String(anchor.dataset_version_id) &&
    String(exp.split_id) === String(anchor.split_id) &&
    String(exp.evaluation_mode) === String(anchor.evaluation_mode) &&
    String(exp.evaluation_policy) === String(anchor.evaluation_policy)
  )
}

/**
 * Step 5: UI component for POST /api/model-training/experiments/compare
 */
export default function ExperimentComparePanel({
  experiments = [],
  selectedCompareIds = [],
  onChangeCompareIds,
  onRunCompare,
  comparisonData,
  isComparing,
  compareError,
  onBackToList,
  onViewExperimentDetail,
  onCreateWithSameSplit,
}) {
  const completedExperiments = useMemo(
    () => experiments.filter((e) => e.status === 'COMPLETED'),
    [experiments]
  )

  const selectedSet = useMemo(
    () => new Set(selectedCompareIds.map(String)),
    [selectedCompareIds]
  )

  const anchorExperiment = useMemo(() => {
    if (selectedCompareIds.length === 0) return null
    const firstId = String(selectedCompareIds[0])
    return completedExperiments.find((e) => String(e.experiment_id) === firstId) || null
  }, [completedExperiments, selectedCompareIds])

  const handleToggleChip = (exp) => {
    const idStr = String(exp.experiment_id)
    if (selectedSet.has(idStr)) {
      onChangeCompareIds?.(selectedCompareIds.filter((id) => String(id) !== idStr))
      return
    }
    if (!isCompatibleWithAnchor(exp, anchorExperiment)) return
    onChangeCompareIds?.([...selectedCompareIds, exp.experiment_id])
  }

  const comparedList = comparisonData?.experiments || []
  const bestByHorizon = comparisonData?.best_by_horizon || {}
  const bestIdsByHorizon = comparisonData?.best_experiment_ids_by_horizon || {}
  const tiedIdsByHorizon = comparisonData?.tied_experiment_ids_by_horizon || {}

  // Helper to check if an experiment is a winner (or tied winner) for a horizon ("1", "3", "5")
  const isHorizonWinner = (horizonKey, expId) => {
    const idStr = String(expId)
    const tiedList = (tiedIdsByHorizon?.[horizonKey] || []).map(String)
    if (tiedList.length > 0) {
      return tiedList.includes(idStr)
    }
    return String(bestIdsByHorizon?.[horizonKey] || '') === idStr
  }

  const isHorizonTied = (horizonKey) => {
    return (tiedIdsByHorizon?.[horizonKey]?.length || 0) > 1
  }

  return (
    <section className="admin-card">
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--blue">
            <GitCompareArrows size={18} />
          </div>
          <div>
            <h2 className="admin-card__title">
              Bước 5 · So sánh các thí nghiệm
            </h2>
            <p className="admin-card__subtitle">
              Đối chiếu cấu hình Random Forest và chỉ số MAE / RMSE theo từng horizon (+1, +3, +5 phút) trên cùng tập dữ liệu Test.
            </p>
          </div>
        </div>

        <div className="sci-train-actions">
          {onBackToList && (
            <button
              type="button"
              className="btn-secondary sci-train-btn"
              onClick={onBackToList}
            >
              <ArrowLeft size={16} />
              <span>Quay lại danh sách</span>
            </button>
          )}

          {anchorExperiment && onCreateWithSameSplit && (
            <button
              type="button"
              className="btn-secondary sci-train-btn"
              onClick={() => onCreateWithSameSplit(anchorExperiment)}
            >
              <PlusCircle size={16} />
              <span>Tạo thêm thí nghiệm cùng Split</span>
            </button>
          )}
        </div>
      </div>

      <div className="sci-card-body">
        {/* Quick Experiment Selector Bar */}
        <div className="sci-compare-picker">
          <div className="sci-compare-picker__top">
            <div>
              <strong>Chọn thí nghiệm COMPLETED để so sánh (tối thiểu 2 thí nghiệm cùng Split ID):</strong>
              <p>
                Chỉ các thí nghiệm có cùng Dataset Version, cùng Split ID và cùng chế độ đánh giá mới được chọn cùng nhau.
              </p>
            </div>
            <button
              type="button"
              className="btn-action btn-action--primary sci-train-btn"
              disabled={selectedCompareIds.length < 2 || isComparing}
              onClick={() => onRunCompare?.(selectedCompareIds)}
            >
              {isComparing ? (
                <Loader2 size={16} className="sci-spin" />
              ) : (
                <GitCompareArrows size={16} />
              )}
              <span>
                {isComparing
                  ? 'Đang so sánh...'
                  : `So sánh đã chọn (${selectedCompareIds.length})`}
              </span>
            </button>
          </div>

          {completedExperiments.length === 0 ? (
            <div className="sci-warning">
              Chưa có thí nghiệm COMPLETED nào để so sánh.
            </div>
          ) : (
            <div className="sci-compare-chips">
              {completedExperiments.map((exp) => {
                const idStr = String(exp.experiment_id)
                const isSelected = selectedSet.has(idStr)
                const compatible = isCompatibleWithAnchor(exp, anchorExperiment)
                const enabled = isSelected || compatible

                return (
                  <button
                    key={idStr}
                    type="button"
                    disabled={!enabled}
                    onClick={() => handleToggleChip(exp)}
                    className={`sci-compare-chip ${
                      isSelected ? 'sci-compare-chip--active' : ''
                    }`}
                    title={
                      enabled
                        ? `${exp.experiment_name} · Split ${String(exp.split_id).slice(0, 8)}`
                        : 'Khác Split ID hoặc chế độ đánh giá với thí nghiệm đã chọn'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      style={{ pointerEvents: 'none' }}
                    />
                    <strong>{exp.experiment_name}</strong>
                    <span>
                      ({exp.hyperparameters?.n_estimators} cây, sâu{' '}
                      {exp.hyperparameters?.max_depth ?? '∞'})
                    </span>
                    <code className="sci-mono">
                      {String(exp.split_id || '').slice(0, 6)}
                    </code>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {isComparing && (
          <div className="sci-state">
            <div className="sci-spinner" />
            <div style={{ fontWeight: 700, color: '#0f172a' }}>
              Đang đối chiếu chỉ số MAE / RMSE của các thí nghiệm...
            </div>
          </div>
        )}

        {!isComparing && compareError && (
          <div className="sci-state sci-state--error">
            <p style={{ margin: 0, fontWeight: 700 }}>{compareError}</p>
          </div>
        )}

        {!isComparing && !compareError && comparedList.length === 0 && (
          <div className="sci-state">
            <GitCompareArrows size={34} style={{ marginBottom: '0.5rem', color: '#94a3b8' }} />
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
              Chưa có bảng kết quả so sánh
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              Đánh dấu ít nhất <strong>2 thí nghiệm COMPLETED</strong> cùng Split ID ở trên rồi nhấn{' '}
              <strong>&ldquo;So sánh đã chọn&rdquo;</strong>.
            </div>
          </div>
        )}

        {!isComparing && comparedList.length >= 2 && (
          <>
            {/* Best by Horizon Summary Cards */}
            <div className="sci-fe-config-grid">
              {['1', '3', '5'].map((h) => {
                const tiedIds = (tiedIdsByHorizon?.[h] || []).map(String)
                const tiedNames = comparedList
                  .filter((item) => tiedIds.includes(String(item.experiment_id)))
                  .map((item) => item.experiment_name)
                const displayWinner =
                  tiedNames.length > 1
                    ? `${tiedNames.join(', ')} (Đồng hạng)`
                    : bestByHorizon?.[h] || '—'

                return (
                  <div key={h} className="sci-fe-config-item sci-fe-config-item--winner">
                    <small>RMSE thấp nhất · Horizon +{h} phút</small>
                    <strong>
                      <Trophy size={15} style={{ color: '#059669', flexShrink: 0 }} />
                      <span>{displayWinner}</span>
                    </strong>
                    <span className="sci-fe-config-sub">
                      Tiêu chí: Minimum Test RMSE tại +{h} phút
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Horizontal Comparison Table as specified in gợi ý.txt */}
            <div className="sci-table-wrap">
              <table className="sci-table sci-compare-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: '210px' }}>Chỉ số</th>
                    {comparedList.map((exp) => (
                      <th key={exp.experiment_id} style={{ textAlign: 'right', minWidth: '150px' }}>
                        <div className="sci-compare-col-head">
                          <span className="sci-compare-col-head__name">{exp.experiment_name}</span>
                          {onViewExperimentDetail && (
                            <button
                              type="button"
                              className="sci-compare-col-head__link"
                              onClick={() => onViewExperimentDetail(exp.experiment_id)}
                              title={`Xem chi tiết ${exp.experiment_name}`}
                            >
                              <Eye size={12} /> Chi tiết
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Hyperparameters Rows */}
                  <tr>
                    <td>
                      <strong>Số cây</strong> <code className="sci-mono">(n_estimators)</code>
                    </td>
                    {comparedList.map((exp) => (
                      <td key={exp.experiment_id} style={{ textAlign: 'right', fontWeight: 700 }}>
                        {exp.n_estimators}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td>
                      <strong>Độ sâu</strong> <code className="sci-mono">(max_depth)</code>
                    </td>
                    {comparedList.map((exp) => (
                      <td key={exp.experiment_id} style={{ textAlign: 'right', fontWeight: 700 }}>
                        {exp.max_depth != null ? exp.max_depth : 'Không giới hạn'}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td>
                      Mẫu tối thiểu chia nhánh <code className="sci-mono">(min_samples_split)</code>
                    </td>
                    {comparedList.map((exp) => (
                      <td key={exp.experiment_id} style={{ textAlign: 'right' }}>
                        {exp.min_samples_split}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td>
                      Mẫu tối thiểu nút lá <code className="sci-mono">(min_samples_leaf)</code>
                    </td>
                    {comparedList.map((exp) => (
                      <td key={exp.experiment_id} style={{ textAlign: 'right' }}>
                        {exp.min_samples_leaf}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td>
                      Số đặc trưng <code className="sci-mono">(max_features)</code>
                    </td>
                    {comparedList.map((exp) => (
                      <td key={exp.experiment_id} style={{ textAlign: 'right' }}>
                        {exp.max_features != null ? String(exp.max_features) : 'null'}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td>
                      Lấy mẫu có hoàn lại <code className="sci-mono">(bootstrap)</code>
                    </td>
                    {comparedList.map((exp) => (
                      <td key={exp.experiment_id} style={{ textAlign: 'right' }}>
                        {exp.bootstrap ? 'Bật' : 'Tắt'}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td>
                      Hạt giống ngẫu nhiên <code className="sci-mono">(random_state)</code>
                    </td>
                    {comparedList.map((exp) => (
                      <td key={exp.experiment_id} style={{ textAlign: 'right' }}>
                        {exp.random_state}
                      </td>
                    ))}
                  </tr>

                  {/* Horizon +1, +3, +5 MAE & RMSE Rows */}
                  {['1', '3', '5'].map((h) => {
                    const tied = isHorizonTied(h)
                    return [
                      <tr key={`mae-${h}`}>
                        <td>
                          <strong>MAE +{h}</strong> (phút)
                        </td>
                        {comparedList.map((exp) => (
                          <td key={exp.experiment_id} style={{ textAlign: 'right' }}>
                            {formatMetric(exp.performance?.[h]?.mae, 4)}
                          </td>
                        ))}
                      </tr>,
                      <tr key={`rmse-${h}`} className="sci-compare-row-rmse">
                        <td>
                          <strong>RMSE +{h}</strong> (phút)
                        </td>
                        {comparedList.map((exp) => {
                          const winner = isHorizonWinner(h, exp.experiment_id)
                          return (
                            <td
                              key={exp.experiment_id}
                              style={{ textAlign: 'right' }}
                              className={winner ? 'sci-compare-cell-best' : ''}
                            >
                              <div className="sci-compare-rmse-val">
                                {winner && (
                                  <span className="sci-compare-best-badge">
                                    <Trophy size={11} />
                                    {tied ? 'Đồng hạng' : 'Tốt nhất'}
                                  </span>
                                )}
                                <strong>{formatMetric(exp.performance?.[h]?.rmse, 4)}</strong>
                              </div>
                            </td>
                          )
                        })}
                      </tr>,
                    ]
                  })}

                  {/* Timings Rows */}
                  <tr>
                    <td>
                      <strong>Thời gian train</strong>
                    </td>
                    {comparedList.map((exp) => (
                      <td key={exp.experiment_id} style={{ textAlign: 'right' }}>
                        {formatSec(exp.training_time_sec)}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td>
                      <strong>Thời gian dự đoán</strong>
                    </td>
                    {comparedList.map((exp) => (
                      <td key={exp.experiment_id} style={{ textAlign: 'right' }}>
                        {formatSec(exp.prediction_time_sec)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer Disclaimer Note required by gợi ý.txt */}
            <div className="sci-notice">
              <Info size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>Lưu ý đánh giá:</strong> Đây là{' '}
                <strong>kết quả so sánh theo từng horizon (+1, +3, +5 phút)</strong> dựa trên chỉ số RMSE thấp nhất ở mỗi mốc dự báo,{' '}
                <strong>chưa phải quyết định chọn mô hình cuối cùng</strong>.
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

