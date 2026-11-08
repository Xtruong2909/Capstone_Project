import { authStorage } from './authStorage'

// Remember only the successful extraction's ROI; reload samples through the API.
// This avoids storing potentially large sample matrices in browser storage.
function storageKey(datasetId, versionId) {
  const { user } = authStorage.read()
  if (!user?.id || !datasetId || !versionId) return null
  return `training-features:v1:${user.id}:${datasetId}:${versionId}`
}

function splitStorageKey(datasetId, versionId) {
  const { user } = authStorage.read()
  if (!user?.id || !datasetId || !versionId) return null
  return `training-split:v1:${user.id}:${datasetId}:${versionId}`
}

export const trainingFeatureState = {
  read(datasetId, versionId) {
    try {
      const key = storageKey(datasetId, versionId)
      const roi = key && localStorage.getItem(key)
      return typeof roi === 'string' && roi.trim() && roi.length <= 64 ? roi : null
    } catch {
      return null
    }
  },
  save(datasetId, versionId, roiIdentifier) {
    try {
      const key = storageKey(datasetId, versionId)
      if (key) localStorage.setItem(key, roiIdentifier)
    } catch {
      // Storage may be unavailable; the current extraction remains usable.
    }
  },
  readSplit(datasetId, versionId) {
    try {
      const key = splitStorageKey(datasetId, versionId)
      const raw = key && sessionStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  },
  saveSplit(datasetId, versionId, splitData) {
    try {
      const key = splitStorageKey(datasetId, versionId)
      if (!key) return
      if (!splitData) {
        sessionStorage.removeItem(key)
      } else {
        sessionStorage.setItem(key, JSON.stringify(splitData))
      }
    } catch {
      // Ignore storage quota or private browsing errors.
    }
  },
}
