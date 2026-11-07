import apiClient from './apiClient'

export const scientistService = {
  /**
   * GET /datasets/approved - approved dataset versions the current DS/BU may access.
   * Each item: dataset_id, dataset_name, dataset_code, source, location_name,
   * version_id, version_tag, approval_status, approved_by.
   */
  async listApprovedDatasets({ search = '', skip = 0, limit = 50 } = {}) {
    const params = { skip, limit }
    if (search.trim()) params.search = search.trim()
    const response = await apiClient.get('/datasets/approved', { params })
    return response.data
  },

  /**
   * GET /datasets/{datasetId}/versions/{versionId}/preview - paginated rows of an approved version.
   */
  async getDatasetPreview(
    datasetId,
    versionId,
    { page = 1, pageSize = 20, representation = 'normalized' } = {}
  ) {
    const response = await apiClient.get(
      `/datasets/${datasetId}/versions/${versionId}/preview`,
      { params: { page, page_size: pageSize, representation } }
    )
    return response.data
  },
}
