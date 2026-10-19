import apiClient from './apiClient'

export const datasetService = {
  /**
   * GET /api/v1/datasets
   * Lấy danh sách các bộ dữ liệu và phiên bản đã tải lên hệ thống
   */
  listDatasets: async (params = {}) => {
    const response = await apiClient.get('/datasets', { params })
    return response.data
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
    return response.data
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
    return response.data
  },
}
