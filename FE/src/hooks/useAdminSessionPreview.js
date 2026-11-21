import { useCallback, useEffect } from 'react'
import { adminService } from '../services/adminService'
import { useAdminResource } from './useAdminData'

const CACHE_TTL_MS = 60000
const MAX_CACHED_PAGES = 8

export function useAdminSessionPreview(params, cache) {
  const load = useCallback(async (request, signal) => {
    const key = JSON.stringify(request)
    const existing = cache.get(key)
    if (existing && Date.now() - existing.savedAt < CACHE_TTL_MS) return existing.data
    const data = await adminService.getSessionPreview(request, signal)
    if (!signal.aborted) {
      cache.delete(key)
      cache.set(key, { data, savedAt: Date.now() })
      if (cache.size > MAX_CACHED_PAGES) cache.delete(cache.keys().next().value)
    }
    return data
  }, [cache])
  const resource = useAdminResource(load, params)
  const paramsKey = JSON.stringify(params)
  useEffect(() => {
    const request = JSON.parse(paramsKey)
    if (!resource.data?.pagination.has_more || request.page >= 10000) return
    const controller = new AbortController()
    load({ ...request, page: request.page + 1 }, controller.signal).catch(() => {
      // A prefetch failure must not interrupt the page currently being viewed.
    })
    return () => controller.abort()
  }, [load, paramsKey, resource.data])
  return resource
}
