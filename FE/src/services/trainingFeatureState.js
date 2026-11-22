import { authStorage } from './authStorage'

// Remember only the successful extraction's ROI; reload samples through the API.
// This avoids storing potentially large sample matrices in browser storage.
function storageKey(datasetId, fileId) {
  const { user } = authStorage.read()
  if (!user?.id || !datasetId || !fileId) return null
  return `training-features:v1:${user.id}:${datasetId}:${fileId}`
}

function splitStorageKey(datasetId, fileId) {
  const { user } = authStorage.read()
  if (!user?.id || !datasetId || !fileId) return null
  return `training-split:v1:${user.id}:${datasetId}:${fileId}`
}

function predictionRoiStorageKey(datasetId, fileId) {
  const { user } = authStorage.read()
  if (!user?.id || !datasetId || !fileId) return null
  return `prediction-features:v1:${user.id}:${datasetId}:${fileId}`
}

function forecastStorageKey(datasetId, fileId) {
  const { user } = authStorage.read()
  if (!user?.id || !datasetId || !fileId) return null
  return `prediction-forecast:v1:${user.id}:${datasetId}:${fileId}`
}

export const trainingFeatureState = {
  read(datasetId, fileId) {
    try {
      const key = storageKey(datasetId, fileId)
      const roi = key && localStorage.getItem(key)
      return typeof roi === 'string' && roi.trim() && roi.length <= 64 ? roi : null
    } catch {
      return null
    }
  },
  save(datasetId, fileId, roiIdentifier) {
    try {
      const key = storageKey(datasetId, fileId)
      if (key) localStorage.setItem(key, roiIdentifier)
    } catch {
      // Storage may be unavailable; the current extraction remains usable.
    }
  },
  readSplit(datasetId, fileId) {
    try {
      const key = splitStorageKey(datasetId, fileId)
      const raw = key && sessionStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  },
  saveSplit(datasetId, fileId, splitData) {
    try {
      const key = splitStorageKey(datasetId, fileId)
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
  readPredictionRoi(datasetId, fileId) {
    try {
      const key = predictionRoiStorageKey(datasetId, fileId)
      const roi = key && localStorage.getItem(key)
      return typeof roi === 'string' && roi.trim() && roi.length <= 64 ? roi : null
    } catch {
      return null
    }
  },
  savePredictionRoi(datasetId, fileId, roiIdentifier) {
    try {
      const key = predictionRoiStorageKey(datasetId, fileId)
      if (key) localStorage.setItem(key, roiIdentifier)
    } catch {
      // Ignore storage errors.
    }
  },
  readForecast(datasetId, fileId) {
    try {
      const key = forecastStorageKey(datasetId, fileId)
      const raw = key && sessionStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  },
  saveForecast(datasetId, fileId, forecastData) {
    try {
      const key = forecastStorageKey(datasetId, fileId)
      if (!key) return
      if (!forecastData) {
        sessionStorage.removeItem(key)
      } else {
        sessionStorage.setItem(key, JSON.stringify(forecastData))
      }
    } catch {
      // Ignore storage errors.
    }
  },
}
