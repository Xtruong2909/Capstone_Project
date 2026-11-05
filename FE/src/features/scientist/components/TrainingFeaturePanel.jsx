import { useState } from 'react'
import {
  Cpu,
  Play,
  Loader2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react'
import { formatNumber } from '../utils/formatters'

const PAGE_SIZE = 15

function formatShortTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
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
              Extract 5 observed lag features (X) and multi-horizon forecast targets (+1, +3, +5 min Y) using a sliding window.
            </p>
          </div>
        </div>

        <form className="sci-train-actions" onSubmit={handleRun}>
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
              {isLoading ? 'Extracting Lag Features...' : 'Extract Lag Features'}
            </span>
          </button>
        </form>
      </div>

      <div className="sci-card-body">
        {isLoading && (
          <div className="sci-state">
            <div className="sci-spinner" />
            <div style={{ fontWeight: 700, color: '#0f172a' }}>
              Preparing supervised training samples (Lag Features X &amp; Targets Y)...
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
              No lag features extracted yet
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              Click <strong>&ldquo;Extract Lag Features&rdquo;</strong> to build the X / Y sample matrix.
            </div>
          </div>
        )}

        {!isLoading && !error && featureData && (
          <>
            {sampleCount === 0 ? (
              <div className="sci-warning">
                Insufficient continuous 10-minute observations (from t-4 to t+5) to build complete training samples.
              </div>
            ) : (
              <>
                {/* Visual Sliding Window Inspector for the selected sample */}
                {activeSample && (
                  <div className="sci-fe-window">
                    <div className="sci-fe-window__header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="sci-pill sci-pill--version">
                          Sample #{selectedIdx + 1} / {sampleCount}
                        </span>
                        <span className="sci-fe-window__title">
                          Sliding Window at current time bucket{' '}
                          <strong>t = {formatShortTime(activeSample.time_bucket)}</strong>
                        </span>
                      </div>
                      <span className="sci-fe-window__range">
                        <Clock size={13} /> History window: {formatShortTime(activeSample.history_start_time)} →{' '}
                        {formatShortTime(activeSample.time_bucket)}
                      </span>
                    </div>

                    <div className="sci-fe-window__body">
                      {/* Left: Input Features X */}
                      <div className="sci-fe-vector sci-fe-vector--x">
                        <div className="sci-fe-vector__label">
                          <span>Input Vector X (Observed Lags: newest → oldest)</span>
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
                          <span>Target Vector Y (Future Forecast Horizons)</span>
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
                            title="Click to inspect the sliding window for this sample"
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
                      Showing samples{' '}
                      <strong>
                        {(page - 1) * PAGE_SIZE + 1}–
                        {Math.min(page * PAGE_SIZE, samples.length)}
                      </strong>{' '}
                      of <strong>{formatNumber(samples.length)}</strong>
                    </span>
                    <div className="sci-pager__controls">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft size={14} /> Prev
                      </button>
                      <span style={{ fontWeight: 600, padding: '0 0.4rem' }}>
                        Page {page} / {totalPages}
                      </span>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next <ChevronRight size={14} />
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
