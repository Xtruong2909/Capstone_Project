import { useId, useMemo, useState } from 'react'
import { formatNumber } from '../utils/formatters'

const WIDTH = 860
const HEIGHT = 320
const PAD = { top: 44, right: 24, bottom: 42, left: 52 }

function formatTimeLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Interactive SVG Bar Chart for 1-minute vehicle aggregation.
 * Numbers above bars are ONLY displayed when hovering over a bar.
 */
export default function BarChart({
  title = 'Biểu đồ tổng hợp phương tiện theo từng phút (1-Minute Vehicle Count)',
  subtitle = 'Rê chuột vào từng cột để xem số lượng phương tiện trong khung 1 phút tương ứng',
  labels = [],
  values = [],
  unit = 'phương tiện / phút',
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const barGradId = useId()
  const barHoverGradId = useId()

  const { bars, yTicks, xTickIndices, totalVehicles, maxVal, avgVal, hasData } = useMemo(() => {
    const validNums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (validNums.length === 0) return { hasData: false }

    const rawMax = Math.max(...validNums, 1)
    const total = validNums.reduce((sum, v) => sum + v, 0)
    const avg = total / validNums.length

    // Round upper Y axis nicely
    const step = rawMax <= 20 ? 5 : rawMax <= 50 ? 10 : rawMax <= 200 ? 50 : Math.ceil(rawMax / 4 / 50) * 50
    const yMax = Math.max(step, Math.ceil((rawMax * 1.12) / step) * step)

    const innerW = WIDTH - PAD.left - PAD.right
    const innerH = HEIGHT - PAD.top - PAD.bottom
    const count = values.length
    const slotW = innerW / count
    const barW = Math.max(6, Math.min(42, slotW * 0.64))
    const baseY = PAD.top + innerH

    const computedBars = values.map((v, i) => {
      const val = typeof v === 'number' && Number.isFinite(v) ? v : 0
      const h = Math.max(2, (val / yMax) * innerH)
      const centerX = PAD.left + i * slotW + slotW / 2
      return {
        index: i,
        value: val,
        label: labels[i],
        timeText: formatTimeLabel(labels[i]) || `Phút ${i + 1}`,
        slotX: PAD.left + i * slotW,
        slotW,
        x: centerX - barW / 2,
        y: baseY - h,
        w: barW,
        h,
        centerX,
      }
    })

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => {
      const tv = Math.round(yMax * r)
      return {
        value: tv,
        y: baseY - r * innerH,
      }
    })

    const maxXLabels = 12
    const stride = Math.max(1, Math.ceil(count / maxXLabels))
    const xIdx = []
    for (let i = 0; i < count; i += stride) xIdx.push(i)
    if (xIdx[xIdx.length - 1] !== count - 1) xIdx.push(count - 1)

    return {
      bars: computedBars,
      yTicks: ticks,
      xTickIndices: xIdx,
      totalVehicles: total,
      maxVal: rawMax,
      avgVal: avg,
      hasData: true,
    }
  }, [labels, values])

  return (
    <div className="sci-barchart-card">
      <div className="sci-barchart-card__header">
        <div>
          <h3 className="sci-barchart-card__title">{title}</h3>
          <p className="sci-barchart-card__subtitle">{subtitle}</p>
        </div>

        {hasData && (
          <div className="sci-barchart-card__stats">
            <span className="sci-pill sci-pill--version">
              {bars.length} khung (1 phút)
            </span>
            <span className="sci-pill sci-pill--format">
              TB: {avgVal.toFixed(1)} {unit}
            </span>
            <span className="sci-pill sci-pill--approved">
              Cao nhất: {formatNumber(maxVal)}
            </span>
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="sci-chart__empty" style={{ height: 240 }}>
          Không có dữ liệu phương tiện cho dataset này.
        </div>
      ) : (
        <div className="sci-barchart-wrap">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={title}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <defs>
              <linearGradient id={barGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
              <linearGradient id={barHoverGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#ea580c" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines & Y-Axis Labels */}
            {yTicks.map((t) => (
              <g key={t.value}>
                <line
                  x1={PAD.left}
                  x2={WIDTH - PAD.right}
                  y1={t.y}
                  y2={t.y}
                  stroke={t.value === 0 ? '#cbd5e1' : '#e2e8f0'}
                  strokeDasharray={t.value === 0 ? undefined : '4 4'}
                />
                <text
                  x={PAD.left - 10}
                  y={t.y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fontWeight="600"
                  fill="#64748b"
                >
                  {formatNumber(t.value)}
                </text>
              </g>
            ))}

            {/* X-Axis Labels */}
            {xTickIndices.map((idx) => {
              const b = bars[idx]
              if (!b) return null
              return (
                <text
                  key={idx}
                  x={b.centerX}
                  y={HEIGHT - 14}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={hoveredIdx === idx ? '800' : '600'}
                  fill={hoveredIdx === idx ? '#0f172a' : '#64748b'}
                >
                  {b.timeText}
                </text>
              )
            })}

            {/* Bars + Full-column hover hit zones */}
            {bars.map((b) => {
              const isHovered = hoveredIdx === b.index
              return (
                <g
                  key={b.index}
                  onMouseEnter={() => setHoveredIdx(b.index)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Subtle column highlight background when hovered */}
                  {isHovered && (
                    <rect
                      x={b.slotX + 2}
                      y={PAD.top}
                      width={Math.max(4, b.slotW - 4)}
                      height={HEIGHT - PAD.top - PAD.bottom}
                      rx="6"
                      fill="#f1f5f9"
                    />
                  )}

                  {/* Actual Bar */}
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    rx={Math.min(6, b.w / 2)}
                    fill={isHovered ? `url(#${barHoverGradId})` : `url(#${barGradId})`}
                    opacity={hoveredIdx !== null && !isHovered ? 0.65 : 1}
                    style={{ transition: 'opacity 0.15s ease' }}
                  />

                  {/* Invisible full-height hit rect so hovering anywhere in the column triggers smoothly */}
                  <rect
                    x={b.slotX}
                    y={PAD.top - 20}
                    width={b.slotW}
                    height={HEIGHT - PAD.top + 20}
                    fill="transparent"
                  />
                </g>
              )
            })}

            {/* Value badge ONLY shown on the currently hovered bar */}
            {hoveredIdx !== null && bars[hoveredIdx] && (() => {
              const b = bars[hoveredIdx]
              const valText = `${formatNumber(b.value)}`
              const badgeW = Math.max(44, valText.length * 9 + 20)
              const badgeH = 26
              const clampedX = Math.min(
                WIDTH - PAD.right - badgeW / 2,
                Math.max(PAD.left + badgeW / 2, b.centerX)
              )
              const badgeY = Math.max(6, b.y - badgeH - 8)

              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect
                    x={clampedX - badgeW / 2}
                    y={badgeY}
                    width={badgeW}
                    height={badgeH}
                    rx="7"
                    fill="#0f172a"
                  />
                  <polygon
                    points={`${b.centerX - 5},${badgeY + badgeH} ${b.centerX + 5},${badgeY + badgeH} ${b.centerX},${badgeY + badgeH + 5}`}
                    fill="#0f172a"
                  />
                  <text
                    x={clampedX}
                    y={badgeY + 17}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="800"
                    fill="#ffffff"
                  >
                    {valText}
                  </text>
                </g>
              )
            })()}
          </svg>
        </div>
      )}
    </div>
  )
}

