import apiClient from './apiClient'

const DATASET_META_CACHE_KEY = 'pneuma_de_dataset_meta_v1'

function loadMetaCache() {
  try {
    const raw = localStorage.getItem(DATASET_META_CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveMetaCache(cache) {
  try {
    localStorage.setItem(DATASET_META_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore storage errors
  }
}

export const datasetService = {
  /**
   * Lấy danh sách các bộ dữ liệu và phiên bản đã tải lên hệ thống.
   * Tương thích với endpoint GET /api/v1/datasets/versions trên nhánh Dev-D.Khang.
   */
  listDatasets: async (params = {}) => {
    try {
      const response = await apiClient.get('/datasets/versions', {
        params: params.status ? { status: params.status } : {},
      })
      const versions = Array.isArray(response.data) ? response.data : []
      const metaCache = loadMetaCache()

      return versions.map((v) => {
        const cached = metaCache[v.dataset_id] || {}
        const shortId = String(v.dataset_id || '')
          .slice(0, 8)
          .toUpperCase()
        return {
          dataset_id: v.dataset_id,
          version_id: v.version_id,
          name: cached.name || v.name || `Traffic Dataset #${shortId}`,
          code: cached.code || v.code || `DATASET_${shortId}`,
          source: cached.source || v.source || 'pNEUMA Drone Swarm - Athens',
          description: cached.description || v.description || '',
          capture_date: cached.capture_date || v.capture_date || null,
          location_name:
            cached.location_name || v.location_name || 'Athens Central Business District',
          version_tag: v.version_tag || 'v1.0',
          file_format: cached.file_format || v.file_format || 'CSV',
          original_filename: cached.original_filename || v.original_filename || `dataset_${shortId}.csv`,
          file_size_bytes: cached.file_size_bytes ?? v.file_size_bytes ?? 0,
          approval_status: v.approval_status || 'PENDING',
          approval_note: v.approval_note || null,
          submitted_by: v.submitted_by || null,
          submitted_at: v.submitted_at || null,
          approved_by: v.approved_by || null,
          created_at: v.created_at,
        }
      })
    } catch {
      const fallback = await apiClient.get('/datasets', { params })
      return fallback.data
    }
  },

  /**
   * POST /api/v1/datasets/upload
   * Tải lên file dataset (.csv, .json, .xls, .xlsx, .parquet) kèm metadata
   */
  uploadDataset: async (payload, onUploadProgress) => {
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
      saveMetaCache(cache)
    }

    return uploaded
  },

  /**
   * GET /api/v1/datasets/{dataset_id}/preview
   * Xem trước cấu trúc cột, cảnh báo và các dòng dữ liệu (hỗ trợ chuẩn hóa pNEUMA)
   */
  previewDataset: async (datasetId, params = {}) => {
    const response = await apiClient.get(`/datasets/${datasetId}/preview`, {
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
      saveMetaCache(cache)
    }

    return data
  },
}
