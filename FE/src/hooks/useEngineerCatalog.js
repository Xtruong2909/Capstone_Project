import { useCallback, useEffect, useRef, useState } from 'react'
import { datasetService } from '../services/datasetService'
import { engineerService } from '../services/engineerService'

export function useEngineerCatalog() {
  const [datasets, setDatasets] = useState([])
  const [dbStatus, setDbStatus] = useState(null)
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState(null)
  const request = useRef(null)
  const fetchCatalogAndHealth = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setIsLoadingCatalog(true)
    setCatalogError(null)
    try {
      const [items, health] = await Promise.all([
        datasetService.listDatasets({ limit: 100 }, controller.signal),
        engineerService.getHealth({}, controller.signal).catch(() => ({ status: 'disconnected' })),
      ])
      if (controller.signal.aborted) return
      setDatasets(items)
      setDbStatus(health)
    } catch (error) {
      if (controller.signal.aborted) return
      setDatasets([])
      setCatalogError(error.response?.data?.detail || 'Failed to load dataset catalog from the server.')
    } finally {
      if (!controller.signal.aborted) setIsLoadingCatalog(false)
    }
  }, [])
  useEffect(() => {
    fetchCatalogAndHealth()
    return () => { request.current?.abort() }
  }, [fetchCatalogAndHealth])
  return { datasets, setDatasets, dbStatus, isLoadingCatalog, catalogError, fetchCatalogAndHealth }
}
