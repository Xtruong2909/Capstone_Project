import { useId, useMemo, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  Loader2,
  Cpu,
  Clock,
  ShieldAlert,
  CheckCircle2,
  BarChart3,
  Activity,
  Table2,
  Sparkles,
} from 'lucide-react'

const LINE_WIDTH = 620
const LINE_HEIGHT = 265
const LINE_PAD = { top: 28, right: 26, bottom: 42, left: 50 }

const BAR_WIDTH = 520
const BAR_HEIGHT = 265
const BAR_PAD = { top: 28, right: 26, bottom: 42, left: 50 }

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

function formatSignedChange(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  const num = Number(val)
  const formatted = Number.isInteger(num) ? String(num) : num.toFixed(2)
  return num > 0 ? `+${formatted}` : formatted
}

function getTrendBadge(trend) {
  if (trend === 'increase') {
    return {
      label: 'Tăng (increase)',
      icon: TrendingUp,
      className: 'sci-pred-trend sci-pred-trend--increase',
    }
  }
  if (trend === 'decrease') {
    return {
      label: 'Giảm (decrease)',
      icon: TrendingDown,
      className: 'sci-pred-trend sci-pred-trend--decrease',
    }
  }
  return {
    label: 'Ổn định (unchanged)',
    icon: Minus,
    className: 'sci-pred-trend sci-pred-trend--unchanged',
  }
}

/**
 * Chart 1: Combined History (5 observed 1-min buckets) + Forecast (+1, +3, +5 min) SVG Line Chart.
 * Positions points by minute offset (-4, -3, -2, -1, 0, +1, +3, +5) without inventing +2 or +4.
 */
