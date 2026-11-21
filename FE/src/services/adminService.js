import apiClient from './apiClient'

const APPROVED_CACHE_KEY = 'admin_approved_datasets_v1'
const CATALOG_CACHE_KEY = 'admin_dataset_versions_catalog_v1'

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage errors
  }
}

function extractVersionTagFromFilename(filename, datasetId) {
  if (!filename) return null
  const base = filename.replace(/\.[^/.]+$/, '')
  if (datasetId && base.startsWith(`${datasetId}_`)) {
    return base.slice(String(datasetId).length + 1)
  }
  const match = base.match(/(v\d+(?:\.\d+)*)$/i)
  return match ? match[1] : null
}

const get = async (url, params = {}, signal) => (await apiClient.get(url, { params, signal })).data

export const adminService = {
  /**
   * Lấy thống kê tổng quan hệ thống từ DB (/admin/stats)
   */
  async getStats(signal) {
    const response = await apiClient.get('/admin/stats', { signal })
    return response.data
  },

  /**
   * Lấy danh sách toàn bộ người dùng (/admin/users)
   */
  async getUsers(params = {}, signal) {
    const response = await apiClient.get('/admin/users', { params, signal })
    const data = response.data
    return Array.isArray(data) ? data : data?.items || []
  },

  /**
   * Tạo người dùng mới (/admin/users)
   */
  async createUser(userData) {
    const response = await apiClient.post('/admin/users', userData)
    return response.data
  },

  /**
   * Cập nhật trạng thái kích hoạt tài khoản
   */
  async updateUserStatus(userId, isActive) {
    const response = await apiClient.patch(`/admin/users/${userId}/status`, {
      is_active: isActive,
    })
    return response.data
  },

  /**
   * Lấy danh sách các vai trò hệ thống (/admin/roles)
   */
  async getRoles(signal) {
    const response = await apiClient.get('/admin/roles', { signal })
    const data = response.data
    return Array.isArray(data) ? data : data?.items || []
  },

  /**
   * Lấy nhật ký hoạt động hệ thống (Audit Trail)
   */
  async getAuditLogs(params = {}, signal) {
    const response = await apiClient.get('/admin/audit-logs', { params, signal })
    return response.data
  },

  /**
   * Lấy danh sách phiên bản dataset để phê duyệt (/admin/datasets)
   */
  async getDatasets(params = {}, signal) {
    const response = await apiClient.get('/admin/datasets', { params, signal })
    const items = Array.isArray(response.data) ? response.data : response.data?.items || []

    // Lưu vào catalog cache để giữ thông tin metadata khi version chuyển sang APPROVED
    const catalog = readJsonStorage(CATALOG_CACHE_KEY, {})
    items.forEach((item) => {
      if (item?.id) {
        catalog[item.id] = {
          ...catalog[item.id],
          ...item,
        }
      }
    })
    writeJsonStorage(CATALOG_CACHE_KEY, catalog)

    return items
  },

  /**
   * Xóa bộ nhớ đệm review dataset
   */
  clearReviewCache() {
    try {
      localStorage.removeItem(APPROVED_CACHE_KEY)
      localStorage.removeItem(CATALOG_CACHE_KEY)
    } catch {
      // ignore
    }
  },

  /**
   * Lưu thông tin phiên bản dataset vừa được phê duyệt hoặc cập nhật vào bộ nhớ đệm
   */
  recordDatasetReviewInCache(item, status, note) {
    if (!item?.id) return
    const catalog = readJsonStorage(CATALOG_CACHE_KEY, {})
    catalog[item.id] = {
      ...catalog[item.id],
      ...item,
      approval_status: status,
      approval_note: note,
      reviewed_at: new Date().toISOString(),
    }
    writeJsonStorage(CATALOG_CACHE_KEY, catalog)

    const approvedMap = readJsonStorage(APPROVED_CACHE_KEY, {})
    if (status === 'APPROVED') {
      approvedMap[item.id] = {
        ...approvedMap[item.id],
        ...item,
        approval_status: 'APPROVED',
        approval_note: note,
        reviewed_at: new Date().toISOString(),
      }
    } else {
      delete approvedMap[item.id]
    }
    writeJsonStorage(APPROVED_CACHE_KEY, approvedMap)
  },

  /**
   * Lấy danh sách các phiên bản dataset đã được APPROVED
   */
  async getApprovedDatasets() {
    const [datasetsRes, auditLogsRes, grantsRes] = await Promise.all([
      apiClient.get('/admin/datasets', { params: { limit: 100 } }).catch(() => ({ data: [] })),
      apiClient.get('/admin/audit-logs', { params: { limit: 200 } }).catch(() => ({ data: [] })),
      apiClient.get('/admin/access-grants', { params: { limit: 100 } }).catch(() => ({ data: [] })),
    ])

    const apiDatasets = Array.isArray(datasetsRes.data)
      ? datasetsRes.data
      : datasetsRes.data?.items || []
    const auditLogs = Array.isArray(auditLogsRes.data)
      ? auditLogsRes.data
      : auditLogsRes.data?.items || []
    const accessGrants = Array.isArray(grantsRes.data)
      ? grantsRes.data
      : grantsRes.data?.items || []

    const catalog = readJsonStorage(CATALOG_CACHE_KEY, {})
    const approvedMap = readJsonStorage(APPROVED_CACHE_KEY, {})

    // 1. Nếu API /admin/datasets trả về bản ghi nào có status APPROVED thì ghi nhận
    apiDatasets.forEach((item) => {
      if (item?.id) {
        catalog[item.id] = { ...catalog[item.id], ...item }
        if ((item.approval_status || '').toUpperCase() === 'APPROVED') {
          approvedMap[item.id] = {
            ...item,
            dataset_name: item.dataset_name || catalog[item.id]?.dataset_name,
            version_tag: item.version_tag || catalog[item.id]?.version_tag,
            file_format: item.file_format || catalog[item.id]?.file_format,
            total_records: item.total_records ?? catalog[item.id]?.total_records,
          }
        }
      }
    })

    // 2. Tìm trong accessGrants những dataset_version_id đã được cấp quyền -> chắc chắn đã APPROVED
    accessGrants.forEach((grant) => {
      const vId = grant.dataset_version_id
      if (vId && !approvedMap[vId]) {
        const cached = catalog[vId] || {}
        approvedMap[vId] = {
          id: vId,
          dataset_id: cached.dataset_id || grant.dataset_id,
          dataset_name: grant.dataset_name || cached.dataset_name || 'Traffic Dataset',
          version_tag: grant.version_tag || cached.version_tag || 'v1.0',
          file_format: (cached.file_format || 'PARQUET').toUpperCase(),
          approval_status: 'APPROVED',
          approval_note: cached.approval_note || 'Approved via Access Grant',
          reviewed_at: grant.created_at || cached.reviewed_at || new Date().toISOString(),
          reviewer_name: cached.reviewer_name || null,
          reviewer_email: cached.reviewer_email || null,
          total_records: cached.total_records ?? 0,
        }
      }
    })

    // 3. Quét audit logs để khôi phục phiên bản nào từng có quyết định APPROVE
    const approvedDecisions = {}
    auditLogs.forEach((log) => {
      const action = (log.action || '').toUpperCase()
      if (action.includes('APPROVE') && log.dataset_version_id) {
        const vId = log.dataset_version_id
        if (
          !approvedDecisions[vId] ||
          new Date(log.created_at).getTime() > new Date(approvedDecisions[vId].reviewed_at).getTime()
        ) {
          approvedDecisions[vId] = {
            dataset_id: log.dataset_id,
            dataset_name: log.dataset_name,
            approval_status: 'APPROVED',
            approval_note: log.approval_note || log.details || 'Approved via Audit Log',
            reviewed_at: log.created_at,
            reviewer_name: log.full_name || log.username || null,
            reviewer_email: log.email || null,
          }
        }
      }
    })

    Object.entries(approvedDecisions).forEach(([vId, decision]) => {
      if (!approvedMap[vId]) {
        const existing = catalog[vId] || {}
        approvedMap[vId] = {
          id: vId,
          dataset_id: decision.dataset_id || existing.dataset_id,
          dataset_name: decision.dataset_name || existing.dataset_name || 'Traffic Dataset',
          version_tag: existing.version_tag || 'v1.0',
          file_format: (existing.file_format || 'PARQUET').toUpperCase(),
          total_records: existing.total_records ?? 0,
          approval_status: 'APPROVED',
          approval_note: decision.approval_note || existing.approval_note || null,
          reviewed_at: decision.reviewed_at || existing.reviewed_at || new Date().toISOString(),
          reviewer_name: decision.reviewer_name || existing.reviewer_name || null,
          reviewer_email: decision.reviewer_email || existing.reviewer_email || null,
          created_at: existing.created_at || decision.reviewed_at || new Date().toISOString(),
        }
      }
    })

    // 4. Với các phiên bản APPROVED chưa đủ thông tin, gọi API preview của Admin để làm giàu metadata
    const enrichPromises = Object.values(approvedMap).map(async (item) => {
      if (
        item.dataset_id &&
        item.id &&
        (!item.dataset_name || !item.version_tag || item.total_records == null)
      ) {
        try {
          const preview = await this.getDatasetVersionPreview(item.dataset_id, item.id, {
            page: 1,
            pageSize: 1,
            representation: 'normalized',
          })
          const inferredTag =
            item.version_tag ||
            extractVersionTagFromFilename(preview.original_filename, item.dataset_id) ||
            'v1.0'
          const enriched = {
            ...item,
            dataset_name: preview.dataset_name || item.dataset_name || 'Traffic Dataset',
            version_tag: inferredTag,
            file_format: (preview.file_format || item.file_format || 'PARQUET').toUpperCase(),
            total_records:
              preview.pagination?.total_rows ??
              preview.pagination?.returned_rows ??
              item.total_records ??
              0,
          }
          approvedMap[item.id] = enriched
          catalog[item.id] = { ...catalog[item.id], ...enriched }
        } catch {
          // Giữ nguyên thông tin hiện có nếu không gọi được preview
        }
      }
    })

    await Promise.all(enrichPromises)

    writeJsonStorage(CATALOG_CACHE_KEY, catalog)
    writeJsonStorage(APPROVED_CACHE_KEY, approvedMap)

    return Object.values(approvedMap)
      .filter((item) => (item.approval_status || '').toUpperCase() === 'APPROVED')
      .sort(
        (a, b) =>
          new Date(b.reviewed_at || b.created_at || 0).getTime() -
          new Date(a.reviewed_at || a.created_at || 0).getTime()
      )
  },

  /**
   * Admin xem trước dữ liệu của một phiên bản dataset (raw hoặc normalized)
   * GET /api/v1/admin/datasets/{dataset_id}/versions/{id}/preview
   */
  async getDatasetVersionPreview(
    datasetId,
    versionId,
    { page = 1, pageSize = 20, representation = 'normalized' } = {}
  ) {
    const response = await apiClient.get(
      `/admin/datasets/${datasetId}/versions/${versionId}/preview`,
      {
        params: {
          page,
          page_size: pageSize,
          representation,
        },
      }
    )
    return response.data
  },

  /**
   * Phê duyệt hoặc từ chối phiên bản dataset
   * Hỗ trợ cả 2 chữ ký:
   * - reviewDataset(datasetId, versionId, action) -> POST /admin/datasets/{dataset_id}/versions/{id}/review
   * - reviewDataset(versionId, action) -> POST /admin/datasets/{versionId}/review (legacy fallback)
   */
  async reviewDataset(datasetIdOrVersionId, versionIdOrAction, maybeAction) {
    if (typeof maybeAction !== 'undefined') {
      const datasetId = datasetIdOrVersionId
      const versionId = versionIdOrAction
      const action = maybeAction
      if (datasetId) {
        try {
          const response = await apiClient.post(
            `/admin/datasets/${datasetId}/versions/${versionId}/review`,
            action
          )
          return response.data
        } catch (err) {
          if (err?.response?.status === 404) {
            const fallbackResponse = await apiClient.post(
              `/admin/datasets/${versionId}/review`,
              action
            )
            return fallbackResponse.data
          }
          throw err
        }
      }
      const response = await apiClient.post(`/admin/datasets/${versionId}/review`, action)
      return response.data
    }
    const versionId = datasetIdOrVersionId
    const action = versionIdOrAction
    const response = await apiClient.post(`/admin/datasets/${versionId}/review`, action)
    return response.data
  },

  /**
   * Lấy tổng quan và danh sách thí nghiệm dự báo AI/ML
   */
  async getExperimentsOverview(params = {}, signal) {
    const response = await apiClient.get('/admin/experiments/overview', { params, signal })
    return response.data
  },

  /**
   * Lấy danh sách các quyền truy cập dataset đã cấp
   */
  async getAccessGrants(params = {}, signal) {
    const response = await apiClient.get('/admin/access-grants', { params, signal })
    const data = response.data
    return Array.isArray(data) ? data : data?.items || []
  },

  /**
   * Cấp quyền truy cập dataset cho người dùng
   * Hỗ trợ cả 2 kiểu:
   * 1. grantAccess(grantData) -> POST /admin/access-grants
   * 2. grantAccess({ dataset_id, user_id }) -> fallback POST /admin/datasets/{id}/access
   */
  async grantAccess(payload) {
    if (payload?.user_id && payload?.dataset_version_id) {
      const response = await apiClient.post('/admin/access-grants', payload)
      return response.data
    }
    if (payload?.dataset_id && payload?.user_id) {
      return (await apiClient.post(`/admin/datasets/${payload.dataset_id}/access`, { user_id: payload.user_id })).data
    }
    const response = await apiClient.post('/admin/access-grants', payload)
    return response.data
  },

  /**
   * Thu hồi quyền truy cập dataset
   */
  async revokeAccess(grantIdOrPayload) {
    if (typeof grantIdOrPayload === 'object' && grantIdOrPayload?.dataset_id && grantIdOrPayload?.user_id) {
      return (await apiClient.delete(`/admin/datasets/${grantIdOrPayload.dataset_id}/access/${grantIdOrPayload.user_id}`)).data
    }
    const response = await apiClient.delete(`/admin/access-grants/${grantIdOrPayload}`)
    return response.data
  },

  /**
   * Lấy trạng thái kết nối PostgreSQL từ Backend
   */
  async getDatabaseHealth(_, signal) {
    const baseURL = apiClient.defaults.baseURL.replace(/\/api\/v1\/?$/, '')
    return (await apiClient.get('/health/db', { baseURL, signal })).data
  },

  /* =========================================================================
     BATCH & PORTAL EXTENSIONS (Dành cho Batch Workflow & Session Preview)
     ========================================================================= */
  getDatasetGroups: (params, signal) => get('/admin/portal/dataset-groups', params, signal),
  getBatchEligibleUsers: ({ group_id, ...params }, signal) =>
    get(`/admin/datasets/groups/${group_id}/eligible-users`, params, signal),
  async grantBatchAccess({ group_id, user_id }) {
    return (await apiClient.post(`/admin/datasets/groups/${group_id}/access`, { user_id })).data
  },
  getBatchAccessUsers: ({ group_id, ...params }, signal) =>
    get(`/admin/datasets/groups/${group_id}/access`, params, signal),
  async revokeBatchAccess({ group_id, user_id }) {
    await apiClient.delete(`/admin/datasets/groups/${group_id}/access/${user_id}`)
  },
  async reviewBatch(groupId, payload) {
    return (await apiClient.post(`/admin/datasets/groups/${groupId}/review`, payload)).data
  },
  async getDatasetSessions({ dataset_id, version_id, ...params }, signal) {
    const result = await get(`/admin/datasets/${dataset_id}/versions/${version_id}/sessions`, params, signal)
    return { ...result, items: result?.sessions || [] }
  },
  getSessionPreview: ({ dataset_id, version_id, session_id, page_size = 20, ...params }, signal) =>
    get(`/admin/datasets/${dataset_id}/versions/${version_id}/sessions/${session_id}/preview`, { ...params, limit: page_size }, signal),
  getEligibleUsers: ({ dataset_id, ...params }, signal) =>
    get(`/admin/datasets/${dataset_id}/eligible-users`, params, signal),
}
