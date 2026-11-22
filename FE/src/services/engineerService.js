import apiClient from './apiClient'

const get = async (url, params = {}, signal) => (await apiClient.get(url, { params, signal })).data
const groupPath = (id) => '/datasets/groups/' + id
const optionalGet = async (url, signal) => {
  try { return await get(url, {}, signal) }
  catch (error) {
    if (error.response?.status === 404 || (error.response?.status === 409
      && error.response?.data?.detail === 'Nhóm chưa Export thành công tất cả Dataset')) return null
    throw error
  }
}

const submittedFiles = async (signal) => (await get('/datasets/files', {}, signal))
  .filter((item) => ['SUBMITTED', 'APPROVED', 'REJECTED'].includes(item.approval_status))
  .sort((a, b) => (Date.parse(b.submitted_at || b.created_at) || 0) - (Date.parse(a.submitted_at || a.created_at) || 0))
const pageItems = (items, page, page_size) => ({ items: items.slice((page - 1) * page_size, page * page_size), total: items.length, page, page_size })

export const engineerService = {
  getPipelineState: ({ group_id }, signal) => get(groupPath(group_id) + '/workflow', {}, signal),
  async listPipelineGroups(params, signal) {
    const data = await get('/datasets/pipeline/groups', params, signal)
    return { ...data, items: data.groups }
  },
  async listSubmissionBatches({ page = 1, page_size = 20, search, status }, signal) {
    const dataset_files = await submittedFiles(signal)
    const batches = new Map()
    for (const dataset_file of dataset_files) {
      const key = dataset_file.group_id || 'ungrouped'
      if (!batches.has(key)) batches.set(key, { group_id: dataset_file.group_id || null, group_name: dataset_file.group_name, dataset_files: [] })
      batches.get(key).dataset_files.push(dataset_file)
    }
    const items = [...batches.values()].filter((batch) => (!search || [batch.group_name, ...batch.dataset_files.map((item) => item.dataset_name)].some((value) => value?.toLowerCase().includes(search.toLowerCase())))
      && (!status || batch.dataset_files.some((item) => item.approval_status === status)))
      .map((batch) => {
        const statuses = new Set(batch.dataset_files.map((item) => item.approval_status))
        return { ...batch, dataset_count: new Set(batch.dataset_files.map((item) => item.dataset_id)).size,
          approval_status: statuses.size === 1 ? [...statuses][0] : 'MIXED',
          approval_notes: [...new Set(batch.dataset_files.map((item) => item.approval_note).filter(Boolean))],
          submitted_at: batch.dataset_files.find((item) => item.submitted_at)?.submitted_at || null }
      })
    return pageItems(items, page, page_size)
  },
  async listSubmittedFiles({ page = 1, page_size = 20, search, status, group_id, ungrouped }, signal) {
    // The dataset_files API returns the complete list; filter before paginating it.
    const data = await submittedFiles(signal)
    const items = data.filter((item) => (!status || item.approval_status === status)
      && (!group_id || item.group_id === group_id) && (!ungrouped || !item.group_id)
      && (!search || [item.dataset_name].some((value) => value?.toLowerCase().includes(search.toLowerCase()))))
    return pageItems(items, page, page_size)
  },
  async listGroups(params, signal) {
    const data = await get('/datasets', params, signal)
    return { ...data, items: data.groups }
  },
  async listDatasets({ group_id, page = 1, page_size = 20, search, drone_id, recording_date_from, recording_date_to }, signal) {
    // This endpoint returns the complete batch. Paginate after filtering that full list.
    const data = await get(groupPath(group_id) + '/datasets', {}, signal)
    const filtered = data.datasets.filter((item) => (!search || item.name.toLowerCase().includes(search.toLowerCase()))
      && (!drone_id || item.drone_id === drone_id)
      && (!recording_date_from || item.recording_date >= recording_date_from)
      && (!recording_date_to || item.recording_date <= recording_date_to))
    return { ...data, groups: [{ group_name: data.group_name }], total: filtered.length, page, page_size,
      items: filtered.slice((page - 1) * page_size, page * page_size) }
  },
  getDataset: ({ dataset_id }, signal) => get('/datasets/' + dataset_id, {}, signal),
  async getDatasetFileDetail({ dataset_id }, signal) {
    const files = await get('/datasets/' + dataset_id + '/files', {}, signal)
    const file = files.find((item) => item.dataset_id === dataset_id)
    if (!file) throw new Error('Không tìm thấy thông tin tập dữ liệu.')
    return { ...file, name: file.dataset_name }
  },
  async listSessions({ group_id, dataset_id, ...params }, signal) {
    const data = await get(groupPath(group_id) + '/datasets/' + dataset_id + '/sessions', params, signal)
    return { ...data, items: data.sessions }
  },
  previewSession: ({ group_id, dataset_id, session_id, page_size = 20, ...params }, signal) =>
    get(groupPath(group_id) + '/datasets/' + dataset_id + '/sessions/' + session_id, { ...params, limit: page_size }, signal),
  async getMapping({ group_id }, signal) {
    const [schema, mapping] = await Promise.all([
      get(groupPath(group_id) + '/columns', {}, signal),
      get(groupPath(group_id) + '/column-mappings', {}, signal),
    ])
    return { ...schema, mappings: mapping.mappings }
  },
  async saveMapping(groupId, mappings) { return (await apiClient.patch(groupPath(groupId) + '/column-mappings', { mappings })).data },
  async normalize(groupId) { return (await apiClient.post(groupPath(groupId) + '/normalize')).data },
  async exportGroup(groupId) { return (await apiClient.post(groupPath(groupId) + '/export')).data },
  getProcessingJob: ({ group_id, job_id }, signal) => get(groupPath(group_id) + '/processing-jobs/' + job_id, {}, signal),
  getNormalizationPreview: ({ group_id, job_id, dataset_id }, signal) =>
    get(groupPath(group_id) + '/processing-jobs/' + job_id + '/datasets/' + dataset_id + '/preview', {}, signal),
  getUploadJob: ({ job_id }, signal) => get('/datasets/upload/jobs/' + job_id, {}, signal),
  getReport: ({ group_id }, signal) => optionalGet(groupPath(group_id) + '/report', signal),
  getStatus: ({ group_id }, signal) => optionalGet(groupPath(group_id) + '/status', signal),
  async getFiles({ group_id }, signal) {
    const data = await get(groupPath(group_id) + '/files', {}, signal)
    return { ...data, items: data.dataset_files }
  },
  async submit(groupId, comment) { return (await apiClient.post(groupPath(groupId) + '/submit', { comment: comment.trim() || null })).data },
  async resubmit(groupId) { return (await apiClient.post(groupPath(groupId) + '/resubmit')).data },
  async upload({ files, ...metadata }, onUploadProgress) {
    const body = new FormData()
    files.forEach((file) => body.append('files', file))
    Object.entries(metadata).forEach(([key, value]) => { if (value?.trim()) body.append(key, value.trim()) })
    return (await apiClient.post('/datasets/upload', body, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress })).data
  },
  async getHealth(_, signal) {
    const baseURL = apiClient.defaults.baseURL.replace(/\/api\/v1\/?$/, '')
    return (await apiClient.get('/health/db', { baseURL, signal })).data
  },
}
