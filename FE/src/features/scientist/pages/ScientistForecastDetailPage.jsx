import { Activity } from 'lucide-react'
import { useLocation, useParams } from 'react-router-dom'
import { useForecastCharts } from '../../../hooks/useForecastCharts'
import { useScienceForecastDetail } from '../../../hooks/useScienceWorkflow'
import ForecastResultsPanel from '../components/ForecastResultsPanel'
import ScientistBackLink from '../components/ScientistBackLink'

export default function ScientistForecastDetailPage() {
  const { forecastId } = useParams()
  const location = useLocation()
  const { forecast, loading, error } = useScienceForecastDetail(forecastId)
  const { charts, errors: chartErrors, loading: chartsLoading } = useForecastCharts(forecast)
  const previousPage = location.state?.returnTo
  const backTo = typeof previousPage === 'string' && previousPage.startsWith('/scientist/')
    ? previousPage
    : '/scientist/datasets'

  return <div className="sci-page sci-prediction-page">
    <ScientistBackLink to={backTo}>Quay lại lịch sử dự báo</ScientistBackLink>
    <header className="sci-prediction-hero">
      <div className="sci-prediction-hero__icon"><Activity size={28} /></div>
      <div className="sci-prediction-hero__text">
        <span>DỰ BÁO GIAO THÔNG</span>
        <h1>Kết quả dự báo</h1>
        <p>{forecast?.experiment_name || 'Chi tiết lần dự báo đã lưu'}</p>
      </div>
    </header>
    {loading && <div className="sci-state"><div className="sci-spinner" /> Đang tải kết quả dự báo…</div>}
    {error && <div role="alert" className="sci-state sci-state--error">{error}</div>}
    {forecast && <ForecastResultsPanel forecast={forecast} charts={charts} chartErrors={chartErrors} chartsLoading={chartsLoading} />}
  </div>
}
