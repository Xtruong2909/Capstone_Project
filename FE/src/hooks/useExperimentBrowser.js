import { useCallback, useEffect, useMemo, useState } from 'react'
import { scientistService } from '../services/scientistService'
import { trafficForecastService } from '../services/trafficForecastService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

const PAGE_SIZE = 100

export function useApprovedDatasetCatalog() {
  const [versions, setVersions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const reload = useCallback(() => setRefreshKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    const load = async () => {
      try {
        const all = []
        let page = []
        do {
          page = await scientistService.listApprovedDatasets({ skip: all.length, limit: PAGE_SIZE })
          all.push(...page)
        } while (page.length === PAGE_SIZE)
        if (!cancelled) setVersions(all)
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err, 'Không thể tải danh sách dataset.'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [refreshKey])

  const datasets = useMemo(() => {
    const byId = new Map()
    for (const version of versions) {
      const id = String(version.dataset_id)
      if (!byId.has(id)) byId.set(id, { ...version, versions: [] })
      byId.get(id).versions.push(version)
    }
    return [...byId.values()]
  }, [versions])

  return { datasets, isLoading, error, reload }
}

async function loadVersionExperiments(versionId) {
  const all = []
  let page = []
  do {
    page = await trafficForecastService.listTrainingExperiments({
      datasetVersionId: versionId,
      skip: all.length,
      limit: PAGE_SIZE,
    })
    all.push(...page)
  } while (page.length === PAGE_SIZE)
  return all
}

export function useDatasetExperimentBrowser(datasetId, versions, experimentId) {
  const versionKey = versions.map((version) => version.version_id).join('|')
  const [experiments, setExperiments] = useState([])
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [listError, setListError] = useState(null)
  const [selectedExperiment, setSelectedExperiment] = useState(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [recordingReference, setRecordingReference] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const reload = useCallback(() => setRefreshKey((key) => key + 1), [])

  useEffect(() => {
    let cancelled = false
    setExperiments([])
    setListError(null)
    setIsLoadingList(Boolean(datasetId && versionKey))
    if (datasetId && versionKey) {
      Promise.all(versionKey.split('|').map(loadVersionExperiments))
        .then((groups) => {
          if (!cancelled) setExperiments(groups.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
        })
        .catch((err) => {
          if (!cancelled) setListError(extractErrorMessage(err, 'Không thể tải thí nghiệm của dataset này.'))
        })
        .finally(() => { if (!cancelled) setIsLoadingList(false) })
    }
    return () => { cancelled = true }
  }, [datasetId, versionKey, refreshKey])

  useEffect(() => {
    let cancelled = false
    setSelectedExperiment(null)
    setDetailError(null)
    setRecordingReference(null)
    setIsLoadingDetail(Boolean(experimentId && datasetId && versionKey))
    if (experimentId && datasetId && versionKey) {
      trafficForecastService.getTrainingExperimentDetail(experimentId)
        .then((detail) => {
          if (cancelled) return
          if (!versionKey.split('|').includes(String(detail.dataset_version_id))) {
            setDetailError('Thí nghiệm này không thuộc dataset đã chọn.')
            return
          }
          setSelectedExperiment(detail)
          trafficForecastService.getAggregationChartData(datasetId, {
            aggregationInterval: 60,
            roiIdentifier: detail.roi_identifier || 'MAIN_ROI',
          }).then((chart) => {
            if (!cancelled) setRecordingReference(chart?.time_labels?.[0] || null)
          }).catch(() => {})
        })
        .catch((err) => {
          if (!cancelled) setDetailError(extractErrorMessage(err, 'Không thể tải chi tiết thí nghiệm.'))
        })
        .finally(() => { if (!cancelled) setIsLoadingDetail(false) })
    }
    return () => { cancelled = true }
  }, [datasetId, versionKey, experimentId])

  return { experiments, isLoadingList, listError, reload, selectedExperiment, isLoadingDetail, detailError, recordingReference }
}
