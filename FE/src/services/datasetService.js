import apiClient from './apiClient'
import { engineerStorageKey, readEngineerStorage, writeEngineerStorage } from './engineerStorage'

const DATASET_META_CACHE_KEY = 'pneuma_de_dataset_meta_v1'

function loadMetaCache() {
  try {
    return readEngineerStorage(DATASET_META_CACHE_KEY, {})
  } catch {
    return {}
  }
}

function saveMetaCache(cache, ownerKey) {
  if (!ownerKey || ownerKey !== engineerStorageKey(DATASET_META_CACHE_KEY)) return
  try {
    writeEngineerStorage(DATASET_META_CACHE_KEY, cache)
  } catch {
    // Ignore storage errors
  }
}

export const datasetService = {
  /**
   * Lấy danh sách các bộ dữ liệu và dữ liệu đã tải lên hệ thống.
   * Tương thích với endpoint GET /api/v1/datasets/files trên nhánh Dev-D.Khang.
   */
  listDatasets: async (params = {}, signal) => {
    try {
      const response = await apiClient.get('/datasets/files', {
        params: params.status ? { status: params.status } : {},
        signal,
      })
      const dataset_files = Array.isArray(response.data) ? response.data : []

      // Metadata belongs to a specific API dataset_file. A dataset-level browser cache
      // can contain another dataset_file's CSV name, byte count or source details.
      return dataset_files.map((dataset_file) => ({
        ...dataset_file,
        name: dataset_file.dataset_name || dataset_file.name || '',
        source_sessions: dataset_file.source_sessions || [],
      }))
    } catch (error) {
      if (error.response?.status !== 404) throw error
      const fallback = await apiClient.get('/datasets', { params, signal })
      return Array.isArray(fallback.data) ? fallback.data : (fallback.data?.groups || []).flatMap((group) => group.datasets || [])
    }
  },

  /**
   * POST /api/v1/datasets/upload
   * Tải lên file dataset (.csv, .json, .xls, .xlsx, .parquet) kèm metadata
   */
  uploadDataset: async (payload, onUploadProgress) => {
    const ownerKey = engineerStorageKey(DATASET_META_CACHE_KEY)
    const formData = new FormData()
    formData.append('file', payload.file)
    formData.append('name', payload.name.trim())
    formData.append('source', payload.source.trim())
    formData.append('location_name', payload.location_name.trim())

    if (payload.description && payload.description.trim()) {
      formData.append('description', payload.description.trim())
    }
    if (payload.capture_date) {
      formData.append('capture_date', payload.capture_date)
    }

    const response = await apiClient.post('/datasets/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    })

    const uploaded = response.data
    if (uploaded?.dataset_id) {
      const cache = loadMetaCache()
      cache[uploaded.dataset_id] = {
        name: uploaded.name,
        code: uploaded.code,
        source: uploaded.source,
        description: uploaded.description,
        capture_date: uploaded.capture_date,
        location_name: uploaded.location_name,
        file_format: uploaded.file_format,
        original_filename: uploaded.original_filename,
        file_size_bytes: uploaded.file_size_bytes,
      }
      saveMetaCache(cache, ownerKey)
    }

    return uploaded
  },

  /**
   * GET /api/v1/datasets/{dataset_id}/preview
   * Xem trước cấu trúc cột, cảnh báo và các dòng dữ liệu (hỗ trợ chuẩn hóa pNEUMA)
   */
  previewDataset: async (datasetId, params = {}) => {
    const ownerKey = engineerStorageKey(DATASET_META_CACHE_KEY)
    const response = await apiClient.get(`/datasets/${datasetId}/preview`, {
        signal: params.signal,
      params: {
        page: params.page ?? 1,
        page_size: params.page_size ?? 20,
        representation: params.representation ?? 'normalized',
      },
    })

    const data = response.data
    if (datasetId && data?.original_filename) {
      const cache = loadMetaCache()
      const existing = cache[datasetId] || {}
      cache[datasetId] = {
        ...existing,
        original_filename: data.original_filename || existing.original_filename,
        file_size_bytes: data.file_size ?? existing.file_size_bytes,
      }
      saveMetaCache(cache, ownerKey)
    }

    return data
  },

  /**
   * Alias for previewDataset for backward compatibility
   */
  getDatasetPreview: async (datasetId, params = {}) => {
    return datasetService.previewDataset(datasetId, params)
  },
}
