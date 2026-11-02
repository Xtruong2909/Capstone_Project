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

export const adminService = {
  /**
   * Lấy thống kê tổng quan hệ thống từ DB
   */
  async getStats() {
    const response = await apiClient.get('/admin/stats')
    return response.data
  },

  /**
   * Lấy danh sách toàn bộ người dùng
   */
  async getUsers(params = {}) {
    const response = await apiClient.get('/admin/users', { params })
    return response.data
  },

  /**
   * Tạo người dùng mới
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
   * Lấy danh sách các vai trò hệ thống
   */
  async getRoles() {
    const response = await apiClient.get('/admin/roles')
    return response.data
  },

  /**
   * Lấy nhật ký hoạt động hệ thống (Audit Trail)
   */
  async getAuditLogs(params = {}) {
    const response = await apiClient.get('/admin/audit-logs', { params })
    return response.data
  },

  /**
   * Lấy danh sách phiên bản dataset để phê duyệt
   */
  async getDatasets(params = {}) {
    const response = await apiClient.get('/admin/datasets', { params })
    const items = Array.isArray(response.data) ? response.data : []

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
   * Kết hợp dữ liệu từ API (/admin/datasets, /admin/audit-logs, /admin/access-grants, /admin/datasets/{dataset_id}/versions/{id}/preview)
   * và cache để hiển thị đầy đủ trên trang Dataset Available mà không cần sửa Backend.
   */
  async getApprovedDatasets() {
    const [datasetsRes, auditLogsRes, grantsRes] = await Promise.all([
      apiClient.get('/admin/datasets', { params: { limit: 100 } }).catch(() => ({ data: [] })),
      apiClient.get('/admin/audit-logs', { params: { limit: 200 } }).catch(() => ({ data: [] })),
      apiClient.get('/admin/access-grants', { params: { limit: 100 } }).catch(() => ({ data: [] })),
    ])

    const apiDatasets = Array.isArray(datasetsRes.data) ? datasetsRes.data : []
    const auditLogs = Array.isArray(auditLogsRes.data) ? auditLogsRes.data : []
    const accessGrants = Array.isArray(grantsRes.data) ? grantsRes.data : []

    const catalog = readJsonStorage(CATALOG_CACHE_KEY, {})
    const approvedMap = readJsonStorage(APPROVED_CACHE_KEY, {})

    // 1. Nếu API /admin/datasets trả về bản ghi nào có status APPROVED thì ghi nhận
    apiDatasets.forEach((item) => {
      if (item?.id) {
        catalog[item.id] = { ...catalog[item.id], ...item }
        if ((item.approval_status || '').toUpperCase() === 'APPROVED') {
          approvedMap[item.id] = { ...approvedMap[item.id], ...item, approval_status: 'APPROVED' }
        }
      }
    })

    // 2. Thu thập dataset_id và metadata từ access_grants
    const grantMetaByVersionId = {}
    accessGrants.forEach((g) => {
      if (g?.dataset_version_id) {
        grantMetaByVersionId[g.dataset_version_id] = {
          id: g.dataset_version_id,
          dataset_id: g.dataset_id,
          dataset_name: g.dataset_name,
          version_tag: g.version_tag,
        }
      }
    })

    // 3. Phân tích Audit Logs để tìm tất cả version có trạng thái cuối cùng là APPROVED
    //    và ánh xạ version_id -> dataset_id từ các log SUBMIT_DATASET_FOR_REVIEW / RESUBMIT_DATASET_FOR_REVIEW
    const datasetIdByVersionId = {}
    const latestDecisionByVersionId = {}

    // auditLogs được trả về theo thứ tự mới nhất trước (created_at DESC)
    auditLogs.forEach((log) => {
      const resId = log?.resource_id
      const details = log?.details || {}

      if (details.version_id && details.dataset_id) {
        datasetIdByVersionId[details.version_id] = details.dataset_id
      }
      if (resId && details.dataset_id) {
        datasetIdByVersionId[resId] = details.dataset_id
      }
      if (
        log?.action === 'CONFIRM_DATASET_COLUMN_MAPPING' &&
        resId &&
        details.dataset_version_id
      ) {
        datasetIdByVersionId[details.dataset_version_id] = resId
      }

      if (log?.resource_type === 'DATASET_VERSION' && resId) {
        if (!latestDecisionByVersionId[resId]) {
          if (log.action === 'DATASET_APPROVED' || details.status === 'APPROVED') {
            latestDecisionByVersionId[resId] = {
              status: 'APPROVED',
              note: details.note || null,
              reviewed_at: log.created_at,
              reviewer_email: log.user_email || null,
            }
          } else if (log.action === 'DATASET_REJECTED' || details.status === 'REJECTED') {
            latestDecisionByVersionId[resId] = {
              status: 'REJECTED',
              note: details.note || null,
              reviewed_at: log.created_at,
            }
          } else if (
            log.action === 'SUBMIT_DATASET_FOR_REVIEW' ||
            log.action === 'RESUBMIT_DATASET_FOR_REVIEW'
          ) {
            latestDecisionByVersionId[resId] = {
              status: 'SUBMITTED',
              note: details.note || null,
              reviewed_at: log.created_at,
            }
          }
        }
      }
    })

    // Loại bỏ những version mà quyết định mới nhất không còn là APPROVED
    Object.keys(latestDecisionByVersionId).forEach((versionId) => {
      const decision = latestDecisionByVersionId[versionId]
      if (decision.status !== 'APPROVED') {
        delete approvedMap[versionId]
      } else {
        const existing = approvedMap[versionId] || catalog[versionId] || grantMetaByVersionId[versionId] || {}
        approvedMap[versionId] = {
          ...existing,
          id: versionId,
          dataset_id: existing.dataset_id || datasetIdByVersionId[versionId] || null,
          approval_status: 'APPROVED',
          approval_note: decision.note ?? existing.approval_note ?? null,
          reviewed_at: decision.reviewed_at || existing.reviewed_at || existing.created_at || null,
          reviewer_email: decision.reviewer_email || existing.reviewer_email || null,
          created_at: existing.created_at || decision.reviewed_at || new Date().toISOString(),
        }
      }
    })

    // 4. Với các phiên bản APPROVED chưa đủ thông tin (thiếu dataset_name, version_tag hoặc total_records),
    //    gọi API preview của Admin để lấy đầy đủ metadata từ Backend
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
  async getDatasetVersionPreview(datasetId, versionId, { page = 1, pageSize = 20, representation = 'normalized' } = {}) {
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
  async getExperimentsOverview() {
    const response = await apiClient.get('/admin/experiments/overview')
    return response.data
  },

  /**
   * Lấy danh sách các quyền truy cập dataset đã cấp
   */
  async getAccessGrants(params = {}) {
    const response = await apiClient.get('/admin/access-grants', { params })
    return response.data
  },

  /**
   * Cấp quyền truy cập dataset cho người dùng
   */
  async grantAccess(grantData) {
    const response = await apiClient.post('/admin/access-grants', grantData)
    return response.data
  },

  /**
   * Thu hồi quyền truy cập dataset
   */
  async revokeAccess(grantId) {
    const response = await apiClient.delete(`/admin/access-grants/${grantId}`)
    return response.data
  },
}

