import { Activity, BarChart3, CarFront, Gauge, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAggregationChartResults } from '../../../hooks/useScienceWorkflow'
import LineChart from '../components/LineChart'
import ScientistBackLink from '../components/ScientistBackLink'

const finiteValues = (rows, field) => rows.map((row) => {
  const rawValue = row[field]
  if (rawValue == null || rawValue === '') return null
  const value = Number(rawValue)
  return Number.isFinite(value) ? value : null
})

export default function ScientistAggregationChartsPage() {
  const { groupId } = useParams()
  const [searchParams] = useSearchParams()
  const aggregationId = searchParams.get('aggregationId')
  const sessionId = searchParams.get('sessionId')
  const sessionName = searchParams.get('sessionName') || 'Session đã chọn'
  const { result, isLoading, error, reload } = useAggregationChartResults(aggregationId, sessionId)
  const rows = useMemo(() => result?.data || [], [result])
  const series = useMemo(() => {
    const intervalMinutes = Math.max(1, Number(result?.aggregation_interval || 60) / 60)
    return {
      labels: rows.map((row) => row.timestamp),
      vehicleCount: finiteValues(rows, 'vehicle_count'),
      averageSpeed: finiteValues(rows, 'mean_speed'),
      trafficFlow: rows.map((row) => {
        const rawValue = row.traffic_flow
        const value = rawValue == null || rawValue === '' ? Number.NaN : Number(rawValue)
        return Number.isFinite(value) ? value : Number(row.vehicle_count) / intervalMinutes
      }),
    }
  }, [result, rows])
  const hasAverageSpeed = series.averageSpeed.some((value) => value != null)

  return <div className="sci-page sci-aggregation-charts-page">
    <ScientistBackLink to={`/scientist/datasets/groups/${groupId}/train?sessionId=${encodeURIComponent(sessionId || '')}`}>Bảng dữ liệu theo phút</ScientistBackLink>
    <header className="sci-aggregation-charts-hero">
      <div className="sci-aggregation-charts-hero__icon"><BarChart3 size={28} /></div>
      <div>
        <span>PHÂN TÍCH DỮ LIỆU PNEUMA</span>
        <h1>Biểu đồ giao thông theo thời gian</h1>
        <p>{sessionName} · Tổng hợp theo từng phút</p>
      </div>
      <button type="button" className="sci-training-button sci-training-button--secondary" onClick={reload} disabled={isLoading || !aggregationId || !sessionId}><RefreshCw size={15} /> Làm mới</button>
    </header>

    {(!aggregationId || !sessionId) && <div className="sci-state sci-state--error">Thiếu thông tin lần tổng hợp hoặc session. Hãy quay lại bảng dữ liệu và chọn session.</div>}
    {error && <div role="alert" className="sci-state sci-state--error">{error}</div>}
    {isLoading && <div className="sci-state"><div className="sci-spinner" /> Đang tải dữ liệu biểu đồ…</div>}
    {!isLoading && !error && result && rows.length === 0 && <div className="sci-state">Session này chưa có dữ liệu tổng hợp theo phút.</div>}

    {!isLoading && !error && rows.length > 0 && <>
      {!hasAverageSpeed && <div className="sci-aggregation-charts-notice">
        Lần tổng hợp này chưa có dữ liệu tốc độ trung bình. Hệ thống sẽ hiển thị biểu đồ sau khi dữ liệu được cập nhật.
      </div>}
      <div className="sci-aggregation-charts-grid">
        <section className="sci-aggregation-chart-card sci-aggregation-chart-card--vehicle">
          <div className="sci-aggregation-chart-card__heading"><CarFront size={20} /><div><h2>Số lượng phương tiện</h2><p>Số xe được ghi nhận trong từng khoảng một phút.</p></div></div>
          <LineChart title="Số lượng phương tiện" unit="phương tiện/phút" labels={series.labels} values={series.vehicleCount} color="#1769e0" />
        </section>
        <section className="sci-aggregation-chart-card sci-aggregation-chart-card--speed">
          <div className="sci-aggregation-chart-card__heading"><Gauge size={20} /><div><h2>Tốc độ trung bình</h2><p>Tốc độ trung bình giúp quan sát mức độ thông thoáng giao thông.</p></div></div>
          <LineChart title="Tốc độ trung bình" unit="km/giờ" labels={series.labels} values={series.averageSpeed} color="#0b9b68" />
        </section>
        <section className="sci-aggregation-chart-card sci-aggregation-chart-card--flow">
          <div className="sci-aggregation-chart-card__heading"><Activity size={20} /><div><h2>Lưu lượng giao thông ước tính</h2><p>Lưu lượng phương tiện sau khi tổng hợp dữ liệu pNEUMA.</p></div></div>
          <LineChart title="Lưu lượng giao thông ước tính" unit="xe/phút" labels={series.labels} values={series.trafficFlow} color="#e36b19" />
        </section>
      </div>
    </>}
  </div>
}
