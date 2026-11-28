import { useMemo } from 'react'
import {
  Bar, BarChart, CartesianGrid, LabelList,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatAthensRecordingDateTime, formatRecordingTime, formatTrafficFlow } from '../utils/formatters'

function HorizonTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return <div className="sci-experiment-chart-tooltip">
    <strong>+{point.horizon} phút · {formatAthensRecordingDateTime(point.timestamp)}</strong>
    <span>Số xe dự báo: <b>{formatTrafficFlow(point.predicted)} xe/phút</b></span>
  </div>
}

export default function ForecastResultCharts({ chart }) {
  const { horizonData, lastObserved } = useMemo(() => {
    const historical = [...(chart?.historical || [])]
      .filter((point) => point.timestamp && point.traffic_flow != null && Number.isFinite(Number(point.traffic_flow)))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    const forecast = [...(chart?.forecast || [])]
      .filter((point) => point.timestamp && point.predicted_vehicle_count != null && Number.isFinite(Number(point.predicted_vehicle_count)))
      .sort((a, b) => Number(a.horizon) - Number(b.horizon))
    const observed = historical.map((point, index) => ({
      offset: index - historical.length + 1,
      timestamp: point.timestamp,
      label: formatRecordingTime(point.timestamp),
      observed: Number(point.traffic_flow),
    }))
    const origin = observed.at(-1)
    const predicted = forecast.map((point) => ({
      offset: Number(point.horizon),
      horizon: Number(point.horizon),
      timestamp: point.timestamp,
      label: formatRecordingTime(point.timestamp),
      predicted: Number(point.predicted_vehicle_count),
    }))
    return {
      timeline: [...observed, ...predicted],
      horizonData: predicted,
      lastObserved: origin?.observed,
    }
  }, [chart])

  if (!horizonData.length) {
    return <div className="sci-prediction-empty">Không có dữ liệu để hiển thị biểu đồ.</div>
  }

  return <div className="sci-prediction-charts">
    <div className="sci-experiment-chart-card">
      <div className="sci-experiment-chart-card__heading"><div>
        <h3>Dự báo theo mốc +1, +3, +5 phút</h3>
        <p>So sánh các giá trị dự báo với lưu lượng quan sát tại thời gian gốc.</p>
      </div></div>
      <div className="sci-experiment-chart-canvas" role="img" aria-label="Biểu đồ cột số xe dự báo theo mốc">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={horizonData} margin={{ top: 24, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="#dce8f6" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="horizon" tickFormatter={(horizon) => `+${horizon} phút`} tick={{ fontSize: 11 }} />
            <YAxis width={48} tick={{ fontSize: 11 }} tickFormatter={formatTrafficFlow} allowDecimals={false} domain={[0, (dataMax) => Math.ceil(Math.max(dataMax, lastObserved ?? 0) * 1.15)]} />
            <Tooltip content={<HorizonTooltip />} />
            {lastObserved != null && <ReferenceLine y={lastObserved} stroke="#2563eb" strokeDasharray="5 4" label={{ value: `Quan sát: ${formatTrafficFlow(lastObserved)}`, fill: '#2563eb', fontSize: 11, position: 'insideTopRight' }} />}
            <Bar dataKey="predicted" name="Số xe dự báo" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={68} isAnimationActive={false}>
              <LabelList dataKey="predicted" position="top" formatter={formatTrafficFlow} fill="#7c4a03" fontSize={11} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
}
