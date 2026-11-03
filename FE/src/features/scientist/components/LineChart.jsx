import { useId, useMemo } from 'react'

const WIDTH = 560
const HEIGHT = 195
const PAD = { top: 16, right: 18, bottom: 28, left: 46 }

/**
 * Clean dependency-free SVG line + area chart with data points and summary stats.
 * labels: string[] (x axis, ISO timestamps or text); values: (number|null)[]
 */
export default function LineChart({ title, unit, labels = [], values = [], color = '#1668e3' }) {
  const gradId = useId()

  const { linePath, areaPath, points, ticks, xLabels, min, max, avg, hasData } = useMemo(() => {
    const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (nums.length === 0) return { hasData: false }

    const rawMin = Math.min(...nums)
    const rawMax = Math.max(...nums)
    const mean = nums.reduce((acc, v) => acc + v, 0) / nums.length

    let lo = rawMin
    let hi = rawMax
    if (lo === hi) {
      lo = Math.max(0, lo - 1)
      hi += 1
    } else {
      const margin = (hi - lo) * 0.08
      lo = Math.max(0, lo - margin)
      hi += margin
    }

    const innerW = WIDTH - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const stepX = values.length > 1 ? innerW / (values.length - 1) : 0
    const toX = (i) => (values.length === 1 ? PAD.left + innerW / 2 : PAD.left + i * stepX)
    const toY = (v) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH
    const baselineY = PAD.top + innerH

    let d = ''
    let area = ''
    let segmentStart = null
    let lastValidX = null
    const pts = []

    values.forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        if (segmentStart !== null && lastValidX !== null) {
          area += `L${lastValidX.toFixed(1)},${baselineY.toFixed(1)} L${segmentStart.toFixed(1)},${baselineY.toFixed(1)} Z `
        }
        segmentStart = null
        lastValidX = null
        return
      }
      const x = toX(i)
      const y = toY(v)
      pts.push({ x, y, v, label: labels[i] })
      if (segmentStart === null) {
        d += `M${x.toFixed(1)},${y.toFixed(1)} `
        area += `M${x.toFixed(1)},${y.toFixed(1)} `
        segmentStart = x
      } else {
        d += `L${x.toFixed(1)},${y.toFixed(1)} `
        area += `L${x.toFixed(1)},${y.toFixed(1)} `
      }
      lastValidX = x
    })

    if (segmentStart !== null && lastValidX !== null && pts.length > 1) {
      area += `L${lastValidX.toFixed(1)},${baselineY.toFixed(1)} L${segmentStart.toFixed(1)},${baselineY.toFixed(1)} Z`
    } else {
      area = ''
    }

    const yTicks = [0, 0.5, 1].map((r) => {
      const val = lo + (hi - lo) * r
      return { y: toY(val), label: val.toFixed(1) }
    })

    const pickIdx = [0, Math.floor((labels.length - 1) / 2), labels.length - 1].filter(
      (v, i, arr) => v >= 0 && arr.indexOf(v) === i
    )
    const xl = pickIdx.map((i) => ({ x: toX(i), label: formatTick(labels[i]) }))

    return {
      linePath: d.trim(),
      areaPath: area.trim(),
      points: pts,
      ticks: yTicks,
      xLabels: xl,
      min: rawMin,
      max: rawMax,
      avg: mean,
      hasData: true,
    }
  }, [labels, values])

  return (
    <div className="sci-chart">
      <div className="sci-chart__head">
        <div>
          <b>{title}</b>
          {unit && <span>{unit}</span>}
        </div>
        {hasData && (
          <span className="sci-chart__badge" style={{ color, background: `${color}14` }}>
            Avg: {avg.toFixed(1)}
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="sci-chart__empty">No data points for selected range</div>
      ) : (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {ticks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={t.y}
                y2={t.y}
                stroke="#e2e8f0"
                strokeDasharray="3 3"
              />
              <text x={PAD.left - 8} y={t.y + 3.5} textAnchor="end" fontSize="10.5" fontWeight="600" fill="#64748b">
                {t.label}
              </text>
            </g>
          ))}

          {xLabels.map((t, idx) => (
            <text
              key={idx}
              x={t.x}
              y={HEIGHT - 7}
              textAnchor={idx === 0 && xLabels.length > 1 ? 'start' : idx === xLabels.length - 1 && xLabels.length > 1 ? 'end' : 'middle'}
              fontSize="10.5"
              fontWeight="600"
              fill="#64748b"
            >
              {t.label}
            </text>
          ))}

          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.length <= 45 &&
            points.map((pt, idx) => (
              <circle
                key={idx}
                cx={pt.x}
                cy={pt.y}
                r={points.length === 1 ? 5 : 3.2}
                fill="#ffffff"
                stroke={color}
                strokeWidth="2"
              >
                <title>{`${formatTick(pt.label)}: ${pt.v.toFixed(2)}`}</title>
              </circle>
            ))}
        </svg>
      )}

      {hasData && (
        <div className="sci-chart__range">
          <span>Min: <strong>{min.toFixed(1)}</strong></span>
          <span>Avg: <strong>{avg.toFixed(1)}</strong></span>
          <span>Max: <strong>{max.toFixed(1)}</strong></span>
        </div>
      )}
    </div>
  )
}

function formatTick(label) {
  if (!label) return ''
  const d = new Date(label)
  if (Number.isNaN(d.getTime())) return String(label)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
