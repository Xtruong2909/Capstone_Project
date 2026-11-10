import { useMemo, useState } from 'react'
import {
  ClipboardList,
  Eye,
  GitCompareArrows,
  RefreshCw,
  PlusCircle,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Table2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { formatDate, formatNumber, formatRecordingTime as formatTimeOnly } from '../utils/formatters'

const DETAIL_PAGE_SIZE = 15

const MODEL_LABELS = {
  RANDOM_FOREST: 'Random Forest',
  PERSISTENCE: 'Persistence (Lag 1)',
  HISTORICAL_AVERAGE: 'Historical Average',
}

function formatMetric(val, digits = 4) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  return Number(val).toFixed(digits)
}

function formatFlow(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  const num = Number(val)
  return Number.isInteger(num) ? String(num) : num.toFixed(2)
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
 * Step 4: UI component for:
 * - GET /api/model-training/experiments (Danh sách thí nghiệm)
 * - GET /api/model-training/experiments/{experiment_id} (Xem chi tiết thí nghiệm - 4 phần)
 */
export default function ExperimentListDetailPanel({
  datasetMeta,
  versionId,
  experiments = [],
  isLoadingList,
  listError,
  onReloadList,
  selectedExperiment,
  isLoadingDetail,
  detailError,
  onSelectExperiment,
  onBackToList,
  onCreateWithSameSplit,
  selectedCompareIds = [],
  onChangeCompareIds,
  onCompareSelected,
  isComparing,
}) {
  const [copiedSplitId, setCopiedSplitId] = useState(false)
  const [modelFilter, setModelFilter] = useState('ALL')
  const [horizonFilter, setHorizonFilter] = useState('ALL')
  const [detailPage, setDetailPage] = useState(1)

  const selectedSet = useMemo(() => new Set(selectedCompareIds.map(String)), [selectedCompareIds])

  const anchorExperiment = useMemo(() => {
    if (selectedCompareIds.length === 0) return null
    const firstId = String(selectedCompareIds[0])
    return experiments.find((e) => String(e.experiment_id) === firstId) || null
  }, [experiments, selectedCompareIds])

  const handleToggleCheckbox = (exp) => {
    const idStr = String(exp.experiment_id)
    if (selectedSet.has(idStr)) {
      onChangeCompareIds?.(selectedCompareIds.filter((id) => String(id) !== idStr))
      return
    }
    if (!isCompatibleWithAnchor(exp, anchorExperiment)) return
    onChangeCompareIds?.([...selectedCompareIds, exp.experiment_id])
  }

  const handleCopySplit = async (splitId) => {
    if (!splitId) return
    try {
      await navigator.clipboard.writeText(String(splitId))
      setCopiedSplitId(true)
      setTimeout(() => setCopiedSplitId(false), 2000)
    } catch {
      // Ignore clipboard failure
    }
  }

  const datasetLabel = datasetMeta
    ? `${datasetMeta.dataset_name} (${datasetMeta.version_tag})`
    : versionId || '—'

  // Filter prediction_details in Table 2
  const rawPredictionDetails = selectedExperiment?.result_tables?.prediction_details
  const filteredPredictionDetails = useMemo(() => {
    const rows = rawPredictionDetails || []
    return rows.filter((row) => {
      if (modelFilter !== 'ALL' && row.model !== modelFilter) return false
      if (horizonFilter !== 'ALL' && String(row.horizon_minutes) !== String(horizonFilter)) {
        return false
      }
      return true
    })
  }, [rawPredictionDetails, modelFilter, horizonFilter])

  const totalDetailPages = Math.max(
    1,
    Math.ceil(filteredPredictionDetails.length / DETAIL_PAGE_SIZE)
  )
  const pagedPredictionDetails = filteredPredictionDetails.slice(
    (detailPage - 1) * DETAIL_PAGE_SIZE,
    detailPage * DETAIL_PAGE_SIZE
  )

  // =========================================================================
  // VIEW MODE 2: EXPERIMENT DETAIL (4 SECTIONS)
  // =========================================================================
  if (selectedExperiment || isLoadingDetail || detailError) {
    const exp = selectedExperiment
    const hp = exp?.hyperparameters || {}
    const horizonForecasts = exp?.result_tables?.horizon_forecasts || []
    const modelSummary = exp?.result_tables?.model_summary || []

    return (
      <section className="admin-card">
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--purple">
              <ClipboardList size={18} />
            </div>
            <div>
              <h2 className="admin-card__title">
                Bước 4 · Chi tiết thí nghiệm {exp?.experiment_name || ''}
              </h2>
              <p className="admin-card__subtitle">
                Thông tin cấu hình, thời gian thực thi và 3 bảng đánh giá kết quả dự báo trên tập Test.
              </p>
            </div>
          </div>

          <div className="sci-train-actions">
            <button
              type="button"
              className="btn-secondary sci-train-btn"
              onClick={onBackToList}
            >
              <ArrowLeft size={16} />
              <span>Quay lại danh sách</span>
            </button>

            {exp?.split_id && (
              <button
                type="button"
                className="btn-action btn-action--primary sci-train-btn"
                onClick={() => onCreateWithSameSplit?.(exp)}
              >
                <PlusCircle size={16} />
                <span>Tạo thí nghiệm khác với cùng Split</span>
              </button>
            )}
          </div>
        </div>

        <div className="sci-card-body">
          {isLoadingDetail && (
            <div className="sci-state">
              <div className="sci-spinner" />
              <div style={{ fontWeight: 700, color: '#0f172a' }}>
                Đang tải chi tiết thí nghiệm...
              </div>
            </div>
          )}

          {!isLoadingDetail && detailError && (
            <div className="sci-state sci-state--error">
              <p style={{ margin: 0, fontWeight: 700 }}>{detailError}</p>
            </div>
          )}

          {!isLoadingDetail && exp && (
            <div className="sci-exp-detail-stack">
              {/* PHẦN 1: THÔNG TIN CHUNG */}
              <div className="sci-exp-section">
                <div className="sci-exp-section__head">
                  <span className="sci-exp-section__num">1</span>
                  <h3 className="sci-exp-section__title">Thông tin chung</h3>
                </div>

                <div className="sci-fe-config-grid">
                  <div className="sci-fe-config-item">
                    <small>Tên thí nghiệm &amp; Trạng thái</small>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '1rem', color: '#1d4ed8' }}>
                        {exp.experiment_name}
                      </strong>
                      <span
                        className={`sci-pill ${
                          exp.status === 'COMPLETED'
                            ? 'sci-pill--approved'
                            : exp.status === 'FAILED'
                              ? 'sci-job__status--failed'
                              : 'sci-pill--version'
                        }`}
                      >
                        {exp.status}
                      </span>
                    </div>
                    <span className="sci-fe-config-sub">
                      Tạo lúc: {formatDate(exp.created_at)}
                    </span>
                  </div>

                  <div className="sci-fe-config-item">
                    <small>Dataset Version</small>
                    <strong title={datasetLabel}>
                      <span className="sci-truncate">{datasetLabel}</span>
                    </strong>
                    <span className="sci-fe-config-sub sci-mono">
                      {String(exp.dataset_version_id)}
                    </span>
                  </div>

                  <div className="sci-fe-config-item">
                    <small>Mã chia dữ liệu (Split ID)</small>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <code className="sci-mono sci-split-code" title={String(exp.split_id)}>
                        {String(exp.split_id).slice(0, 16)}…
                      </code>
                      <button
                        type="button"
                        className="sci-copy-btn"
                        onClick={() => handleCopySplit(exp.split_id)}
                      >
                        {copiedSplitId ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedSplitId ? 'Đã chép' : 'Sao chép'}</span>
                      </button>
                    </div>
                    <span className="sci-fe-config-sub">
                      Horizon: +{(exp.forecast_horizons || [1, 3, 5]).join(', +')} phút
                    </span>
                  </div>

                  <div className="sci-fe-config-item">
                    <small>Chế độ đánh giá</small>
                    <strong>
                      {exp.evaluation_mode === 'official'
                        ? 'Đánh giá chính thức (Official)'
                        : 'Chỉ dùng để đánh giá thử nghiệm (Exploratory)'}
                    </strong>
                    <span className="sci-fe-config-sub">
                      {exp.official_evaluation_eligible
                        ? 'Đủ điều kiện đánh giá chính thức'
                        : 'Chồng lấn cửa sổ thời gian (Thử nghiệm)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* PHẦN 2: CẤU HÌNH RANDOM FOREST */}
              <div className="sci-exp-section">
                <div className="sci-exp-section__head">
                  <span className="sci-exp-section__num">2</span>
                  <h3 className="sci-exp-section__title">
                    Cấu hình Random Forest &amp; Thời gian thực thi
                  </h3>
                </div>

                <div className="sci-rf-summary-grid">
                  <div className="sci-rf-summary-cell">
                    <small>Số cây (n_estimators)</small>
                    <strong>{hp.n_estimators ?? '—'}</strong>
                  </div>
                  <div className="sci-rf-summary-cell">
                    <small>Độ sâu tối đa (max_depth)</small>
                    <strong>{hp.max_depth != null ? hp.max_depth : 'Không giới hạn'}</strong>
                  </div>
                  <div className="sci-rf-summary-cell">
                    <small>Chia nhánh tối thiểu (min_samples_split)</small>
                    <strong>{hp.min_samples_split ?? '—'}</strong>
                  </div>
                  <div className="sci-rf-summary-cell">
                    <small>Mẫu nút lá tối thiểu (min_samples_leaf)</small>
                    <strong>{hp.min_samples_leaf ?? '—'}</strong>
                  </div>
                  <div className="sci-rf-summary-cell">
                    <small>Số đặc trưng (max_features)</small>
                    <strong>{hp.max_features != null ? String(hp.max_features) : 'null'}</strong>
                  </div>
                  <div className="sci-rf-summary-cell">
                    <small>Lấy mẫu hoàn lại (bootstrap)</small>
                    <strong>{hp.bootstrap ? 'Bật (True)' : 'Tắt (False)'}</strong>
                  </div>
                  <div className="sci-rf-summary-cell">
                    <small>Hạt giống (random_state)</small>
                    <strong>{hp.random_state ?? '—'}</strong>
                  </div>
                  <div className="sci-rf-summary-cell sci-rf-summary-cell--accent">
                    <small>Thời gian Train / Dự đoán</small>
                    <strong>
                      {formatSec(exp.training_time_sec)} / {formatSec(exp.prediction_time_sec)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* PHẦN 3: BA BẢNG KẾT QUẢ (HOẶC LỖI NẾU FAILED) */}
              <div className="sci-exp-section">
                <div className="sci-exp-section__head">
                  <span className="sci-exp-section__num">3</span>
                  <h3 className="sci-exp-section__title">Kết quả đánh giá mô hình</h3>
                </div>

                {exp.status === 'FAILED' ? (
                  <div className="sci-state sci-state--error">
                    <AlertCircle size={28} style={{ marginBottom: '0.4rem' }} />
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                      Thí nghiệm {exp.experiment_name} thất bại (FAILED)
                    </div>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {exp.error || 'Quá trình huấn luyện gặp lỗi. Không có bảng kết quả đánh giá.'}
                    </p>
                  </div>
                ) : (
                  <div className="sci-result-tables-stack">
                    {/* Bảng 3.1: Dự báo theo Horizon (horizon_forecasts) */}
                    <div className="sci-subtable-box">
                      <div className="sci-subtable-box__head">
                        <div>
                          <h4>Bảng 1 · Dự báo theo Horizon (Random Forest tại mốc cuối tập Test)</h4>
                          <p>
                            Giá trị dự báo tại mốc thời gian cuối cùng của tập Test cho +1, +3, +5 phút, kèm MSE/RMSE tính trên toàn bộ mẫu Test của từng horizon.
                          </p>
                        </div>
                      </div>
                      <div className="sci-table-wrap">
                        <table className="sci-table">
                          <thead>
                            <tr>
                              <th>Horizon</th>
                              <th>Mốc dự báo (Origin)</th>
                              <th>Mốc mục tiêu (Target)</th>
                              <th>Thực tế (Actual)</th>
                              <th>Dự báo (Predicted)</th>
                              <th>Sai số tuyệt đối (|e|)</th>
                              <th>Số mẫu Test</th>
                              <th>MAE (Horizon)</th>
                              <th>MSE (Horizon)</th>
                              <th>RMSE (Horizon)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {horizonForecasts.map((row) => {
                              const hStr = String(row.horizon_minutes)
                              const horizonMae =
                                exp.performance_by_horizon?.[hStr]?.random_forest?.mae
                              return (
                                <tr key={row.horizon_minutes}>
                                  <td>
                                    <span className="sci-pill sci-pill--version">
                                      +{row.horizon_minutes} phút
                                    </span>
                                  </td>
                                  <td>{formatTimeOnly(row.forecast_origin_time)}</td>
                                  <td style={{ fontWeight: 700 }}>
                                    {formatTimeOnly(row.target_timestamp)}
                                  </td>
                                  <td>{formatFlow(row.actual_traffic_flow)}</td>
                                  <td className="sci-td-x">
                                    <strong>{formatMetric(row.predicted_traffic_flow, 2)}</strong>
                                  </td>
                                  <td>{formatMetric(row.absolute_error, 2)}</td>
                                  <td>{formatNumber(row.sample_count)}</td>
                                  <td>
                                    <strong>{formatMetric(horizonMae, 4)}</strong>
                                  </td>
                                  <td>{formatMetric(row.mse, 4)}</td>
                                  <td className="sci-td-y">
                                    <strong>{formatMetric(row.rmse, 4)}</strong>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Bảng 3.2: Chi tiết dự đoán của ba mô hình (prediction_details) */}
                    <div className="sci-subtable-box">
                      <div className="sci-subtable-box__head">
                        <div>
                          <h4>
                            Bảng 2 · Chi tiết dự đoán của ba mô hình (Random Forest, Persistence, Historical Average)
                          </h4>
                          <p>
                            Toàn bộ dự đoán trên từng dòng tập Test và từng horizon (+1, +3, +5 phút).
                          </p>
                        </div>

                        <div className="sci-subtable-filters">
                          <select
                            className="sci-dataset-select"
                            value={modelFilter}
                            onChange={(e) => {
                              setModelFilter(e.target.value)
                              setDetailPage(1)
                            }}
                          >
                            <option value="ALL">Tất cả mô hình (3)</option>
                            <option value="RANDOM_FOREST">Random Forest</option>
                            <option value="PERSISTENCE">Persistence</option>
                            <option value="HISTORICAL_AVERAGE">Historical Average</option>
                          </select>

                          <select
                            className="sci-dataset-select"
                            value={horizonFilter}
                            onChange={(e) => {
                              setHorizonFilter(e.target.value)
                              setDetailPage(1)
                            }}
                          >
                            <option value="ALL">Tất cả Horizon (+1, +3, +5)</option>
                            <option value="1">Horizon +1 phút</option>
                            <option value="3">Horizon +3 phút</option>
                            <option value="5">Horizon +5 phút</option>
                          </select>
                        </div>
                      </div>

                      <div className="sci-table-wrap">
                        <table className="sci-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Mô hình</th>
                              <th>Horizon</th>
                              <th>Mốc dự báo (Origin)</th>
                              <th>Mốc mục tiêu (Target)</th>
                              <th>Thực tế (Actual)</th>
                              <th>Dự đoán (Predicted)</th>
                              <th>Sai số tuyệt đối (Absolute Error)</th>
                              <th>Sai số bình phương (Squared Error)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedPredictionDetails.map((row, idx) => {
                              const rowNum = (detailPage - 1) * DETAIL_PAGE_SIZE + idx + 1
                              return (
                                <tr
                                  key={`${row.model}-${row.horizon_minutes}-${row.forecast_origin_time}-${idx}`}
                                >
                                  <td style={{ color: '#64748b', fontWeight: 700 }}>{rowNum}</td>
                                  <td>
                                    <span
                                      className={`sci-pill ${
                                        row.model === 'RANDOM_FOREST'
                                          ? 'sci-pill--version'
                                          : 'sci-pill--format'
                                      }`}
                                    >
                                      {MODEL_LABELS[row.model] || row.model}
                                    </span>
                                  </td>
                                  <td>+{row.horizon_minutes} phút</td>
                                  <td>{formatTimeOnly(row.forecast_origin_time)}</td>
                                  <td style={{ fontWeight: 700 }}>
                                    {formatTimeOnly(row.target_timestamp)}
                                  </td>
                                  <td>{formatFlow(row.actual_traffic_flow)}</td>
                                  <td className="sci-td-x">
                                    <strong>{formatMetric(row.predicted_traffic_flow, 2)}</strong>
                                  </td>
                                  <td>{formatMetric(row.absolute_error, 4)}</td>
                                  <td>{formatMetric(row.squared_error, 4)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {filteredPredictionDetails.length > DETAIL_PAGE_SIZE && (
                        <div className="sci-pager">
                          <span>
                            Hiển thị{' '}
                            <strong>
                              {(detailPage - 1) * DETAIL_PAGE_SIZE + 1}–
                              {Math.min(
                                detailPage * DETAIL_PAGE_SIZE,
                                filteredPredictionDetails.length
                              )}
                            </strong>{' '}
                            trên <strong>{filteredPredictionDetails.length}</strong> dòng dự đoán
                          </span>
                          <div className="sci-pager__controls">
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={detailPage <= 1}
                              onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                            >
                              <ChevronLeft size={14} /> Trước
                            </button>
                            <span style={{ fontWeight: 600, padding: '0 0.4rem' }}>
                              Trang {detailPage} / {totalDetailPages}
                            </span>
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={detailPage >= totalDetailPages}
                              onClick={() =>
                                setDetailPage((p) => Math.min(totalDetailPages, p + 1))
                              }
                            >
                              Sau <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bảng 3.3: Tổng hợp MAE / MSE / RMSE (model_summary) */}
                    <div className="sci-subtable-box">
                      <div className="sci-subtable-box__head">
                        <div>
                          <h4>Bảng 3 · Tổng hợp MAE / MSE / RMSE theo mô hình</h4>
                          <p>
                            Sai số gộp trên tất cả cặp mẫu Test và cả 3 horizon (+1, +3, +5 phút) với trọng số bằng nhau.
                          </p>
                        </div>
                      </div>
                      <div className="sci-table-wrap">
                        <table className="sci-table">
                          <thead>
                            <tr>
                              <th>Mô hình</th>
                              <th>Tổng số điểm dự đoán</th>
                              <th>MAE (Gộp)</th>
                              <th>MSE (Gộp)</th>
                              <th>RMSE (Gộp)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {modelSummary.map((row) => (
                              <tr key={row.model}>
                                <td>
                                  <strong
                                    style={{
                                      color:
                                        row.model === 'RANDOM_FOREST' ? '#1d4ed8' : '#334155',
                                    }}
                                  >
                                    {MODEL_LABELS[row.model] || row.model}
                                  </strong>
                                </td>
                                <td>{formatNumber(row.sample_count)}</td>
                                <td>
                                  <strong>{formatMetric(row.mae, 4)}</strong>
                                </td>
                                <td>{formatMetric(row.mse, 4)}</td>
                                <td className="sci-td-y">
                                  <strong>{formatMetric(row.rmse, 4)}</strong>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* PHẦN 4: THAO TÁC */}
              <div className="sci-exp-section">
                <div className="sci-exp-section__head">
                  <span className="sci-exp-section__num">4</span>
                  <h3 className="sci-exp-section__title">Thao tác</h3>
                </div>

                <div className="sci-step-footer" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className="btn-secondary sci-train-btn"
                    onClick={onBackToList}
                  >
                    <ArrowLeft size={16} />
                    <span>Quay lại danh sách</span>
                  </button>

                  {exp.split_id && (
                    <button
                      type="button"
                      className="btn-action btn-action--primary sci-train-btn"
                      onClick={() => onCreateWithSameSplit?.(exp)}
                    >
                      <PlusCircle size={16} />
                      <span>Tạo thí nghiệm khác với cùng Split</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    )
  }

  // =========================================================================
  // VIEW MODE 1: EXPERIMENT LIST
  // =========================================================================
  return (
    <section className="admin-card">
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--purple">
            <ClipboardList size={18} />
          </div>
          <div>
            <h2 className="admin-card__title">
              Bước 4 · Danh sách thí nghiệm ({experiments.length})
            </h2>
            <p className="admin-card__subtitle">
              Danh sách các thí nghiệm của Dataset Version đang chọn. Đánh dấu ít nhất 2 thí nghiệm COMPLETED cùng Split ID để so sánh.
            </p>
          </div>
        </div>

        <div className="sci-train-actions">
          <button
            type="button"
            className="btn-secondary sci-train-btn"
            onClick={onReloadList}
            disabled={isLoadingList}
          >
            <RefreshCw size={15} className={isLoadingList ? 'sci-spin' : ''} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            className="btn-action btn-action--primary sci-train-btn"
            disabled={selectedCompareIds.length < 2 || isComparing}
            onClick={() => onCompareSelected?.(selectedCompareIds)}
          >
            {isComparing ? (
              <Loader2 size={16} className="sci-spin" />
            ) : (
              <GitCompareArrows size={16} />
            )}
            <span>So sánh đã chọn ({selectedCompareIds.length})</span>
          </button>
        </div>
      </div>

      <div className="sci-card-body">
        {anchorExperiment && (
          <div className="sci-notice" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span>
              Đang lọc chọn theo nhóm của <strong>{anchorExperiment.experiment_name}</strong> (Cùng Split{' '}
              <code className="sci-mono">{String(anchorExperiment.split_id).slice(0, 8)}…</code> · Chế độ:{' '}
              <strong>
                {anchorExperiment.evaluation_mode === 'official' ? 'Chính thức' : 'Thử nghiệm'}
              </strong>
              ). Đã chọn <strong>{selectedCompareIds.length}</strong> thí nghiệm.
            </span>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.76rem' }}
              onClick={() => onChangeCompareIds?.([])}
            >
              Bỏ chọn tất cả
            </button>
          </div>
        )}

        {isLoadingList && (
          <div className="sci-state">
            <div className="sci-spinner" />
            <div style={{ fontWeight: 700, color: '#0f172a' }}>
              Đang tải danh sách thí nghiệm...
            </div>
          </div>
        )}

        {!isLoadingList && listError && (
          <div className="sci-state sci-state--error">
            <p style={{ margin: 0, fontWeight: 700 }}>{listError}</p>
          </div>
        )}

        {!isLoadingList && !listError && experiments.length === 0 && (
          <div className="sci-state">
            <Table2 size={34} style={{ marginBottom: '0.5rem', color: '#94a3b8' }} />
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
              Chưa có thí nghiệm nào cho Dataset Version này
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              Hãy thực hiện <strong>Bước 2: Chia Train/Test 70/30</strong> và{' '}
              <strong>Bước 3: Cấu hình &amp; chạy thí nghiệm</strong> để tạo thí nghiệm đầu tiên.
            </div>
          </div>
        )}

        {!isLoadingList && !listError && experiments.length > 0 && (
          <div className="sci-table-wrap">
            <table className="sci-table">
              <thead>
                <tr>
                  <th style={{ width: '44px', textAlign: 'center' }}>Chọn</th>
                  <th>Tên</th>
                  <th>Split ID</th>
                  <th>Số cây</th>
                  <th>Độ sâu</th>
                  <th>Trạng thái</th>
                  <th className="sci-th-x">MAE / RMSE (+1m)</th>
                  <th className="sci-th-x">MAE / RMSE (+3m)</th>
                  <th className="sci-th-x">MAE / RMSE (+5m)</th>
                  <th>Thời gian Train</th>
                  <th>Ngày tạo</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((exp) => {
                  const idStr = String(exp.experiment_id)
                  const isChecked = selectedSet.has(idStr)
                  const isCompatible = isCompatibleWithAnchor(exp, anchorExperiment)
                  const canCheck = isChecked || isCompatible

                  const m1 = exp.performance_by_horizon?.['1']?.random_forest
                  const m3 = exp.performance_by_horizon?.['3']?.random_forest
                  const m5 = exp.performance_by_horizon?.['5']?.random_forest

                  return (
                    <tr
                      key={idStr}
                      className={isChecked ? 'sci-row-selected' : ''}
                      style={!canCheck ? { opacity: 0.6 } : undefined}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!canCheck}
                          onChange={() => handleToggleCheckbox(exp)}
                          title={
                            canCheck
                              ? `Chọn ${exp.experiment_name} để so sánh`
                              : 'Chỉ chọn được thí nghiệm COMPLETED có cùng Split ID và chế độ đánh giá'
                          }
                          style={{ width: '16px', height: '16px', cursor: canCheck ? 'pointer' : 'not-allowed' }}
                        />
                      </td>
                      <td>
                        <strong style={{ color: '#1d4ed8', fontSize: '0.9rem' }}>
                          {exp.experiment_name}
                        </strong>
                      </td>
                      <td>
                        <code className="sci-mono" title={String(exp.split_id)}>
                          {String(exp.split_id || '').slice(0, 8)}…
                        </code>
                      </td>
                      <td>
                        <strong>{exp.hyperparameters?.n_estimators ?? '—'}</strong>
                      </td>
                      <td>
                        {exp.hyperparameters?.max_depth != null
                          ? exp.hyperparameters.max_depth
                          : '∞'}
                      </td>
                      <td>
                        <span
                          className={`sci-pill ${
                            exp.status === 'COMPLETED'
                              ? 'sci-pill--approved'
                              : exp.status === 'FAILED'
                                ? 'sci-job__status--failed'
                                : 'sci-pill--version'
                          }`}
                        >
                          {exp.status}
                        </span>
                      </td>
                      <td>
                        {m1 ? (
                          <span>
                            {formatMetric(m1.mae, 2)} / <strong>{formatMetric(m1.rmse, 2)}</strong>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {m3 ? (
                          <span>
                            {formatMetric(m3.mae, 2)} / <strong>{formatMetric(m3.rmse, 2)}</strong>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {m5 ? (
                          <span>
                            {formatMetric(m5.mae, 2)} / <strong>{formatMetric(m5.rmse, 2)}</strong>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{formatSec(exp.training_time_sec)}</td>
                      <td>{formatDate(exp.created_at)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="sci-action-chip"
                            onClick={() => onSelectExperiment?.(exp.experiment_id)}
                          >
                            <Eye size={14} />
                            <span>Xem chi tiết</span>
                          </button>
                          <button
                            type="button"
                            className="sci-action-chip"
                            title="Tạo thí nghiệm mới với cùng Split ID"
                            onClick={() => onCreateWithSameSplit?.(exp)}
                          >
                            <PlusCircle size={14} />
                            <span>Cùng Split</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
