const FRESH_MS = 30000
const RETAIN_MS = 300000
const MAX_ENTRIES = 50
const identities = new WeakMap()
const entries = new Map()
const listeners = new Set()
let nextIdentity = 0
let session = null
let dataset_file = 0

function clearEntries() {
  for (const entry of entries.values()) entry.controller?.abort()
  entries.clear()
}

function sessionKey(scope, identity, paramsKey) {
  if (scope !== session) { clearEntries(); session = scope }
  if (!identities.has(identity)) identities.set(identity, ++nextIdentity)
  return `${identities.get(identity)}:${paramsKey}`
}

export function peekAdminResource(scope, identity, paramsKey) {
  const key = sessionKey(scope, identity, paramsKey)
  const entry = entries.get(key)
  if (!scope || !entry?.hasData || Date.now() - entry.savedAt > RETAIN_MS) return null
  return { data: entry.data, fresh: Date.now() - entry.savedAt < FRESH_MS }
}

export function loadAdminResource(scope, identity, paramsKey, load, force = false) {
  const key = sessionKey(scope, identity, paramsKey)
  const cached = peekAdminResource(scope, identity, paramsKey)
  if (!force && cached?.fresh) return Promise.resolve(cached.data)
  const existing = entries.get(key)
  if (existing?.promise) return existing.promise
  const controller = new AbortController()
  const entry = { ...existing, controller }
  const startedFile = dataset_file
  entry.promise = Promise.resolve().then(() => load(controller.signal)).then((data) => {
    if (scope && scope === session && startedFile === dataset_file && !controller.signal.aborted && entries.get(key) === entry) {
      entries.delete(key)
      entries.set(key, { data, hasData: true, savedAt: Date.now() })
      while (entries.size > MAX_ENTRIES) {
        const oldestKey = entries.keys().next().value
        entries.get(oldestKey)?.controller?.abort()
        entries.delete(oldestKey)
      }
    }
    return data
  }).catch((error) => {
    if ([401, 403].includes(error?.response?.status) && entries.get(key) === entry) entries.delete(key)
    throw error
  }).finally(() => {
    if (entries.get(key) === entry) {
      if (entry.hasData) entries.set(key, { data: entry.data, hasData: true, savedAt: entry.savedAt })
      else entries.delete(key)
    }
  })
  entries.set(key, entry)
  return entry.promise
}

export function invalidateAdminResourceCache() {
  clearEntries()
  dataset_file++
  for (const listener of listeners) listener()
}

export const adminCacheFile = () => dataset_file
export const subscribeAdminCache = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
