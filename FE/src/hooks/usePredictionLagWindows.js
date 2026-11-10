import { useEffect, useState } from 'react'
import { trafficForecastService } from '../services/trafficForecastService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'
import {
  buildPredictionLagWindows,
  matchesPredictionFeature,
} from '../features/scientist/utils/predictionLagWindows'

export default function usePredictionLagWindows(datasetId, featureData) {
  const [result, setResult] = useState({ windows: [], bucketCount: 0, isLoading: false, error: null })

  useEffect(() => {
    if (!datasetId || !featureData) return undefined
    let cancelled = false
    const load = async () => {
      setResult({ windows: [], bucketCount: 0, isLoading: true, error: null })
      try {
        const chart = await trafficForecastService.getAggregationChartData(datasetId, {
          aggregationInterval: 60,
          roiIdentifier: featureData.roi_identifier || 'MAIN_ROI',
        })
        if (cancelled) return
        if (String(chart.dataset_version_id) !== String(featureData.dataset_version_id)) {
          throw new Error('Dữ liệu tổng hợp hiện tại khác phiên bản dataset đang dự báo.')
        }
        const windows = buildPredictionLagWindows(chart)
        if (!matchesPredictionFeature(windows[windows.length - 1], featureData)) {
          throw new Error('Các mốc tổng hợp không khớp với cửa sổ Lag Features mới nhất. Hãy tải lại dữ liệu.')
        }
        setResult({ windows, bucketCount: chart.time_labels?.length || 0, isLoading: false, error: null })
      } catch (error) {
        if (!cancelled) {
          setResult({ windows: [], bucketCount: 0, isLoading: false,
            error: error.response
              ? extractErrorMessage(error, 'Không thể tải các cửa sổ Lag Features lịch sử.')
              : error.message || 'Không thể tải các cửa sổ Lag Features lịch sử.',
          })
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [datasetId, featureData])

  return result
}
