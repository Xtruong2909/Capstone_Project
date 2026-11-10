import { useState } from 'react'
import {
  Cpu,
  Play,
  Loader2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  MapPin,
  Layers,
  CheckCircle2,
  Sliders,
} from 'lucide-react'
import { formatNumber, formatRecordingTime as formatShortTime } from '../utils/formatters'

const PAGE_SIZE = 15

function formatFlow(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  const num = Number(val)
  return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

/**
 * Step 1: UI component for POST /api/feature-engineering/training
 */
export default function TrainingFeaturePanel({
  featureData,
  datasetMeta,
  isLoading,
  error,
  onGenerate,
  onProceedToSplit,
}) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [page, setPage] = useState(1)

  const handleRun = (e) => {
    e.preventDefault()
    setSelectedIdx(0)
    setPage(1)
    onGenerate('MAIN_ROI')
  }

  const samples = featureData?.samples || []
  const sampleCount = featureData?.sample_count ?? samples.length
  const config = featureData?.configuration
  const featureOrder = featureData?.feature_order || ['lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5']
  const targetOrder = featureData?.target_order || ['target_h1', 'target_h3', 'target_h5']
  const recordingSessionId =
    featureData?.recording_session_id || samples[0]?.recording_session_id || '—'
  const versionLabel = datasetMeta
    ? `${datasetMeta.dataset_name} (${datasetMeta.version_tag})`
    : featureData?.dataset_version_id || '—'

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
              Bước 1 · Tạo Lag Features (X / Y)
            </h2>
            <p className="admin-card__subtitle">
              Trích xuất 5 đặc trưng trễ quan sát (X: lag_1..lag_5) và 3 nhãn dự báo tương lai (+1, +3, +5 phút Y) theo cửa sổ trượt.
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
                {isLoading ? 'Đang trích xuất Lag Features...' : 'Tạo Lag Features'}
              </span>
            </button>
          </form>

          {sampleCount >= 2 && onProceedToSplit && (
            <button
              type="button"
              className="btn-action sci-train-btn sci-btn-emerald"
              onClick={onProceedToSplit}
            >
              <span>Tiếp tục chia Train/Test</span>
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
              Đang chuẩn bị tập mẫu huấn luyện có giám sát (Lag Features X &amp; Targets Y)...
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
              Chưa tạo dữ liệu Lag Features
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              Nhấn <strong>&ldquo;Tạo Lag Features&rdquo;</strong> ở góc trên để trích xuất ma trận mẫu X / Y từ dữ liệu giao thông 1 phút.
            </div>
          </div>
        )}

        {!isLoading && !error && featureData && (
          <>
            {/* Metadata & Configuration Summary Cards as specified in gợi ý.txt */}
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
                <small>Tổng số mẫu hợp lệ</small>
                <strong>
                  <CheckCircle2 size={14} style={{ color: '#15803d', flexShrink: 0 }} />
                  <span>{formatNumber(sampleCount)} mẫu</span>
                </strong>
                <span className="sci-fe-config-sub">
                  Chuỗi quan sát liên tục 10 phút (t-4 → t+5)
                </span>
              </div>

              <div className="sci-fe-config-item">
                <small>Cấu hình Đặc trưng &amp; Nhãn</small>
                <strong>
                  <Sliders size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                  <span>
                    {config?.lag_count ?? 5} lag · Target +
                    {(config?.forecast_horizons || [1, 3, 5]).join('/+')} phút
                  </span>
                </strong>
                <span className="sci-fe-config-sub">
                  Phương pháp: {config?.method || 'sliding_window'} ({config?.aggregation_interval ?? 60}s)
                </span>
              </div>
            </div>

            {sampleCount === 0 ? (
              <div className="sci-warning">
                Không đủ chuỗi quan sát liên tục 10 phút (từ t-4 đến t+5) để tạo mẫu huấn luyện hợp lệ.
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
                          Cửa sổ trượt tại mốc dự báo{' '}
                          <strong>t = {formatShortTime(activeSample.time_bucket)}</strong>
                        </span>
                      </div>
                      <span className="sci-fe-window__range">
                        <Clock size={13} /> Cửa sổ lịch sử: {formatShortTime(activeSample.history_start_time)} →{' '}
                        {formatShortTime(activeSample.time_bucket)}
                      </span>
                    </div>

                    <div className="sci-fe-window__body">
                      {/* Left: Input Features X */}
                      <div className="sci-fe-vector sci-fe-vector--x">
                        <div className="sci-fe-vector__label">
                          <span>Vector đầu vào X (5 Lag quan sát: mới nhất → cũ nhất)</span>
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
                          <span>Vector nhãn mục tiêu Y (Horizon tương lai +1, +3, +5 phút)</span>
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
                      trên tổng <strong>{formatNumber(samples.length)}</strong> mẫu
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

                {/* Bottom Action Footer: Tiếp tục chia Train/Test */}
                {sampleCount >= 2 && onProceedToSplit && (
                  <div className="sci-step-footer">
                    <div className="sci-step-footer__hint">
                      <Layers size={15} />
                      <span>
                        Dữ liệu <strong>{formatNumber(sampleCount)} mẫu X/Y</strong> từ Feature Engineering sẽ được tự động chuyển sang API chia Train/Test 70/30 (không cần sao chép JSON).
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-action btn-action--primary sci-train-btn"
                      onClick={onProceedToSplit}
                    >
                      <span>Tiếp tục chia Train/Test</span>
                      <ArrowRight size={16} />
                    </button>
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
