import { useCallback, useEffect, useState } from 'react'
import { scientistService } from '../services/scientistService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

export function useApprovedDatasets(search = '') {
  const [datasets, setDatasets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setDatasets(await scientistService.listApprovedDatasets({ search }))
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load approved datasets.'))
    } finally {
      setIsLoading(false)
    }
  }, [search])

  useEffect(() => {
    reload()
  }, [reload])

  return { datasets, isLoading, error, reload }
}

export function useDatasetPreview(datasetId, versionId, { page, pageSize, representation }) {
  const [preview, setPreview] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    scientistService
      .getDatasetPreview(datasetId, versionId, { page, pageSize, representation })
      .then((data) => !cancelled && setPreview(data))
      .catch(
        (err) =>
          !cancelled && setError(extractErrorMessage(err, 'Failed to load data preview.'))
      )
      .finally(() => !cancelled && setIsLoading(false))
    return () => {
      cancelled = true
    }
  }, [datasetId, versionId, page, pageSize, representation])

  return { preview, isLoading, error }
}
