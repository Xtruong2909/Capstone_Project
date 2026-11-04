import { useState } from 'react'
import {
  Cpu,
  Play,
  Loader2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Layers,
  Clock,
  Target,
} from 'lucide-react'
import { formatDate, formatNumber } from '../utils/formatters'

const PAGE_SIZE = 15

function formatShortTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatFlow(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  const num = Number(val)
  return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

/**
 * UI component for POST /api/feature-engineering/training
 */
export default function TrainingFeaturePanel({
  featureData,
  isLoading,
  error,
  onGenerate,
}) {
  const [roiInput, setRoiInput] = useState('MAIN_ROI')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [page, setPage] = useState(1)

  const handleRun = (e) => {
    e.preventDefault()
    setSelectedIdx(0)
    setPage(1)
    onGenerate(roiInput.trim() || 'MAIN_ROI')
  }

  const samples = featureData?.samples || []
  const sampleCount = featureData?.sample_count ?? samples.length
  const config = featureData?.configuration
  const featureOrder = featureData?.feature_order || ['lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5']
  const targetOrder = featureData?.target_order || ['target_h1', 'target_h3', 'target_h5']

  const totalPages = Math.max(1, Math.ceil(samples.length / PAGE_SIZE))
  const pagedSamples = samples.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const activeSample = samples[selectedIdx] || samples[0] || null

  return (
    <section className="admin-card">
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--blue">
            <Cpu size={18} />
          </div>
          <div>
            <h2 className="admin-card__title">
              Feature Engineering · Training Samples (X / Y)
            </h2>
            <p className="admin-card__subtitle">
              Trích xuất đặc trưng trễ (5 lags đầu vào X) và nhãn dự báo đa bước (+1, +3, +5 phút đầu ra Y) bằng phương pháp cửa sổ trượt.
            </p>
          </div>
        </div>

        <form className="sci-train-actions" onSubmit={handleRun}>
          <div className="sci-params-bar__group">
            <span className="sci-params-bar__label">ROI:</span>
            <input
              className="admin-input"
              style={{ width: 130, height: 38, boxSizing: 'border-box' }}
              value={roiInput}
              maxLength={64}
              onChange={(e) => setRoiInput(e.target.value)}
              disabled={isLoading}
              placeholder="MAIN_ROI"
            />
          </div>

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
              {isLoading ? 'Đang trích xuất X/Y...' : 'Trích xuất đặc trưng huấn luyện'}
            </span>
          </button>
        </form>
      </div>

      <div className="sci-card-body">
        {isLoading && (
          <div className="sci-state">
            <div className="sci-spinner" />
            <div style={{ fontWeight: 700, color: '#0f172a' }}>
              Đang chuẩn bị tập mẫu huấn luyện (Lag Features X &amp; Targets Y)...
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
              Chưa trích xuất đặc trưng huấn luyện
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              Nhấn nút <strong>&ldquo;Trích xuất đặc trưng huấn luyện&rdquo;</strong> để gọi API{' '}
              <code>POST /api/feature-engineering/training</code> và tạo ma trận mẫu X / Y.
            </div>
          </div>
        )}

        {!isLoading && !error && featureData && (
          <>
            {/* Configuration Summary Bar */}
            <div className="sci-fe-config-grid">
              <div className="sci-fe-config-item">
                <small>Tổng số mẫu (Samples)</small>
                <strong>
                  <CheckCircle2 size={15} style={{ color: '#16a34a' }} />
                  {formatNumber(sampleCount)} mẫu hoàn chỉnh
                </strong>
              </div>

              <div className="sci-fe-config-item">
                <small>Phương pháp &amp; Khung giờ</small>
                <strong>
                  <Layers size={15} style={{ color: '#1668e3' }} />
                  {config?.method || 'sliding_window'} · {config?.aggregation_interval ?? 60}s
                </strong>
              </div>

              <div className="sci-fe-config-item">
                <small>Biến mục tiêu (Target)</small>
                <strong>
                  <Target size={15} style={{ color: '#7c3aed' }} />
                  {config?.target_column || 'traffic_flow'} (ROI: {featureData.roi_identifier})
                </strong>
              </div>

              <div className="sci-fe-config-item">
                <small>Đầu vào X ({config?.lag_count ?? 5} Lags)</small>
                <strong>{featureOrder.join(' → ')}</strong>
              </div>

              <div className="sci-fe-config-item">
                <small>Đầu ra Y (Horizons)</small>
                <strong>
                  {(config?.forecast_horizons || [1, 3, 5]).map((h) => `+${h}m`).join(', ')} (
                  {targetOrder.join(', ')})
                </strong>
              </div>
            </div>

            {sampleCount === 0 ? (
              <div className="sci-warning">
                Dataset chưa có đủ chuỗi 10 phút liên tục hợp lệ (từ t-4 đến t+5) để tạo mẫu huấn luyện hoàn chỉnh.
              </div>
            ) : (
              <>
                {/* Visual Sliding Window Inspector for the selected sample */}
                {activeSample && (
                  <div className="sci-fe-window">
                    <div className="sci-fe-window__header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="sci-pill sci-pill--version">
                          Mẫu #{selectedIdx + 1} / {sampleCount}
                        </span>
                        <span className="sci-fe-window__title">
                          Cửa sổ trượt (Sliding Window) tại mốc hiện tại{' '}
                          <strong>t = {formatShortTime(activeSample.time_bucket)}</strong>
                        </span>
                      </div>
                      <span className="sci-fe-window__range">
                        <Clock size={13} /> Chuỗi lịch sử: {formatDate(activeSample.history_start_time)} →{' '}
                        {formatDate(activeSample.time_bucket)}
                      </span>
                    </div>

                    <div className="sci-fe-window__body">
                      {/* Left: Input Features X */}
                      <div className="sci-fe-vector sci-fe-vector--x">
                        <div className="sci-fe-vector__label">
                          <span>Vector đầu vào X (Observed Lags: mới nhất → cũ nhất)</span>
                          <code>x = [{activeSample.x.map(formatFlow).join(', ')}]</code>
                        </div>
                        <div className="sci-fe-vector__Row">
                          {featureOrder.map((key, idx) => {
                            const val = activeSample.features?.[key] ?? activeSample.x?.[idx]
                            const offsetLabel = idx === 0 ? 't' : `t-${idx}m`
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

                      {/* Right: Target Labels Y */}
                      <div className="sci-fe-vector sci-fe-vector--y">
                        <div className="sci-fe-vector__label">
                          <span>Vector nhãn mục tiêu Y (Future Horizons)</span>
                          <code>y = [{activeSample.y.map(formatFlow).join(', ')}]</code>
                        </div>
                        <div className="sci-fe-vector__Row">
                          {targetOrder.map((key, idx) => {
                            const val = activeSample.targets?.[key] ?? activeSample.y?.[idx]
                            const tTime = activeSample.target_times?.[key]
                            const horizonMin = config?.forecast_horizons?.[idx] ?? [1, 3, 5][idx]
                            return (
                              <div key={key} className="sci-fe-cell sci-fe-cell--y">
                                <span className="sci-fe-cell__name">
                                  {key} (+{horizonMin}m)
                                </span>
                                <strong className="sci-fe-cell__val">{formatFlow(val)}</strong>
                                <small className="sci-fe-cell__meta">{formatShortTime(tTime)}</small>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Full Training Samples Table */}
                <div className="sci-table-wrap">
                  <table className="sci-table">
                    <thead>
                      <tr>
                        <th style={{ width: '48px', textAlign: 'center' }}>#</th>
                        <th>History Start (t-4)</th>
                        <th>Time Bucket (t)</th>
                        {featureOrder.map((f, i) => (
                          <th key={f} className="sci-th-x">
                            {f} ({i === 0 ? 't' : `t-${i}`})
                          </th>
                        ))}
                        {targetOrder.map((tKey, i) => {
                          const h = config?.forecast_horizons?.[i] ?? [1, 3, 5][i]
                          return (
                            <th key={tKey} className="sci-th-y">
                              {tKey} (+{h}m)
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSamples.map((s, idx) => {
                        const globalIdx = (page - 1) * PAGE_SIZE + idx
                        const isSelected = globalIdx === selectedIdx
                        return (
                          <tr
                            key={`${s.time_bucket}-${globalIdx}`}
                            className={isSelected ? 'sci-row-selected' : ''}
                            onClick={() => setSelectedIdx(globalIdx)}
                            style={{ cursor: 'pointer' }}
                            title="Nhấn để xem chi tiết cửa sổ trượt của mẫu này"
                          >
                            <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 700 }}>
                              {globalIdx + 1}
                            </td>
                            <td>{formatShortTime(s.history_start_time)}</td>
                            <td style={{ fontWeight: 700 }}>{formatShortTime(s.time_bucket)}</td>
                            {featureOrder.map((f, i) => (
                              <td key={f} className="sci-td-x">
                                {formatFlow(s.features?.[f] ?? s.x?.[i])}
                              </td>
                            ))}
                            {targetOrder.map((tKey, i) => (
                              <td key={tKey} className="sci-td-y">
                                <strong>{formatFlow(s.targets?.[tKey] ?? s.y?.[i])}</strong>
                                {s.target_times?.[tKey] && (
                                  <span className="sci-td-time">
                                    {formatShortTime(s.target_times[tKey])}
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {samples.length > PAGE_SIZE && (
                  <div className="sci-pager">
                    <span>
                      Hiển thị mẫu{' '}
                      <strong>
                        {(page - 1) * PAGE_SIZE + 1}–
                        {Math.min(page * PAGE_SIZE, samples.length)}
                      </strong>{' '}
                      trên tổng số <strong>{formatNumber(samples.length)}</strong> mẫu
                    </span>
                    <div className="sci-pager__controls">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft size={14} /> Trước
                      </button>
                      <span style={{ fontWeight: 600, padding: '0 0.4rem' }}>
                        Trang {page} / {totalPages}
                      </span>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Sau <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}

