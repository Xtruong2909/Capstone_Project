import { useState } from 'react'
import {
  Cpu,
  Play,
  Loader2,
  ArrowRight,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import usePredictionLagWindows from '../../../hooks/usePredictionLagWindows'
import {
  formatRecordingDateTime as formatDateTime,
  formatRecordingTime as formatShortTime,
  formatRecordingTimeAtSource,
} from '../utils/formatters'

const HISTORY_PAGE_SIZE = 20

function formatFlow(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  const num = Number(val)
  return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

/**
 * UI component for POST /api/feature-engineering/prediction
 * Mirrors TrainingFeaturePanel layout for the latest 5-lag observation window.
 */
export default function PredictionFeaturePanel({
  datasetId,
  featureData,
  isLoading,
  error,
  onGenerate,
  onProceedToPredict,
}) {
  const handleRun = (e) => {
    e.preventDefault()
    onGenerate('MAIN_ROI')
  }

  const featureOrder = featureData?.feature_order || ['lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5']
  const horizons = featureData?.forecast_horizons || [1, 3, 5]
  const targetTimes = featureData?.target_times || []
  const xVector = featureData?.x || []
  const lagHistory = usePredictionLagWindows(datasetId, featureData)
  const [historyPage, setHistoryPage] = useState(1)
  const historicalWindows = [...lagHistory.windows].reverse()
  const totalHistoryPages = Math.max(1, Math.ceil(historicalWindows.length / HISTORY_PAGE_SIZE))
  const currentHistoryPage = Math.min(historyPage, totalHistoryPages)
  const visibleWindows = historicalWindows.slice(
    (currentHistoryPage - 1) * HISTORY_PAGE_SIZE,
    currentHistoryPage * HISTORY_PAGE_SIZE
  )

  return (
    <section className="admin-card">
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--blue">
            <Cpu size={18} />
          </div>
          <div>
            <h2 className="admin-card__title">
              Bước 1 · Tạo Đặc trưng cho Dự báo (Prediction Lag Features)
            </h2>
            <p className="admin-card__subtitle">
              Trích xuất 5 đặc trưng trễ quan sát mới nhất (X: lag_1..lag_5) và các mốc thời gian mục tiêu (+1, +3, +5 phút) theo cửa sổ trượt.
            </p>
          </div>
        </div>

        <div className="sci-train-actions">
          <form onSubmit={handleRun} style={{ display: 'inline-flex' }}>
            <button
              type="submit"
              className="btn-action btn-action--primary sci-train-btn"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 size={16} className="sci-spin" />
              ) : (
                <Play size={16} />
              )}
              <span>
                {isLoading ? 'Đang trích xuất Lag Features...' : 'Tạo Đặc trưng Dự báo'}
              </span>
            </button>
          </form>
        </div>
      </div>

      <div className="sci-card-body">
        {isLoading && (
          <div className="sci-state">
            <div className="sci-spinner" />
            <div style={{ fontWeight: 700, color: '#0f172a' }}>
              Đang trích xuất 5 quan sát trễ mới nhất (lag_1..lag_5) và mốc thời gian dự báo (+1, +3, +5 phút)...
            </div>
          </div>
        )}

        {!isLoading && error && (
          <div className="sci-state sci-state--error">
            <p style={{ margin: 0, fontWeight: 700 }}>{error}</p>
          </div>
        )}

        {!isLoading && !error && !featureData && (
          <div className="sci-state">
            <Cpu size={34} style={{ marginBottom: '0.5rem', color: '#94a3b8' }} />
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
              Chưa tạo dữ liệu Đặc trưng Dự báo (Lag Features)
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              Nhấn <strong>&ldquo;Tạo Đặc trưng Dự báo&rdquo;</strong> ở góc trên để trích xuất vector đầu vào X (5 lag mới nhất) và mốc thời gian dự báo +1, +3, +5 phút.
            </div>
          </div>
        )}

        {!isLoading && !error && featureData && (
          <>
            {/* The latest observed window is the only prediction feature sample. */}
            <div className="sci-fe-window">
              <div className="sci-fe-window__header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="sci-pill sci-pill--version">
                    Cửa sổ Dự báo Mới nhất
                  </span>
                  <span className="sci-fe-window__title">
                    Mốc gốc dự báo (Origin){' '}
                    <strong title={formatDateTime(featureData.latest_time_bucket)}>
                      t = {formatShortTime(featureData.latest_time_bucket)}
                    </strong>
                  </span>
                </div>
                <span className="sci-fe-window__range">
                  <Clock size={13} /> 5 mốc quan sát, mỗi mốc 1 phút:{' '}
                  {formatShortTime(featureData.history_start_time)} →{' '}
                  {formatShortTime(featureData.latest_time_bucket)}
                </span>
              </div>

              <div className="sci-fe-window__body">
                {/* Left: Input Features X */}
                <div className="sci-fe-vector sci-fe-vector--x">
                  <div className="sci-fe-vector__label">
                    <span>Đầu vào X · 5 lag mới nhất → cũ nhất (xe/phút)</span>
                  </div>
                  <div className="sci-fe-vector__Row">
                    {featureOrder.map((key, idx) => {
                      const val = featureData.features?.[key] ?? xVector[idx]
                      const offsetLabel = idx === 0 ? 't (mới nhất)' : `t-${idx}m`
                      return (
                        <div key={key} className="sci-fe-cell sci-fe-cell--x">
                          <span className="sci-fe-cell__name">{key}</span>
                          <strong className="sci-fe-cell__val">{formatFlow(val)}</strong>
                          <small className="sci-fe-cell__meta">{offsetLabel}</small>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="sci-fe-window__arrow">
                  <ArrowRight size={20} />
                </div>

                {/* Right: Target Forecast Timestamps (+1, +3, +5 min) */}
                <div className="sci-fe-vector sci-fe-vector--y">
                  <div className="sci-fe-vector__label">
                    <span>Mốc thời gian cần dự báo · +1, +3, +5 phút</span>
                  </div>
                  <div className="sci-fe-vector__Row">
                    {horizons.map((h, idx) => {
                      const tTime = targetTimes[idx]
                      return (
                        <div key={h} className="sci-fe-cell sci-fe-cell--y">
                          <span className="sci-fe-cell__name">+{h} phút</span>
                          <strong className="sci-fe-cell__val" title={formatDateTime(tTime)}>
                            {formatShortTime(tTime)}
                          </strong>
                          <small className="sci-fe-cell__meta">Mốc mục tiêu</small>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="sci-lag-table-heading">
              <div>
                <h3>Các cửa sổ Lag Features từ dữ liệu đã tổng hợp</h3>
                <p>
                  {lagHistory.isLoading
                    ? 'Đang tải các mốc quan sát...'
                    : lagHistory.error
                      ? lagHistory.error
                      : `${lagHistory.bucketCount} mốc tổng hợp tạo được ${historicalWindows.length} cửa sổ đủ 5 lag. Chỉ cửa sổ mới nhất được dùng để dự báo hiện tại.`}
                </p>
              </div>
              <span className="sci-lag-unit">Đơn vị: xe/phút</span>
            </div>

            {lagHistory.isLoading && <div className="sci-state" role="status">Đang tải Lag Features lịch sử...</div>}
            {!lagHistory.isLoading && lagHistory.error && (
              <div className="sci-state sci-state--error" role="alert">{lagHistory.error}</div>
            )}
            {!lagHistory.isLoading && !lagHistory.error && historicalWindows.length === 0 && (
              <div className="sci-state">Chưa có đủ 5 mốc lưu lượng liên tục để tạo một cửa sổ Lag Features.</div>
            )}
            {!lagHistory.isLoading && !lagHistory.error && historicalWindows.length > 0 && (
              <>
                <div className="sci-table-wrap sci-lag-table-wrap">
                  <table className="sci-table sci-lag-table">
                    <thead>
                      <tr>
                        <th scope="col">STT</th>
                        <th scope="col">Time Bucket (t)</th>
                        {featureOrder.map((key, index) => (
                          <th key={key} scope="col" className="sci-th-x">
                            Lag {index + 1} ({index === 0 ? 't' : `t−${index}`})
                          </th>
                        ))}
                        {horizons.map((horizon) => (
                          <th key={horizon} scope="col" className="sci-th-y">Mốc +{horizon} phút</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleWindows.map((window, index) => {
                        const isLatest = Date.parse(window.originTime) === Date.parse(featureData.latest_time_bucket)
                        return (
                          <tr key={window.originTime} className={isLatest ? 'sci-row-selected' : undefined}>
                            <td>{(currentHistoryPage - 1) * HISTORY_PAGE_SIZE + index + 1}</td>
                            <td className="sci-lag-table__time" title={formatDateTime(window.originTime)}>
                              {formatShortTime(window.originTime)}{isLatest && ' · Mới nhất'}
                            </td>
                            {window.x.map((value, lagIndex) => (
                              <td key={lagIndex} className="sci-td-x">{formatFlow(value)}</td>
                            ))}
                            {horizons.map((horizon, targetIndex) => (
                              <td key={horizon} className="sci-td-y">
                                {formatRecordingTimeAtSource(window.targetTimes[targetIndex], window.originTime)}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {totalHistoryPages > 1 && (
                  <div className="sci-pager sci-lag-pager">
                    <span>{historicalWindows.length} cửa sổ · Mới nhất trước</span>
                    <div className="sci-pager__controls">
                      <button type="button" className="btn-secondary" disabled={currentHistoryPage === 1} onClick={() => setHistoryPage(currentHistoryPage - 1)}><ChevronLeft size={14} /> Trước</button>
                      <span>Trang {currentHistoryPage} / {totalHistoryPages}</span>
                      <button type="button" className="btn-secondary" disabled={currentHistoryPage === totalHistoryPages} onClick={() => setHistoryPage(currentHistoryPage + 1)}>Sau <ChevronRight size={14} /></button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Bottom Action Footer */}
            {onProceedToPredict && (
              <div className="sci-step-footer">
                <div className="sci-step-footer__hint">
                  <Layers size={15} />
                  <span>
                    Đã trích xuất thành công <strong>5 đặc trưng trễ mới nhất</strong> tại mốc{' '}
                    <strong>{formatShortTime(featureData.latest_time_bucket)}</strong>. Tiếp tục sang Bước 2 để chạy Final Model dự báo lưu lượng tại +1, +3, +5 phút.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-action btn-action--primary sci-train-btn"
                  onClick={onProceedToPredict}
                >
                  <span>Tiếp tục Dự báo Lưu lượng</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

