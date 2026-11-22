import apiClient from './apiClient'

async function getApprovedGroupsPage(skip) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await apiClient.get('/datasets/approved', {
        params: { skip, limit: 100 },
      })
    } catch (error) {
      const status = error.response?.status
      const transient = !status || status === 429 || status >= 500
      if (!transient || attempt >= 2) throw error
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
}

export const scientistService = {
  async listApprovedGroups() {
    const groups = []
    let page
    do {
      const response = await getApprovedGroupsPage(groups.length)
      page = response.data
      groups.push(...page)
    } while (page.length === 100)
    return groups
  },

  async listGroupDatasets(groupId) {
    const response = await apiClient.get(`/datasets/approved/groups/${groupId}/datasets`)
    return response.data.datasets
      .filter((dataset) => dataset.approval_status === 'APPROVED')
      .map((dataset) => ({
        group_id: groupId,
        dataset_id: dataset.dataset_id,
        dataset_name: dataset.name,
        dataset_code: dataset.name,
        file_id: dataset.file_id,
        approval_status: dataset.approval_status,
        total_sessions: dataset.total_sessions,
        drone_id: dataset.drone_id,
        recording_date: dataset.recording_date,
      }))
  },

  /** Flatten accessible approved groups into datasets for Data Scientists. */
  async listApprovedDatasets({ search = '' } = {}) {
    const groups = await scientistService.listApprovedGroups()
    const datasetsByGroup = await Promise.all(groups.map(async (group) => {
      const datasets = await scientistService.listGroupDatasets(group.group_id)
      return datasets.map((dataset) => ({
        ...dataset,
        source: group.source,
        location_name: group.group_name || '',
      }))
    }))
    const dataset_files = datasetsByGroup.flat()
    const query = search.trim().toLowerCase()
    return query
      ? dataset_files.filter((item) => `${item.dataset_name} ${item.dataset_code} ${item.location_name}`.toLowerCase().includes(query))
      : dataset_files
  },

  /** Recording Sessions and their paginated previews for an approved dataset_file. */
  async listDatasetSessions(datasetId, fileId) {
    const sessions = []
    let page = 1
    while (true) {
      const response = await apiClient.get(
        `/datasets/${datasetId}/files/${fileId}/sessions`,
        { params: { page, page_size: 100 } }
      )
      sessions.push(...response.data.sessions)
      if (sessions.length >= response.data.total || response.data.sessions.length === 0) break
      page += 1
    }
    return sessions
  },

  async getDatasetPreview(
    datasetId,
    fileId,
    { sessionId, page = 1, pageSize = 20, representation = 'normalized' } = {}
  ) {
    const response = await apiClient.get(
      `/datasets/${datasetId}/files/${fileId}/sessions/${sessionId}/preview`,
      { params: { page, limit: pageSize, representation } }
    )
    return response.data
  },
}
