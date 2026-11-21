import { useCallback, useEffect, useState } from 'react'
import { scientistService } from '../services/scientistService'
import { dataScienceService } from '../services/dataScienceService'
import { sharingService } from '../services/sharingService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'
import { useMyShares } from './useSharedResults'

export const SHARE_SECTIONS = {
  DATASET: ['metadata', 'statistics', 'sessions', 'traffic_flow_chart'],
  TRAIN_TEST: ['split_summary', 'train_test_counts', 'session_distribution', 'split_configuration'],
  EXPERIMENT: ['experiment_summary', 'hyperparameters', 'evaluation_metrics', 'baseline_comparison', 'prediction_rows', 'horizon_comparison'],
  PREDICTION: ['forecast_summary', 'model_information', 'lag_features', 'forecast_results', 'forecast_chart'],
}

export function useShareManagement() {
  const { shares, loading: sharesLoading, error: sharesError, reload } = useMyShares()
  const [resources, setResources] = useState([])
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [resourcesError, setResourcesError] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [datasets, experimentPage, forecastPage] = await Promise.all([
          scientistService.listApprovedDatasets(),
          dataScienceService.listExperiments(),
          dataScienceService.listForecasts(),
        ])
        const experiments = [...experimentPage.data]
        for (let page = 2; page <= experimentPage.total_pages; page += 1) {
          const next = await dataScienceService.listExperiments({ page })
          experiments.push(...next.data)
        }
        const forecasts = [...forecastPage.forecasts]
        for (let page = 2; forecasts.length < forecastPage.total_records; page += 1) {
          const next = await dataScienceService.listForecasts(page)
          forecasts.push(...next.forecasts)
        }
        if (cancelled) return
        const groups = [...new Map(datasets.map((dataset) => [dataset.group_id, dataset])).values()]
        const splits = groups.flatMap((dataset) => {
          try {
            const saved = JSON.parse(sessionStorage.getItem(`science-workflow:${dataset.group_id}`) || '{}')
            return saved.split?.status === 'COMPLETED'
              ? [{ type: 'TRAIN_TEST', id: saved.split.split_id, label: `Train/Test · ${dataset.location_name || dataset.dataset_name}` }]
              : []
          } catch { return [] }
        })
        setResources([
          ...[...new Map(datasets.map((dataset) => [dataset.dataset_id, dataset])).values()].map((dataset) => ({ type: 'DATASET', id: dataset.dataset_id, label: dataset.dataset_name })),
          ...splits,
          ...experiments.filter((experiment) => experiment.status === 'COMPLETED').map((experiment) => ({ type: 'EXPERIMENT', id: experiment.experiment_id, label: experiment.experiment_name })),
          ...forecasts.filter((forecast) => forecast.status === 'COMPLETED').map((forecast) => ({ type: 'PREDICTION', id: forecast.forecast_id, label: `${forecast.experiment_name} · ${new Date(forecast.created_at).toLocaleString('vi-VN')}` })),
        ])
      } catch (err) { if (!cancelled) setResourcesError(extractErrorMessage(err, 'Không tải được tài nguyên để chia sẻ.')) }
      finally { if (!cancelled) setResourcesLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const create = useCallback(async (payload) => {
    setBusy(true); setActionError('')
    try { await sharingService.create(payload); await reload(); return true }
    catch (err) { setActionError(extractErrorMessage(err, 'Không thể tạo chia sẻ.')); return false }
    finally { setBusy(false) }
  }, [reload])
  const changeStatus = useCallback(async (shareId, status) => {
    setBusy(true); setActionError('')
    try { await sharingService.update(shareId, { status }); await reload(); return true }
    catch (err) { setActionError(extractErrorMessage(err, 'Không thể cập nhật chia sẻ.')); return false }
    finally { setBusy(false) }
  }, [reload])
  return { shares, sharesLoading, sharesError, resources, resourcesLoading, resourcesError, busy, actionError, create, changeStatus }
}
