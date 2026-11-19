import { useMemo } from 'react'
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatAthensRecordingDateTime, formatRecordingTime, formatTrafficFlow } from '../utils/formatters'

function FlowTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return <div className="sci-experiment-chart-tooltip">
    <strong>{formatAthensRecordingDateTime(point.timestamp)}</strong>
    {point.observed != null && <span>Thực tế: <b>{formatTrafficFlow(point.observed)} xe/phút</b></span>}
    {point.predicted != null && <span>Dự báo: <b>{formatTrafficFlow(point.predicted)} xe/phút</b></span>}
    {point.horizon != null && <span>Mốc dự báo: <b>+{point.horizon} phút</b></span>}
  </div>
}

function HorizonTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return <div className="sci-experiment-chart-tooltip">
    <strong>+{point.horizon} phút · {formatAthensRecordingDateTime(point.timestamp)}</strong>
    <span>Số xe dự báo: <b>{formatTrafficFlow(point.predicted)} xe/phút</b></span>
  </div>
}

export default function ForecastResultCharts({ chart }) {
  const { timeline, horizonData, lastObserved } = useMemo(() => {
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

  if (!timeline.length && !horizonData.length) {
    return <div className="sci-prediction-empty">Không có dữ liệu để hiển thị biểu đồ.</div>
  }

  return <div className="sci-prediction-charts">
    <div className="sci-experiment-chart-card">
      <div className="sci-experiment-chart-card__heading"><div>
        <h3>Lưu lượng quan sát và dự báo</h3>
        <p>Năm mốc quan sát gần nhất và dự báo Random Forest tại +1, +3, +5 phút.</p>
      </div></div>
      <div className="sci-experiment-chart-canvas" role="img" aria-label="Biểu đồ đường lưu lượng quan sát và dự báo theo thời gian">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline} margin={{ top: 18, right: 22, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="#dce8f6" strokeDasharray="4 4" />
            <XAxis dataKey="offset" type="number" domain={['dataMin', 'dataMax']} ticks={timeline.map((point) => point.offset)} tickFormatter={(offset) => timeline.find((point) => point.offset === offset)?.label || ''} tick={{ fontSize: 11 }} />
            <YAxis width={48} tick={{ fontSize: 11 }} tickFormatter={formatTrafficFlow} allowDecimals={false} domain={['auto', 'auto']} />
            <Tooltip content={<FlowTooltip />} />
            <Legend />
            <Line type="linear" dataKey="observed" name="Quan sát" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
            <Line type="linear" dataKey="predicted" name="Dự báo" stroke="#059669" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
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
