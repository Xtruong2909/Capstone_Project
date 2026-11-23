import { authStorage } from './authStorage'
import { engineerService } from './engineerService'

const PAGE_TTL_MS = 60000
const MAX_PAGES = 16
const resourceKey = (params) => JSON.stringify([params.group_id, params.dataset_id, params.session_id,
  params.representation, params.page_size, params.column_offset || 0])
const pageKey = (params) => resourceKey(params) + ':' + params.page

export function createEngineerPreviewCache(load, now = Date.now) {
  const pages = new Map()
  const requests = new Map()
  let disposed = false
  const cancel = (matches) => {
    for (const [key, entry] of requests) {
      if (matches(entry.params)) { entry.controller.abort(); requests.delete(key) }
    }
  }
  const peek = (params) => {
    const key = pageKey(params)
    const entry = pages.get(key)
    if (!entry || now() - entry.savedAt >= PAGE_TTL_MS) { pages.delete(key); return null }
    pages.delete(key)
    pages.set(key, entry)
    return entry.data
  }
  const clearSession = (params) => {
    const matches = (other) => other.group_id === params.group_id && other.dataset_id === params.dataset_id
      && other.session_id === params.session_id
    for (const [key, entry] of pages) if (matches(entry.params)) pages.delete(key)
    cancel(matches)
  }
  return {
    peek, clearSession,
    cancelResource: (params) => cancel((other) => resourceKey(other) === resourceKey(params)),
    clearGroup: (groupId) => {
      for (const [key, entry] of pages) if (entry.params.group_id === groupId) pages.delete(key)
      cancel((params) => params.group_id === groupId)
    },
    dispose: () => { disposed = true; pages.clear(); cancel(() => true) },
    request(params) {
      if (disposed) return Promise.reject(new DOMException('Preview cache expired', 'AbortError'))
      const cached = peek(params)
      if (cached) return Promise.resolve(cached)
      const key = pageKey(params)
      if (requests.has(key)) return requests.get(key).promise
      const controller = new AbortController()
      const entry = { params, controller }
      const promise = Promise.resolve(load(params, controller.signal)).then((data) => {
        if (disposed || controller.signal.aborted) throw new DOMException('Preview request cancelled', 'AbortError')
        if (requests.get(key) === entry) {
          pages.set(key, { params, data, savedAt: now() })
          while (pages.size > MAX_PAGES) pages.delete(pages.keys().next().value)
        }
        return data
      }).catch((error) => {
        if ([401, 403].includes(error.response?.status)) clearSession(params)
        throw error
      }).finally(() => { if (requests.get(key) === entry) requests.delete(key) })
      entry.promise = promise
      requests.set(key, entry)
      return promise
    },
  }
}

let sessionScope
let sessionCache
export function getEngineerPreviewCache() {
  const { user, sessionScope: currentScope } = authStorage.read()
  const scope = user?.id && currentScope ? user.id + ':' + currentScope : null
  if (!sessionCache || scope !== sessionScope) {
    sessionCache?.dispose()
    sessionScope = scope
    sessionCache = createEngineerPreviewCache(engineerService.previewSession)
  }
  return sessionCache
}

export function invalidateEngineerPreviews(groupId) {
  getEngineerPreviewCache().clearGroup(groupId)
}
