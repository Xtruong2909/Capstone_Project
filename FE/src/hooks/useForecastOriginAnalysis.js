import { useEffect, useState } from 'react'
import { dataScienceService } from '../services/dataScienceService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

export function useForecastOriginAnalysis(experimentId) {
  const [sessionId, setSessionId] = useState('')
  const [originTime, setOriginTime] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(experimentId))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!experimentId) return
    let cancelled = false
    dataScienceService.getForecastOriginAnalysis(experimentId, { sessionId, originTime })
      .then((result) => { if (!cancelled) setData(result) })
      .catch((err) => {
        if (!cancelled) {
          setData(null)
          setError(extractErrorMessage(err, 'Không tải được phân tích theo thời gian gốc.'))
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [experimentId, sessionId, originTime])

  const selectSession = (value) => {
    setLoading(true)
    setError('')
    setSessionId(value)
    setOriginTime('')
  }

  const selectOrigin = (value) => {
    setLoading(true)
    setError('')
    setOriginTime(value)
  }

  return { data, loading, error, selectSession, selectOrigin }
}
