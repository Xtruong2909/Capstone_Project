import {
  Cpu,
  Play,
  Loader2,
  ArrowRight,
  Clock,
  Database,
  MapPin,
  Layers,
  CheckCircle2,
  Sliders,
} from 'lucide-react'

function formatShortTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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
  featureData,
  datasetMeta,
  forecastData,
  isLoading,
  error,
  onGenerate,
  onProceedToPredict,
}) {
  const handleRun = (e) => {
    e.preventDefault()
    onGenerate('MAIN_ROI')
  }

  const config = featureData?.configuration
  const featureOrder = featureData?.feature_order || ['lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5']
  const horizons = featureData?.forecast_horizons || config?.forecast_horizons || [1, 3, 5]
  const targetTimes = featureData?.target_times || []
  const xVector = featureData?.x || []
  const recordingSessionId = featureData?.recording_session_id || '—'
  const versionLabel = datasetMeta
    ? `${datasetMeta.dataset_name} (${datasetMeta.version_tag})`
    : featureData?.dataset_version_id || '—'

  // Map predicted flow by horizon if forecastData is already available
  const predictedByHorizon = {}
  if (Array.isArray(forecastData?.predictions)) {
    forecastData.predictions.forEach((pt) => {
      predictedByHorizon[pt.horizon] = pt.predicted_flow
    })
  }

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

          {featureData && onProceedToPredict && (
            <button
              type="button"
              className="btn-action sci-train-btn sci-btn-emerald"
              onClick={onProceedToPredict}
            >
              <span>Tiếp tục Dự báo Lưu lượng</span>
              <ArrowRight size={16} />
            </button>
          )}
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
            {/* 4 Metadata & Configuration Summary Cards (same style as TrainingFeaturePanel) */}
            <div className="sci-fe-config-grid">
              <div className="sci-fe-config-item">
                <small>Dataset Version</small>
                <strong title={String(featureData.dataset_version_id || '')}>
                  <Database size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                  <span className="sci-truncate">{versionLabel}</span>
                </strong>
                <span className="sci-fe-config-sub sci-mono">
                  {String(featureData.dataset_version_id || '').slice(0, 18)}…
                </span>
              </div>

              <div className="sci-fe-config-item">
                <small>ROI &amp; Phiên ghi hình</small>
                <strong title={recordingSessionId}>
                  <MapPin size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />
                  <span>{featureData.roi_identifier || 'MAIN_ROI'}</span>
                </strong>
                <span className="sci-fe-config-sub sci-mono" title={recordingSessionId}>
                  Session: {String(recordingSessionId).slice(0, 22)}
                </span>
              </div>

              <div className="sci-fe-config-item">
                <small>Cửa sổ Quan sát Mới nhất</small>
                <strong>
                  <CheckCircle2 size={14} style={{ color: '#15803d', flexShrink: 0 }} />
                  <span>
                    {formatShortTime(featureData.history_start_time)} →{' '}
                    {formatShortTime(featureData.latest_time_bucket)}
                  </span>
                </strong>
                <span className="sci-fe-config-sub">
                  5 mốc quan sát liên tục (t-4 → t) · Mốc gốc: {formatDateTime(featureData.latest_time_bucket)}
                </span>
              </div>

              <div className="sci-fe-config-item">
                <small>Cấu hình Đặc trưng &amp; Horizon</small>
                <strong>
                  <Sliders size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                  <span>
                    {config?.lag_count ?? 5} lag · Dự báo +{horizons.join('/+')} phút
                  </span>
                </strong>
                <span className="sci-fe-config-sub">
                  Phương pháp: {config?.method || 'sliding_window'} ({config?.aggregation_interval ?? 60}s)
                </span>
              </div>
            </div>

            {/* Visual Sliding Window Inspector (same layout as TrainingFeaturePanel) */}
            <div className="sci-fe-window">
              <div className="sci-fe-window__header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="sci-pill sci-pill--version">
                    Cửa sổ Dự báo Mới nhất
                  </span>
                  <span className="sci-fe-window__title">
                    Mốc gốc dự báo (Origin){' '}
                    <strong>t = {formatShortTime(featureData.latest_time_bucket)}</strong>
                  </span>
                </div>
                <span className="sci-fe-window__range">
                  <Clock size={13} /> Cửa sổ lịch sử (5 phút):{' '}
                  {formatShortTime(featureData.history_start_time)} →{' '}
                  {formatShortTime(featureData.latest_time_bucket)}
                </span>
              </div>

              <div className="sci-fe-window__body">
                {/* Left: Input Features X */}
                <div className="sci-fe-vector sci-fe-vector--x">
                  <div className="sci-fe-vector__label">
                    <span>Vector đầu vào X (5 Lag quan sát: mới nhất → cũ nhất)</span>
                    <code>x = [{xVector.map(formatFlow).join(', ')}]</code>
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
                    <span>Mốc thời gian mục tiêu cần dự báo (+1, +3, +5 phút)</span>
                    <code>
                      target_times = [{targetTimes.map(formatShortTime).join(', ')}]
                    </code>
                  </div>
                  <div className="sci-fe-vector__Row">
                    {horizons.map((h, idx) => {
                      const tTime = targetTimes[idx]
                      const predVal = predictedByHorizon[h]
                      return (
                        <div key={h} className="sci-fe-cell sci-fe-cell--y">
                          <span className="sci-fe-cell__name">Horizon +{h}m</span>
                          <strong className="sci-fe-cell__val">
                            {predVal != null ? `${formatFlow(predVal)} xe/p` : formatShortTime(tTime)}
                          </strong>
                          <small className="sci-fe-cell__meta">
                            {predVal != null
                              ? `Tại ${formatShortTime(tTime)}`
                              : 'Chờ chạy dự báo'}
                          </small>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Prediction Feature Window Table (mirrors TrainingFeaturePanel table) */}
            <div className="sci-table-wrap">
              <table className="sci-table">
                <thead>
                  <tr>
                    <th style={{ width: '48px', textAlign: 'center' }}>#</th>
                    <th>History Start (t-4)</th>
                    <th>Latest Bucket (t)</th>
                    {featureOrder.map((f, i) => (
                      <th key={f} className="sci-th-x">
                        {f} ({i === 0 ? 't' : `t-${i}`})
                      </th>
                    ))}
                    {horizons.map((h) => (
                      <th key={h} className="sci-th-y">
                        Mốc dự báo (+{h}m)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="sci-row-selected">
                    <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 700 }}>
                      1
                    </td>
                    <td>{formatShortTime(featureData.history_start_time)}</td>
                    <td style={{ fontWeight: 700 }}>
                      {formatShortTime(featureData.latest_time_bucket)}
                    </td>
                    {featureOrder.map((f, i) => (
                      <td key={f} className="sci-td-x">
                        {formatFlow(featureData.features?.[f] ?? xVector[i])}
                      </td>
                    ))}
                    {horizons.map((h, i) => (
                      <td key={h} className="sci-td-y">
                        <strong>{formatShortTime(targetTimes[i])}</strong>
                        <span className="sci-td-time">
                          {predictedByHorizon[h] != null
                            ? `Dự báo: ${formatFlow(predictedByHorizon[h])} xe/phút`
                            : `Horizon +${h} phút`}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

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