function HistoryAndForecastLineChart({ history = [], forecast = [] }) {
  const histGradId = useId()
  const foreGradId = useId()
  const [hoveredIdx, setHoveredIdx] = useState(null)

  const chartModel = useMemo(() => {
    if (!history.length && !forecast.length) return { hasData: false }

    // Offsets in minutes relative to origin t (index 4 of history is t=0)
    const histPoints = history.map((pt, i) => ({
      kind: 'history',
      offsetMin: i - (history.length - 1), // -4, -3, -2, -1, 0
      offsetLabel: i === history.length - 1 ? 't (gốc)' : `t-${history.length - 1 - i}m`,
      time: pt.time,
      value: Number(pt.traffic_flow ?? 0),
    }))

    const forePoints = forecast.map((pt) => ({
      kind: 'forecast',
      horizon: pt.horizon,
      offsetMin: Number(pt.horizon), // +1, +3, +5
      offsetLabel: `+${pt.horizon}m`,
      time: pt.forecast_time,
      value: Number(pt.predicted_flow ?? 0),
    }))

    const allPoints = [...histPoints, ...forePoints]
    const allValues = allPoints.map((p) => p.value).filter(Number.isFinite)
    if (!allValues.length) return { hasData: false }

    const rawMin = Math.min(...allValues)
    const rawMax = Math.max(...allValues)
    let lo = rawMin
    let hi = rawMax
    if (lo === hi) {
      lo = Math.max(0, lo - 5)
      hi += 5
    } else {
      const margin = (hi - lo) * 0.15
      lo = Math.max(0, lo - margin)
      hi += margin
    }

    const minOffset = -4
    const maxOffset = 5
    const innerW = LINE_WIDTH - LINE_PAD.left - LINE_PAD.right
    const innerH = LINE_HEIGHT - LINE_PAD.top - LINE_PAD.bottom
    const baselineY = LINE_PAD.top + innerH

    const toX = (offsetMin) =>
      LINE_PAD.left + ((offsetMin - minOffset) / (maxOffset - minOffset)) * innerW
    const toY = (val) => LINE_PAD.top + innerH - ((val - lo) / (hi - lo)) * innerH

    const mapped = allPoints.map((pt, idx) => ({
      ...pt,
      idx,
      x: toX(pt.offsetMin),
      y: toY(pt.value),
    }))

    const mappedHist = mapped.filter((p) => p.kind === 'history')
    const mappedFore = mapped.filter((p) => p.kind === 'forecast')
    const originPoint = mappedHist[mappedHist.length - 1] || null

    const buildPath = (pts) =>
      pts
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
        .join(' ')

    const histLine = buildPath(mappedHist)
    const histArea =
      mappedHist.length > 1
        ? `${histLine} L${mappedHist[mappedHist.length - 1].x.toFixed(1)},${baselineY.toFixed(1)} L${mappedHist[0].x.toFixed(1)},${baselineY.toFixed(1)} Z`
        : ''

    const foreSeries = originPoint ? [originPoint, ...mappedFore] : mappedFore
    const foreLine = buildPath(foreSeries)
    const foreArea =
      foreSeries.length > 1
        ? `${foreLine} L${foreSeries[foreSeries.length - 1].x.toFixed(1)},${baselineY.toFixed(1)} L${foreSeries[0].x.toFixed(1)},${baselineY.toFixed(1)} Z`
        : ''

    const yTicks = [0, 0.5, 1].map((r) => {
      const val = lo + (hi - lo) * r
      return { y: toY(val), label: val.toFixed(1) }
    })

    return {
      hasData: true,
      points: mapped,
      originPoint,
      histLine,
      histArea,
      foreLine,
      foreArea,
      yTicks,
      baselineY,
    }
  }, [history, forecast])

  if (!chartModel.hasData) {
    return <div className="sci-chart__empty">Chưa có dữ liệu biểu đồ chuỗi thời gian</div>
  }

  const activePt = hoveredIdx != null ? chartModel.points[hoveredIdx] : null

  return (
    <div className="sci-pred-chart-card">
      <div className="sci-pred-chart-card__head">
        <div>
          <h3 className="sci-pred-chart-card__title">
            <Activity size={16} style={{ color: '#2563eb' }} />
            <span>Biểu đồ Chuỗi Thời gian: Lịch sử (5 mốc) &amp; Dự báo (+1, +3, +5 phút)</span>
          </h3>
          <p className="sci-pred-chart-card__sub">
            <code>visualization.traffic_flow_chart</code> · 5 quan sát thực tế (t-4 → t) và 3 điểm dự báo tương lai (+1, +3, +5 phút)
          </p>
        </div>

        <div className="sci-pred-legend">
          <span className="sci-pred-legend__item">
            <i className="sci-pred-legend__dot sci-pred-legend__dot--hist" />
            Quan sát lịch sử (t-4 → t)
          </span>
          <span className="sci-pred-legend__item">
            <i className="sci-pred-legend__dot sci-pred-legend__dot--fore" />
            Dự báo (+1, +3, +5 phút)
          </span>
        </div>
      </div>

      <div className="sci-pred-svg-wrap">
        <svg
          viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`}
          role="img"
          aria-label="Biểu đồ lưu lượng giao thông lịch sử và dự báo +1, +3, +5 phút"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id={histGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={foreGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ea580c" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#ea580c" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Horizontal Y Grid Lines */}
          {chartModel.yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={LINE_PAD.left}
                x2={LINE_WIDTH - LINE_PAD.right}
                y1={t.y}
                y2={t.y}
                stroke="#e2e8f0"
                strokeDasharray="3 3"
              />
              <text
                x={LINE_PAD.left - 8}
                y={t.y + 3.5}
                textAnchor="end"
                fontSize="10.5"
                fontWeight="600"
                fill="#64748b"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Origin Divider at t = 0 */}
          {chartModel.originPoint && (
            <g>
              <line
                x1={chartModel.originPoint.x}
                x2={chartModel.originPoint.x}
                y1={LINE_PAD.top - 6}
                y2={chartModel.baselineY}
                stroke="#94a3b8"
                strokeWidth="1.4"
                strokeDasharray="4 4"
              />
              <text
                x={chartModel.originPoint.x}
                y={LINE_PAD.top - 10}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="#475569"
              >
                Mốc gốc t ({formatShortTime(chartModel.originPoint.time)})
              </text>
            </g>
          )}

          {/* Area & Line for History */}
          {chartModel.histArea && <path d={chartModel.histArea} fill={`url(#${histGradId})`} />}
          {chartModel.histLine && (
            <path
              d={chartModel.histLine}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Area & Dashed Line for Forecast */}
          {chartModel.foreArea && <path d={chartModel.foreArea} fill={`url(#${foreGradId})`} />}
          {chartModel.foreLine && (
            <path
              d={chartModel.foreLine}
              fill="none"
              stroke="#ea580c"
              strokeWidth="2.6"
              strokeDasharray="6 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Points & X-axis Labels */}
          {chartModel.points.map((pt) => {
            const isFore = pt.kind === 'forecast'
            const color = isFore ? '#ea580c' : '#2563eb'
            const isHovered = hoveredIdx === pt.idx
            return (
              <g
                key={`${pt.kind}-${pt.offsetMin}`}
                onMouseEnter={() => setHoveredIdx(pt.idx)}
                style={{ cursor: 'pointer' }}
              >
                {/* X-axis tick label */}
                <text
                  x={pt.x}
                  y={LINE_HEIGHT - 19}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight={isFore || pt.offsetMin === 0 ? '800' : '600'}
                  fill={isFore ? '#c2410c' : '#475569'}
                >
                  {pt.offsetLabel}
                </text>
                <text
                  x={pt.x}
                  y={LINE_HEIGHT - 6}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="#64748b"
                >
                  {formatShortTime(pt.time)}
                </text>

                {/* Value label above point */}
                <text
                  x={pt.x}
                  y={Math.max(14, pt.y - 10)}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="800"
                  fill={color}
                >
                  {formatFlow(pt.value)}
                </text>

                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 4.2}
                  fill="#ffffff"
                  stroke={color}
                  strokeWidth={isHovered ? '3' : '2.3'}
                />
                <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" />
              </g>
            )
          })}
        </svg>
      </div>

      {activePt && (
        <div className="sci-pred-chart-Readout">
          <span className="sci-pill sci-pill--version">
            {activePt.kind === 'forecast'
              ? `Dự báo Horizon +${activePt.horizon} phút`
              : `Quan sát lịch sử (${activePt.offsetLabel})`}
          </span>
          <span>
            Thời gian: <strong>{formatDateTime(activePt.time)}</strong>
          </span>
          <span>
            Lưu lượng: <strong>{formatFlow(activePt.value)} xe/phút</strong>
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Chart 2: Forecast by Horizon (+1, +3, +5 min) SVG Bar Chart with last_observed_flow reference line.
 */
function ForecastByHorizonBarChart({ forecastByHorizon = [], lastObservedFlow = null }) {
  const barGradId = useId()
  const barHoverGradId = useId()
  const [hoveredIdx, setHoveredIdx] = useState(null)

  const barModel = useMemo(() => {
    if (!forecastByHorizon.length) return { hasData: false }

    const vals = forecastByHorizon.map((p) => Number(p.predicted_flow ?? 0)).filter(Number.isFinite)
    if (lastObservedFlow != null && Number.isFinite(Number(lastObservedFlow))) {
      vals.push(Number(lastObservedFlow))
    }
    if (!vals.length) return { hasData: false }

    const rawMax = Math.max(...vals, 1)
    const yMax = Math.ceil(rawMax * 1.18)
    const innerW = BAR_WIDTH - BAR_PAD.left - BAR_PAD.right
    const innerH = BAR_HEIGHT - BAR_PAD.top - BAR_PAD.bottom
    const baseY = BAR_PAD.top + innerH
    const slotW = innerW / forecastByHorizon.length
    const barW = Math.min(64, slotW * 0.48)

    const toY = (v) => baseY - (v / yMax) * innerH

    const bars = forecastByHorizon.map((pt, i) => {
      const val = Number(pt.predicted_flow ?? 0)
      const centerX = BAR_PAD.left + i * slotW + slotW / 2
      const y = toY(val)
      return {
        idx: i,
        horizon: pt.horizon,
        forecastTime: pt.forecast_time,
        value: val,
        centerX,
        x: centerX - barW / 2,
        y,
        w: barW,
        h: Math.max(3, baseY - y),
      }
    })

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => {
      const tv = Number((yMax * r).toFixed(1))
      return { y: baseY - r * innerH, label: formatFlow(tv) }
    })

    const refY =
      lastObservedFlow != null && Number.isFinite(Number(lastObservedFlow))
        ? toY(Number(lastObservedFlow))
        : null

    return {
      hasData: true,
      bars,
      yTicks,
      baseY,
      refY,
    }
  }, [forecastByHorizon, lastObservedFlow])

  if (!barModel.hasData) {
    return <div className="sci-chart__empty">Chưa có dữ liệu biểu đồ cột theo Horizon</div>
  }

  return (
    <div className="sci-pred-chart-card">
      <div className="sci-pred-chart-card__head">
        <div>
          <h3 className="sci-pred-chart-card__title">
            <BarChart3 size={16} style={{ color: '#ea580c' }} />
            <span>Biểu đồ Cột Lưu lượng Dự báo theo Horizon (+1, +3, +5 phút)</span>
          </h3>
          <p className="sci-pred-chart-card__sub">
            <code>visualization.forecast_by_horizon</code> · So sánh lưu lượng dự báo tại 3 mốc với quan sát cuối (t)
          </p>
        </div>

        {lastObservedFlow != null && (
          <span className="sci-pill sci-pill--format">
            Quan sát cuối (t): {formatFlow(lastObservedFlow)} xe/phút
          </span>
        )}
      </div>

      <div className="sci-pred-svg-wrap">
        <svg
          viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`}
          role="img"
          aria-label="Biểu đồ cột lưu lượng dự báo theo horizon +1, +3, +5 phút"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id={barGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
            <linearGradient id={barHoverGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Lines */}
          {barModel.yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={BAR_PAD.left}
                x2={BAR_WIDTH - BAR_PAD.right}
                y1={t.y}
                y2={t.y}
                stroke={idx === 0 ? '#cbd5e1' : '#e2e8f0'}
                strokeDasharray={idx === 0 ? undefined : '3 3'}
              />
              <text
                x={BAR_PAD.left - 8}
                y={t.y + 3.5}
                textAnchor="end"
                fontSize="10.5"
                fontWeight="600"
                fill="#64748b"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Reference Line for Last Observed Flow */}
          {barModel.refY != null && (
            <g>
              <line
                x1={BAR_PAD.left}
                x2={BAR_WIDTH - BAR_PAD.right}
                y1={barModel.refY}
                y2={barModel.refY}
                stroke="#2563eb"
                strokeWidth="1.6"
                strokeDasharray="5 4"
              />
              <text
                x={BAR_WIDTH - BAR_PAD.right - 4}
                y={Math.max(14, barModel.refY - 5)}
                textAnchor="end"
                fontSize="10"
                fontWeight="700"
                fill="#1d4ed8"
              >
                Quan sát cuối t = {formatFlow(lastObservedFlow)}
              </text>
            </g>
          )}

          {/* Bars */}
          {barModel.bars.map((b) => {
            const isHovered = hoveredIdx === b.idx
            return (
              <g
                key={b.horizon}
                onMouseEnter={() => setHoveredIdx(b.idx)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx="7"
                  fill={isHovered ? `url(#${barHoverGradId})` : `url(#${barGradId})`}
                />
                <text
                  x={b.centerX}
                  y={Math.max(15, b.y - 8)}
                  textAnchor="middle"
                  fontSize="11.5"
                  fontWeight="800"
                  fill={isHovered ? '#1d4ed8' : '#c2410c'}
                >
                  {formatFlow(b.value)} xe/p
                </text>
                <text
                  x={b.centerX}
                  y={BAR_HEIGHT - 19}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="800"
                  fill="#0f172a"
                >
                  Horizon +{b.horizon} phút
                </text>
                <text
                  x={b.centerX}
                  y={BAR_HEIGHT - 6}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="#64748b"
                >
                  {formatShortTime(b.forecastTime)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

/**
 * Step 2 on Prediction Page: UI component for POST /api/model-training/predict
 */
export default function TrafficPredictionPanel({
  versionId,
  datasetMeta,
  experiments = [],
  savedSplitId = null,
  forecastData,
  isPredicting,
  predictError,
  predictErrorCode,
  onRunPrediction,
  onAskAiAboutForecast,
}) {
  const [selectedSplitId, setSelectedSplitId] = useState('')
  const [selectedExperimentId, setSelectedExperimentId] = useState('')

  const completedExperiments = useMemo(
    () => experiments.filter((exp) => exp.status === 'COMPLETED'),
    [experiments]
  )

  const availableSplitIds = useMemo(() => {
    const set = new Set()
    if (savedSplitId) set.add(String(savedSplitId))
    completedExperiments.forEach((exp) => {
      if (exp.split_id) set.add(String(exp.split_id))
    })
    return Array.from(set)
  }, [savedSplitId, completedExperiments])

  const handlePredictSubmit = (e) => {
    e.preventDefault()
    onRunPrediction({
      datasetVersionId: versionId,
      splitId: selectedSplitId || undefined,
      experimentId: selectedExperimentId || undefined,
    })
  }

  const matchedExperiment = useMemo(() => {
    if (!forecastData?.experiment_id) return null
    return completedExperiments.find(
      (exp) => String(exp.experiment_id) === String(forecastData.experiment_id)
    )
  }, [forecastData, completedExperiments])

  const visualization = forecastData?.visualization
  const trafficFlowChart = visualization?.traffic_flow_chart
  const forecastByHorizon = visualization?.forecast_by_horizon || forecastData?.predictions || []
  const forecastTable = visualization?.forecast_table || []

  return (
    <section className="admin-card">
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--amber">
            <TrendingUp size={18} />
          </div>
          <div>
            <h2 className="admin-card__title">
              Bước 2 · Dự báo Lưu lượng Giao thông (+1, +3, +5 phút)
            </h2>
            <p className="admin-card__subtitle">
              Chọn thí nghiệm Random Forest theo điểm Validation và dùng Final Model với 5 đặc trưng trễ mới nhất để dự báo +1, +3, +5 phút.
            </p>
          </div>
        </div>

        <div className="sci-train-actions">
          {forecastData && onAskAiAboutForecast && (
            <button
              type="button"
              className="btn-secondary sci-train-btn"
              onClick={() => onAskAiAboutForecast(forecastData)}
              title="Nhờ Trợ lý AI phân tích xu hướng dự báo này"
            >
              <Sparkles size={15} style={{ color: '#7c3aed' }} />
              <span>Hỏi AI về Dự báo</span>
            </button>
          )}

          <button
            type="button"
            className="btn-action btn-action--primary sci-train-btn"
            onClick={handlePredictSubmit}
            disabled={isPredicting}
          >
            {isPredicting ? (
              <Loader2 size={16} className="sci-spin" />
            ) : (
              <Play size={16} />
            )}
            <span>
              {isPredicting ? 'Đang chạy dự báo...' : 'Dự báo +1, +3, +5 phút'}
            </span>
          </button>
        </div>
      </div>

      <div className="sci-card-body">
        {/* Request Scope Configuration Bar (dataset_version_id, split_id, experiment_id) */}
        <form onSubmit={handlePredictSubmit} className="sci-pred-scope-bar">
          <div className="sci-pred-scope-field">
            <label htmlFor="pred-version-id">Dataset Version ID</label>
            <input
              id="pred-version-id"
              type="text"
              className="sci-input sci-mono"
              value={versionId || ''}
              readOnly
              title={datasetMeta ? `${datasetMeta.dataset_name} (${datasetMeta.version_tag})` : ''}
            />
          </div>

          <div className="sci-pred-scope-field">
            <label htmlFor="pred-split-id">Bộ chia Train/Test (split_id - tuỳ chọn)</label>
            <select
              id="pred-split-id"
              className="sci-input"
              value={selectedSplitId}
              onChange={(e) => setSelectedSplitId(e.target.value)}
              disabled={isPredicting}
            >
              <option value="">Tự động theo Dataset Version ({availableSplitIds.length} split)</option>
              {availableSplitIds.map((id) => (
                <option key={id} value={id}>
                  Split: {id.slice(0, 8)}…{id.slice(-4)}
                </option>
              ))}
            </select>
          </div>

          <div className="sci-pred-scope-field">
            <label htmlFor="pred-exp-id">Thí nghiệm neo (experiment_id - tuỳ chọn)</label>
            <select
              id="pred-exp-id"
              className="sci-input"
              value={selectedExperimentId}
              onChange={(e) => {
                const nextExpId = e.target.value
                setSelectedExperimentId(nextExpId)
                if (nextExpId) {
                  const found = completedExperiments.find(
                    (item) => String(item.experiment_id) === String(nextExpId)
                  )
                  if (found?.split_id) {
                    setSelectedSplitId(String(found.split_id))
                  }
                }
              }}
              disabled={isPredicting}
            >
              <option value="">
                Tự động chọn Ex tốt nhất theo điểm Validation ({completedExperiments.length} Ex)
              </option>
              {completedExperiments.map((exp) => (
                <option key={exp.experiment_id} value={exp.experiment_id}>
                  {exp.experiment_name} ({String(exp.experiment_id).slice(0, 8)}…)
                </option>
              ))}
            </select>
          </div>
        </form>

        {/* Loading state */}
        {isPredicting && (
          <div className="sci-state">
            <div className="sci-spinner" />
            <div style={{ fontWeight: 700, color: '#0f172a' }}>
              Đang kiểm tra điểm Validation, tải Final Model và tính toán dự báo lưu lượng tại +1, +3, +5 phút...
            </div>
          </div>
        )}

        {/* Error state */}
        {!isPredicting && predictError && (
          <div className="sci-state sci-state--error">
            <p style={{ margin: 0, fontWeight: 700 }}>{predictError}</p>
            {(predictErrorCode === 'VALIDATION_NOT_AVAILABLE' ||
              predictErrorCode === 'FINAL_MODEL_NOT_AVAILABLE') && (
              <p style={{ margin: '0.45rem 0 0', fontSize: '0.82rem', color: '#991b1b' }}>
                Mã trạng thái: <code>{predictErrorCode}</code> — Theo đặc tả hệ thống, API{' '}
                <code>POST /api/model-training/predict</code> yêu cầu thí nghiệm Random Forest đã có bảng điểm Validation (<code>model_validation_results</code>) và tệp mô hình <code>final_models</code> tương ứng.
              </p>
            )}
          </div>
        )}

        {/* Empty state */}
        {!isPredicting && !predictError && !forecastData && (
          <div className="sci-state">
            <TrendingUp size={34} style={{ marginBottom: '0.5rem', color: '#94a3b8' }} />
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
              Chưa có kết quả dự báo lưu lượng giao thông
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              Nhấn <strong>&ldquo;Dự báo +1, +3, +5 phút&rdquo;</strong> ở góc trên để chạy dự báo và hiển thị bộ 3 biểu đồ &amp; bảng phân tích xu hướng.
            </div>
          </div>
        )}

        {/* Forecast Result & 3 Visualization Views */}
        {!isPredicting && forecastData && (
          <>
            {/* 4 Provenance Summary Cards */}
            <div className="sci-fe-config-grid">
              <div className="sci-fe-config-item">
                <small>Thí nghiệm được chọn</small>
                <strong title={String(forecastData.experiment_id)}>
                  <CheckCircle2 size={14} style={{ color: '#15803d', flexShrink: 0 }} />
                  <span>
                    {matchedExperiment?.experiment_name || 'Random Forest Ex'}
                  </span>
                </strong>
                <span className="sci-fe-config-sub sci-mono">
                  ID: {String(forecastData.experiment_id).slice(0, 18)}…
                </span>
              </div>

              <div className="sci-fe-config-item">
                <small>Final Model Artifact</small>
                <strong title={String(forecastData.model_id)}>
                  <Cpu size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                  <span className="sci-mono">
                    {String(forecastData.model_id).slice(0, 13)}…
                  </span>
                </strong>
                <span className="sci-fe-config-sub">
                  Dataset Version: {String(forecastData.dataset_version_id).slice(0, 12)}…
                </span>
              </div>

              <div className="sci-fe-config-item">
                <small>Mốc Quan sát Cuối (Origin t)</small>
                <strong>
                  <Clock size={14} style={{ color: '#ea580c', flexShrink: 0 }} />
                  <span>{formatFlow(forecastData.last_observed_flow)} xe/phút</span>
                </strong>
                <span className="sci-fe-config-sub">
                  Tại: {formatDateTime(forecastData.last_observed_time)}
                </span>
              </div>

              <div className="sci-fe-config-item">
                <small>Chế độ Đánh giá Nguồn</small>
                <strong>
                  {forecastData.source_experiment_official_evaluation_eligible ? (
                    <CheckCircle2 size={14} style={{ color: '#15803d', flexShrink: 0 }} />
                  ) : (
                    <ShieldAlert size={14} style={{ color: '#d97706', flexShrink: 0 }} />
                  )}
                  <span>
                    {forecastData.source_experiment_evaluation_mode === 'official'
                      ? 'Chính thức (Official)'
                      : 'Thăm dò (Exploratory)'}
                  </span>
                </strong>
                <span className="sci-fe-config-sub">
                  {forecastData.source_experiment_official_evaluation_eligible
                    ? 'Đủ điều kiện đánh giá chính thức'
                    : 'Chỉ dùng để đánh giá thử nghiệm'}
                </span>
              </div>
            </div>

            {/* 3 Horizon KPI Cards (+1, +3, +5 min) */}
            <div className="sci-pred-kpi-grid">
              {forecastTable.map((row) => {
                const badge = getTrendBadge(row.trend)
                const TrendIcon = badge.icon
                return (
                  <div key={row.horizon} className="sci-pred-kpi-card">
                    <div className="sci-pred-kpi-card__top">
                      <span className="sci-pill sci-pill--version">
                        Horizon +{row.horizon} phút
                      </span>
                      <span className={badge.className}>
                        <TrendIcon size={13} />
                        <span>{badge.label}</span>
                      </span>
                    </div>

                    <div className="sci-pred-kpi-card__value">
                      <strong>{formatFlow(row.predicted_flow)}</strong>
                      <span>xe / phút</span>
                    </div>

                    <div className="sci-pred-kpi-card__meta">
                      <span>
                        Mốc dự báo: <strong>{formatShortTime(row.forecast_time)}</strong>
                      </span>
                      <span>
                        Chênh lệch vs gốc (t):{' '}
                        <strong>{formatSignedChange(row.change_from_last_observed)} xe/p</strong>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* View 1 & View 2: Charts Grid */}
            <div className="sci-pred-charts-grid">
              <HistoryAndForecastLineChart
                history={trafficFlowChart?.history || []}
                forecast={trafficFlowChart?.forecast || forecastData.predictions || []}
              />

              <ForecastByHorizonBarChart
                forecastByHorizon={forecastByHorizon}
                lastObservedFlow={forecastData.last_observed_flow}
              />
            </div>

            {/* View 3: Forecast Table (visualization.forecast_table) */}
            <div className="sci-pred-table-section">
              <div className="sci-pred-table-section__head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Table2 size={16} style={{ color: '#15803d' }} />
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                    Bảng Chi tiết Dự báo Lưu lượng theo Horizon (<code>visualization.forecast_table</code>)
                  </h3>
                </div>
                <span className="sci-pill sci-pill--approved">
                  So sánh với mốc quan sát cuối t = {formatFlow(forecastData.last_observed_flow)} xe/phút
                </span>
              </div>

              <div className="sci-table-wrap">
                <table className="sci-table">
                  <thead>
                    <tr>
                      <th style={{ width: '110px' }}>Horizon</th>
                      <th>Thời điểm dự báo (forecast_time)</th>
                      <th>Lưu lượng quan sát cuối (t)</th>
                      <th>Lưu lượng dự báo (predicted_flow)</th>
                      <th>Chênh lệch (change_from_last_observed)</th>
                      <th>Xu hướng (trend)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastTable.map((row) => {
                      const badge = getTrendBadge(row.trend)
                      const TrendIcon = badge.icon
                      return (
                        <tr key={row.horizon}>
                          <td>
                            <span className="sci-pill sci-pill--version">
                              +{row.horizon} phút
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {formatDateTime(row.forecast_time)}
                          </td>
                          <td>{formatFlow(forecastData.last_observed_flow)} xe/phút</td>
                          <td style={{ fontWeight: 800, color: '#ea580c', fontSize: '0.92rem' }}>
                            {formatFlow(row.predicted_flow)} xe/phút
                          </td>
                          <td style={{ fontWeight: 700 }}>
                            {formatSignedChange(row.change_from_last_observed)} xe/phút
                          </td>
                          <td>
                            <span className={badge.className}>
                              <TrendIcon size={13} />
                              <span>{badge.label}</span>
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
