import { useEffect, useState } from 'react'
import { dataScienceService } from '../services/dataScienceService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

export function useForecastCharts(forecast) {
  const [result, setResult] = useState({ key: '', charts: {}, errors: {} })

  const forecastId = forecast?.forecast_id
  const sessionIds = forecast?.results_by_session?.map((session) => session.session_id) || []
  const sessionKey = sessionIds.join(',')
  const requestKey = forecastId && sessionKey ? `${forecastId}:${sessionKey}` : ''

  useEffect(() => {
    if (!requestKey) return
    let cancelled = false

    Promise.all(sessionKey.split(',').map(async (sessionId) => {
      try {
        return { sessionId, chart: await dataScienceService.getForecastChart(forecastId, sessionId) }
      } catch (error) {
        return { sessionId, error: extractErrorMessage(error, 'Không tải được biểu đồ của phiên ghi hình này.') }
      }
    })).then((results) => {
      if (cancelled) return
      setResult({
        key: requestKey,
        charts: Object.fromEntries(results.filter((item) => item.chart).map(({ sessionId, chart }) => [sessionId, chart])),
        errors: Object.fromEntries(results.filter((item) => item.error).map(({ sessionId, error }) => [sessionId, error])),
      })
    })

    return () => { cancelled = true }
  }, [forecastId, sessionKey, requestKey])

  return {
    charts: result.key === requestKey ? result.charts : {},
    errors: result.key === requestKey ? result.errors : {},
    loading: Boolean(requestKey) && result.key !== requestKey,
  }
}
