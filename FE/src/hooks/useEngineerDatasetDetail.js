import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { adminError } from './useAdminData'
import { engineerService } from '../services/engineerService'

export function useEngineerDatasetDetail(datasetId) {
  const { user } = useAuth()
  const key = `${user?.id || ''}:${datasetId}`
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState(null)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    engineerService.getDatasetFileDetail({ dataset_id: datasetId }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, revision, data, error: '' })
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ key, revision, data: null, error: adminError(error) })
      })
    return () => controller.abort()
  }, [datasetId, key, revision])
  const current = state?.key === key && state.revision === revision ? state : null
  return { data: current?.data, loading: !current, error: current?.error, reload }
}
