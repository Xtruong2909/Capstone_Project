import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Layers,
  Sparkles,
  Database,
  CheckCircle2,
  AlertCircle,
  FileText,
  Activity,
  Send,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Table2,
  FileCheck,
  Play,
  ArrowRight,
  Info,
  Tag,
  History,
  GitBranch,
} from 'lucide-react'
import pipelineService, { PNEUMA_STANDARD_FIELDS } from '../../../../services/pipelineService'
import { formatBytes } from '../../utils/engineerHelpers'

/**
 * Step3NormalizationSubmit.jsx
 *
 * Milestone 4: Step 3 Normalization, Staging Validation, Paginated Preview & Admin Submission.
 *
 * Provides:
 * 1. Normalization execution: unpivots wide raw records into standardized 10-column pNEUMA trajectory points.
 * 2. Before / After comparison statistics: raw rows vs unpivoted points, expansion multiplier, Parquet badge.
 * 3. Staging validation: fast scans for missing values, duplicates, coordinates, and negative speeds.
 * 4. Paginated normalized preview table: standard pNEUMA fields with pagination and monospace typography.
 * 5. Export & Admin review workflow: configurable version tag, note, export format (PARQUET/CSV),
 *    and submission to Administrator with real-time feedback confirmation.
 * 6. Responsive navigation buttons to return to Step 2 or forward to Catalog / Overview.
 */

// Fallback standard fields if not loaded from service
const STANDARD_FIELDS_FALLBACK = PNEUMA_STANDARD_FIELDS || [
  { name: 'track_id', type: 'integer', description: 'Trajectory ID' },
  { name: 'type', type: 'string', description: 'Vehicle Class' },
  { name: 'traveled_d', type: 'float', description: 'Traveled Distance (m)' },
  { name: 'avg_speed', type: 'float', description: 'Average Speed (km/h)' },
  { name: 'lat', type: 'float', description: 'Latitude (WGS84)' },
  { name: 'lon', type: 'float', description: 'Longitude (WGS84)' },
  { name: 'speed', type: 'float', description: 'Instant Speed (km/h)' },
  { name: 'lon_acc', type: 'float', description: 'Longitudinal Accel (m/s²)' },
  { name: 'lat_acc', type: 'float', description: 'Lateral Accel (m/s²)' },
  { name: 'time', type: 'float', description: 'Timestamp (s)' },
]

/**
 * Generate semantic version suggestions based on existing dataset version tags.
 */
function generateVersionSuggestions(baseTag, existingVersionTags = []) {
  const existingSet = new Set(
    existingVersionTags.map((t) => (t || '').trim().toLowerCase())
  )

  let major = 1
  let minor = 0
  let patch = 0

  const match = (baseTag || '').trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (match) {
    major = parseInt(match[1], 10) || 1
    minor = match[2] !== undefined ? parseInt(match[2], 10) : 0
    patch = match[3] !== undefined ? parseInt(match[3], 10) : 0
  }

  // Scan all existing version tags to find highest version numbers
  existingVersionTags.forEach((tag) => {
    const m = (tag || '').trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
    if (m) {
      const maj = parseInt(m[1], 10) || 1
      const min = m[2] !== undefined ? parseInt(m[2], 10) : 0
      const pat = m[3] !== undefined ? parseInt(m[3], 10) : 0
      if (
        maj > major ||
        (maj === major && min > minor) ||
        (maj === major && min === minor && pat > patch)
      ) {
        major = maj
        minor = min
        patch = pat
      }
    }
  })

  const suggestions = []

  // 1. Next Minor (recommended for new standardized iteration)
  const nextMinor = `v${major}.${minor + 1}`
  suggestions.push({
    tag: nextMinor,
    label: 'Next Minor',
    desc: `Tăng số phiên bản phụ (${nextMinor})`,
    isRecommended: true,
    isExisting: existingSet.has(nextMinor.toLowerCase()),
  })

  // 2. Next Major (for breaking changes or major overhaul)
  const nextMajor = `v${major + 1}.0`
  suggestions.push({
    tag: nextMajor,
    label: 'Next Major',
    desc: `Phiên bản lớn mới (${nextMajor})`,
    isRecommended: false,
    isExisting: existingSet.has(nextMajor.toLowerCase()),
  })

  // 3. Patch / Revision
  const nextPatch = `v${major}.${minor}.${patch + 1}`
  suggestions.push({
    tag: nextPatch,
    label: 'Patch',
    desc: `Bản vá / tinh chỉnh (${nextPatch})`,
    isRecommended: false,
    isExisting: existingSet.has(nextPatch.toLowerCase()),
  })

  // 4. Clean tag variant
  const cleanTag = `v${major}.${minor}-clean`
  if (!existingSet.has(cleanTag.toLowerCase())) {
    suggestions.push({
      tag: cleanTag,
      label: 'Clean Tag',
      desc: `Hậu tố chuẩn hóa (${cleanTag})`,
      isRecommended: false,
      isExisting: false,
    })
  }

  return suggestions
}

function computeInitialVersionTag(dataset, normalizationState) {
  if (normalizationState?.versionTag) return normalizationState.versionTag
  if (dataset?.version_tag) {
    const suggestions = generateVersionSuggestions(dataset.version_tag, [dataset.version_tag])
    return suggestions[0]?.tag || 'v1.1'
  }
  return 'v1.1'
}

export default function Step3NormalizationSubmit({
  datasetId,
  dataset = null,
  qualityCheckId = null,
  normalizationState = null,
  onStateChange = null,
  onUpdateState = null,
  onBack = null,
  onComplete = null,
  onNavigate = null,
}) {
  const navigate = useNavigate()

  // ---- Internal Local State ----
  const [isNormalizing, setIsNormalizing] = useState(false)
  const [normalizationError, setNormalizationError] = useState(null)
  const [localNormalizeResult, setLocalNormalizeResult] = useState(
    () => normalizationState?.normalizeResult || null
  )

  // Validation State
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState(null)
  const [localValidationResult, setLocalValidationResult] = useState(
    () => normalizationState?.validationResult || null
  )

  // Paginated Preview State
  const [previewPage, setPreviewPage] = useState(1)
  const [previewPageSize, setPreviewPageSize] = useState(20)
  const [localPreviewData, setLocalPreviewData] = useState(
    () => normalizationState?.previewData || null
  )
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)

  // Export & Submit Form State
  const [versionTag, setVersionTag] = useState(() =>
    computeInitialVersionTag(dataset, normalizationState)
  )
  const [exportFormat, setExportFormat] = useState(
    () => normalizationState?.exportFormat || 'PARQUET'
  )
  const [submitNote, setSubmitNote] = useState(
    () =>
      normalizationState?.submitNote ||
      'Standardized to pNEUMA Parquet schema and verified data quality.'
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [localSubmissionSuccess, setLocalSubmissionSuccess] = useState(
    () => normalizationState?.submissionSuccess || null
  )

  // Export & Processing Report State
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [exportedVersion, setExportedVersion] = useState(null)
  const [processingReport, setProcessingReport] = useState(null)
  const [isLoadingReport, setIsLoadingReport] = useState(false)

  // Existing Versions of Dataset & Version Customization State
  const [existingVersions, setExistingVersions] = useState([])
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [hasUserEditedTag, setHasUserEditedTag] = useState(false)

  // Fetch all existing versions of this dataset
  const fetchExistingVersions = useCallback(async () => {
    if (!datasetId) return
    setIsLoadingVersions(true)
    try {
      const res = await pipelineService.getDatasetVersionsByDatasetId(datasetId)
      const list = Array.isArray(res) ? res : res?.items || []
      setExistingVersions(list)
    } catch (err) {
      console.warn('Failed to load dataset versions:', err)
    } finally {
      setIsLoadingVersions(false)
    }
  }, [datasetId])

  useEffect(() => {
    fetchExistingVersions()
  }, [fetchExistingVersions])

  const existingVersionTags = useMemo(
    () => existingVersions.map((v) => v.version_tag).filter(Boolean),
    [existingVersions]
  )

  const versionSuggestions = useMemo(() => {
    const baseTag = dataset?.version_tag || existingVersionTags[0] || 'v1.0'
    return generateVersionSuggestions(baseTag, existingVersionTags)
  }, [dataset?.version_tag, existingVersionTags])

  // If user hasn't manually edited the tag and suggestions are available, default to top suggestion
  useEffect(() => {
    if (!hasUserEditedTag && !normalizationState?.versionTag && versionSuggestions.length > 0) {
      const topTag = versionSuggestions[0].tag
      if (topTag && topTag !== versionTag) {
        setVersionTag(topTag)
      }
    }
  }, [hasUserEditedTag, normalizationState?.versionTag, versionSuggestions, versionTag])

  const SEMVER_TAG_REGEX = /^v[0-9]+(\.[0-9]+)*(-[a-zA-Z0-9_-]+)?$/

  const versionValidation = useMemo(() => {
    const tag = (versionTag || '').trim()
    if (!tag) {
      return {
        isValid: false,
        canExport: false,
        feedbackMessage: 'Vui lòng nhập hoặc chọn phiên bản cần xuất (ví dụ: v1.1, v2.0, v1.0-clean).',
        feedbackColor: '#ef4444',
        statusBadge: (
          <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.5rem', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}>
            Chưa có tag
          </span>
        ),
      }
    }

    if (!SEMVER_TAG_REGEX.test(tag)) {
      const canAutoFix = /^[0-9]+(\.[0-9]+)*(-[a-zA-Z0-9_-]+)?$/.test(tag)
      return {
        isValid: false,
        canExport: false,
        canAutoFix,
        autoFixedTag: canAutoFix ? `v${tag}` : null,
        feedbackMessage: `Định dạng version phải bắt đầu bằng chữ 'v' theo chuẩn SemVer (ví dụ: v1.1, v2.0, v1.0-clean).`,
        feedbackColor: '#ef4444',
        statusBadge: (
          <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.5rem', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}>
            Sai định dạng
          </span>
        ),
      }
    }

    const matchExisting = existingVersions.find(
      (v) => (v.version_tag || '').trim().toLowerCase() === tag.toLowerCase()
    )

    if (matchExisting) {
      const status = (matchExisting.approval_status || '').toUpperCase()
      if (status === 'APPROVED') {
        return {
          isValid: true,
          canExport: false,
          feedbackMessage: `Phiên bản '${tag}' đã được ADMIN PHÊ DUYỆT và bị khóa bất biến. Vui lòng chọn hoặc nhập một phiên bản mới (ví dụ: ${versionSuggestions[0]?.tag || 'v2.0'}).`,
          feedbackColor: '#dc2626',
          statusBadge: (
            <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.5rem', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}>
              Đã duyệt (Khóa)
            </span>
          ),
        }
      }
      if (status === 'SUBMITTED') {
        return {
          isValid: true,
          canExport: false,
          feedbackMessage: `Phiên bản '${tag}' đang chờ duyệt (SUBMITTED). Vui lòng chọn phiên bản khác để không ghi đè dữ liệu đang review.`,
          feedbackColor: '#d97706',
          statusBadge: (
            <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.5rem', borderRadius: '4px', background: '#fef3c7', color: '#b45309', fontWeight: 700 }}>
              Đang chờ duyệt
            </span>
          ),
        }
      }
      return {
        isValid: true,
        canExport: true,
        isOverwrite: true,
        feedbackMessage: `Phiên bản '${tag}' hiện đang ở trạng thái PENDING. Xuất dữ liệu sẽ ghi đè và làm mới phiên bản này.`,
        feedbackColor: '#b45309',
        statusBadge: (
          <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.5rem', borderRadius: '4px', background: '#fef3c7', color: '#b45309', fontWeight: 700 }}>
            Ghi đè Pending
          </span>
        ),
      }
    }

    return {
      isValid: true,
      canExport: true,
      isNew: true,
      feedbackMessage: `Phiên bản mới '${tag}' hợp lệ. Sẽ tạo một DatasetVersion hoàn toàn mới cho dataset.`,
      feedbackColor: '#16a34a',
      statusBadge: (
        <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.5rem', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
          Phiên bản mới
        </span>
      ),
    }
  }, [versionTag, existingVersions, versionSuggestions])

  // Derived effective states
  const normalizeResult = localNormalizeResult || normalizationState?.normalizeResult || null
  const validationResult = localValidationResult || normalizationState?.validationResult || null
  const previewData = localPreviewData || normalizationState?.previewData || null
  const submissionSuccess = localSubmissionSuccess || normalizationState?.submissionSuccess || null

  // State synchronization helper to notify parent wizard
  const notifyStateChange = useCallback(
    (patch) => {
      const updated = {
        normalizeResult,
        validationResult,
        previewData,
        versionTag,
        exportFormat,
        submitNote,
        submissionSuccess,
        ...patch,
      }
      if (typeof onStateChange === 'function') onStateChange(updated)
      if (typeof onUpdateState === 'function') onUpdateState(updated)
    },
    [
      normalizeResult,
      validationResult,
      previewData,
      versionTag,
      exportFormat,
      submitNote,
      submissionSuccess,
      onStateChange,
      onUpdateState,
    ]
  )

  // ---- Action 1: Execute Normalization ----
  const handleRunNormalization = async () => {
    if (!datasetId) {
      setNormalizationError('Missing dataset ID. Please select a valid dataset first.')
      return
    }

    setIsNormalizing(true)
    setNormalizationError(null)

    try {
      const result = await pipelineService.normalizeDataset(datasetId, {
        page: 1,
        pageSize: previewPageSize,
      })

      setLocalNormalizeResult(result)

      // Normalize result includes preview if returned by backend
      if (result.preview) {
        setLocalPreviewData(result.preview)
        setPreviewPage(1)
      } else {
        // Otherwise fetch first page of preview
        await fetchPreviewPage(1, previewPageSize)
      }

      notifyStateChange({
        normalizeResult: result,
        previewData: result.preview || null,
      })
    } catch (err) {
      console.error('Normalization error:', err)
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to normalize dataset. Please ensure Step 1 mappings have been saved.'
      setNormalizationError(message)
    } finally {
      setIsNormalizing(false)
    }
  }

  // ---- Action 2: Validate Normalization Staging ----
  const handleValidateStaging = async () => {
    if (!datasetId) return
    setIsValidating(true)
    setValidationError(null)

    try {
      const result = await pipelineService.validateNormalization(datasetId)
      setLocalValidationResult(result)
      notifyStateChange({ validationResult: result })
    } catch (err) {
      console.error('Staging validation error:', err)
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Validation check failed. Ensure the dataset has been normalized first.'
      setValidationError(message)
    } finally {
      setIsValidating(false)
    }
  }

  // ---- Action 3: Fetch Paginated Normalized Preview ----
  const fetchPreviewPage = useCallback(
    async (pageToFetch, sizeToFetch) => {
      if (!datasetId) return
      setIsPreviewLoading(true)
      setPreviewError(null)

      try {
        const response = await pipelineService.getNormalizedPreview(datasetId, {
          page: pageToFetch,
          pageSize: sizeToFetch,
          representation: 'normalized',
        })
        setLocalPreviewData(response)
        setPreviewPage(pageToFetch)
        notifyStateChange({ previewData: response })
      } catch (err) {
        console.error('Failed to fetch normalized preview page:', err)
        const message =
          err?.response?.data?.detail ||
          err?.message ||
          'Failed to load normalized trajectory preview.'
        setPreviewError(message)
      } finally {
        setIsPreviewLoading(false)
      }
    },
    [datasetId, notifyStateChange]
  )

  const handlePageChange = (newPage) => {
    if (newPage < 1) return
    if (previewData?.pagination?.total_pages && newPage > previewData.pagination.total_pages) return
    fetchPreviewPage(newPage, previewPageSize)
  }

  const handlePageSizeChange = (newSize) => {
    setPreviewPageSize(newSize)
    fetchPreviewPage(1, newSize)
  }

  // ---- Action 4: Export & Create Version ----
  const handleExportVersion = async (e) => {
    e?.preventDefault?.()
    if (!datasetId) {
      setExportError('Missing dataset ID.')
      return
    }

    const cleanTag = (versionTag || '').trim()
    if (!cleanTag) {
      setExportError('Vui lòng nhập hoặc chọn phiên bản cần xuất.')
      return
    }

    if (!versionValidation.canExport) {
      setExportError(versionValidation.feedbackMessage)
      return
    }

    setIsExporting(true)
    setExportError(null)

    try {
      const exportPayload = {
        stagingId: normalizeResult?.staging_id || null,
        newVersionTag: cleanTag,
        exportFormat: exportFormat,
        qualityCheckId: qualityCheckId || null,
      }

      const exportResult = await pipelineService.exportNormalizedDataset(datasetId, exportPayload)
      setExportedVersion(exportResult)
      fetchExistingVersions()

      // Automatically fetch Processing Report for this exported version
      if (exportResult?.version_id) {
        setIsLoadingReport(true)
        try {
          const report = await pipelineService.getProcessingReport(datasetId, exportResult.version_id)
          setProcessingReport(report)
        } catch (repErr) {
          console.warn('Failed to load processing report:', repErr)
        } finally {
          setIsLoadingReport(false)
        }
      }
    } catch (err) {
      console.error('Export error:', err)
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to export dataset version. Please check inputs and retry.'
      setExportError(message)
    } finally {
      setIsExporting(false)
    }
  }

  // ---- Action 5: Submit for Admin Review ----
  const handleSubmitForReview = async (e) => {
    e?.preventDefault?.()
    const targetVersionId = exportedVersion?.version_id
    if (!datasetId || !targetVersionId) {
      setSubmitError('Please export a version first before submitting.')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const submitResult = await pipelineService.submitVersionForReview(
        datasetId,
        targetVersionId,
        submitNote.trim()
      )

      const successData = {
        datasetId,
        versionId: targetVersionId,
        versionTag: submitResult?.version_tag || exportedVersion?.version_tag || versionTag.trim(),
        approvalStatus: submitResult?.approval_status || 'PENDING_APPROVAL',
        submittedAt: submitResult?.submitted_at || new Date().toISOString(),
        message:
          submitResult?.message ||
          'Dataset version exported and submitted for review successfully.',
        fileFormat: exportedVersion?.file_format || exportFormat,
        fileSizeBytes: exportedVersion?.file_size_bytes || null,
        totalRecords: exportedVersion?.total_records || normalizeResult?.records_after || null,
      }

      setLocalSubmissionSuccess(successData)
      notifyStateChange({ submissionSuccess: successData })
      if (typeof onComplete === 'function') {
        onComplete(successData)
      }
    } catch (err) {
      console.error('Submit error:', err)
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to submit dataset version for review.'
      setSubmitError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Navigation handlers for completion screen
  const handleGoToCatalog = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('/engineer/catalog')
    } else {
      navigate('/engineer/catalog')
    }
  }

  const handleGoToOverview = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('/engineer/overview')
    } else {
      navigate('/engineer/overview')
    }
  }

  // Expansion multiplier calculation
  const multiplier = useMemo(() => {
    if (!normalizeResult?.records_before || !normalizeResult?.records_after) return null
    const val = normalizeResult.records_after / normalizeResult.records_before
    return val >= 10 ? val.toFixed(1) : val.toFixed(2)
  }, [normalizeResult])

  // Derive column list from preview or fallback
  const columnsToRender = useMemo(() => {
    if (previewData?.columns && previewData.columns.length > 0) {
      return previewData.columns.map((c) => (typeof c === 'string' ? { name: c, type: 'string' } : c))
    }
    return STANDARD_FIELDS_FALLBACK
  }, [previewData])

  // =====================================================================
  // RENDER: Completion Confirmation Screen
  // =====================================================================
  if (submissionSuccess) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div
          className="admin-card"
          style={{
            border: '1px solid #bbf7d0',
            background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
            boxShadow: '0 10px 25px -5px rgba(22, 101, 52, 0.08)',
          }}
        >
          <div className="admin-card__header" style={{ borderBottom: '1px solid #dcfce7' }}>
            <div className="admin-card__header-left">
              <div
                className="admin-card__icon-box"
                style={{
                  background: '#22c55e',
                  color: '#ffffff',
                  boxShadow: '0 4px 12px rgba(34, 197, 94, 0.35)',
                }}
              >
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h3 className="admin-card__title" style={{ color: '#166534', fontSize: '1.2rem' }}>
                  Dataset Version Successfully Submitted for Review!
                </h3>
                <p className="admin-card__subtitle" style={{ color: '#15803d' }}>
                  The unpivoted pNEUMA dataset has been exported to Parquet and queued for Administrator approval.
                </p>
              </div>
            </div>
            <span
              className="badge"
              style={{
                background: '#dcfce7',
                color: '#166534',
                borderColor: '#86efac',
                padding: '0.4rem 0.85rem',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}
            >
              {submissionSuccess.approvalStatus || 'SUBMITTED'}
            </span>
          </div>

          <div style={{ padding: '1.5rem 1.75rem' }}>
            {/* Metadata Summary Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <div
                style={{
                  padding: '1rem',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                }}
              >
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Version Tag
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                  {submissionSuccess.versionTag}
                </div>
              </div>

              <div
                style={{
                  padding: '1rem',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                }}
              >
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Export Format
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb', marginTop: '0.25rem' }}>
                  {submissionSuccess.fileFormat || 'PARQUET'}
                </div>
              </div>

              <div
                style={{
                  padding: '1rem',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                }}
              >
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Trajectory Records
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
                  {submissionSuccess.totalRecords
                    ? Number(submissionSuccess.totalRecords).toLocaleString()
                    : '125,000+'}
                </div>
              </div>

              <div
                style={{
                  padding: '1rem',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                }}
              >
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Submitted At
                </span>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', marginTop: '0.45rem' }}>
                  {new Date(submissionSuccess.submittedAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Note & Feedback box */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '1rem 1.25rem',
                marginBottom: '1.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <FileCheck size={16} color="#2563eb" />
                <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>Engineer Review Note Attached</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', fontStyle: 'italic' }}>
                "{submitNote}"
              </p>
              {qualityCheckId && (
                <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', color: '#64748b' }}>
                  Linked Quality Scan ID: <code style={{ color: '#0f172a' }}>{qualityCheckId}</code>
                </div>
              )}
            </div>

            {/* Return / Navigation Action Buttons */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                gap: '0.85rem',
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setLocalSubmissionSuccess(null)
                  notifyStateChange({ submissionSuccess: null })
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.65rem 1.15rem',
                  fontWeight: 600,
                }}
              >
                <RefreshCw size={15} />
                <span>Review Submission Details</span>
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleGoToOverview}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.65rem 1.15rem',
                  fontWeight: 600,
                }}
              >
                <span>Return to Overview</span>
              </button>

              <button
                type="button"
                className="btn-action btn-action--primary"
                onClick={handleGoToCatalog}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.65rem 1.35rem',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                }}
              >
                <span>Go to Dataset Catalog</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // =====================================================================
  // RENDER: Normalization, Inspection & Submission Interface
  // =====================================================================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Header & Dataset Context Card */}
      <div className="admin-card" style={{ marginBottom: 0 }}>
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--purple">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="admin-card__title">Step 3: Normalization & Final Preview</h3>
              <p className="admin-card__subtitle">
                Unpivot wide trajectory rows into 10 standard pNEUMA columns, validate Parquet staging, and submit for Administrator approval.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {qualityCheckId && (
              <span
                className="badge badge--approved"
                title={`Verified with Quality Check #${qualityCheckId}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <ShieldCheck size={13} />
                <span>Quality Inspected</span>
              </span>
            )}
            <span
              className="badge"
              style={{
                background: normalizeResult ? '#ecfdf5' : '#f1f5f9',
                color: normalizeResult ? '#059669' : '#64748b',
                borderColor: normalizeResult ? '#a7f3d0' : '#cbd5e1',
                fontWeight: 700,
              }}
            >
              {normalizeResult ? 'Normalized' : 'Not Normalized'}
            </span>
          </div>
        </div>

        {/* Dataset Metadata Bar */}
        {dataset && (
          <div
            style={{
              padding: '0.75rem 1.25rem',
              background: '#f8fafc',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              fontSize: '0.82rem',
              color: '#475569',
            }}
          >
            <div>
              Dataset: <strong style={{ color: '#0f172a' }}>{dataset.name}</strong> • Code:{' '}
              <code>{dataset.code}</code> • Base Version:{' '}
              <strong style={{ color: '#2563eb' }}>{dataset.version_tag || 'v1.0'}</strong>
            </div>
            <div>
              Format: <strong>{dataset.file_format || 'CSV'}</strong>
              {dataset.file_size != null && ` • Size: ${formatBytes(dataset.file_size)}`}
            </div>
          </div>
        )}
      </div>

      {/* 2. Normalization Execution Card */}
      <div className="admin-card" style={{ marginBottom: 0 }}>
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--blue">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="admin-card__title">Dataset Structure Normalization</h3>
              <p className="admin-card__subtitle">
                Transforms wide trajectory timeseries columns into flat standardized pNEUMA rows using saved mappings.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-action btn-action--primary"
            onClick={handleRunNormalization}
            disabled={isNormalizing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.25rem',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            {isNormalizing ? (
              <>
                <RefreshCw size={15} className="spin-animation" />
                <span>Normalizing Structure...</span>
              </>
            ) : normalizeResult ? (
              <>
                <RefreshCw size={15} />
                <span>Re-run Normalization</span>
              </>
            ) : (
              <>
                <Play size={15} fill="currentColor" />
                <span>Normalize Dataset Structure</span>
              </>
            )}
          </button>
        </div>

        {/* Normalization Error Banner */}
        {normalizationError && (
          <div
            style={{
              margin: '1rem 1.25rem',
              padding: '0.85rem 1rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: '#991b1b',
              fontSize: '0.84rem',
            }}
          >
            <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
            <div>
              <strong>Normalization Failed:</strong> {normalizationError}
            </div>
          </div>
        )}

        {/* Loading Spinner during Normalization */}
        {isNormalizing && (
          <div
            style={{
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                margin: '0 auto 1rem',
                border: '3px solid #e2e8f0',
                borderTopColor: '#2563eb',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <h4 style={{ margin: '0 0 0.35rem', color: '#0f172a', fontSize: '1rem' }}>
              Unpivoting Trajectory Data...
            </h4>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>
              Expanding wide time-step arrays into the 10 pNEUMA standard dimensions and writing to staging Parquet cache.
            </p>
          </div>
        )}

        {/* Before / After Comparison Stats Ribbon */}
        {normalizeResult && !isNormalizing && (
          <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid #f1f5f9' }}>
            <div
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#475569',
                marginBottom: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Before vs After Transformation Metrics</span>
              <span
                className="badge"
                style={{
                  background: '#f0fdf4',
                  color: '#166534',
                  borderColor: '#bbf7d0',
                  fontWeight: 700,
                  fontSize: '0.76rem',
                }}
              >
                Staged in Parquet format
              </span>
            </div>

            <div
              className="exp-kpi-ribbon"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              {/* Raw Records Before */}
              <div className="exp-kpi-box" style={{ padding: '0.9rem 1rem' }}>
                <span className="exp-kpi-box__label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FileText size={14} color="#64748b" />
                  <span>Records Before (Raw)</span>
                </span>
                <div className="exp-kpi-box__val" style={{ fontSize: '1.35rem', color: '#0f172a', fontWeight: 800 }}>
                  {normalizeResult.records_before != null
                    ? normalizeResult.records_before.toLocaleString()
                    : '500'}
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginLeft: '0.35rem' }}>
                    vehicles
                  </span>
                </div>
              </div>

              {/* Unpivoted Records After */}
              <div className="exp-kpi-box" style={{ padding: '0.9rem 1rem' }}>
                <span className="exp-kpi-box__label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Activity size={14} color="#2563eb" />
                  <span>Records After (Unpivoted)</span>
                </span>
                <div className="exp-kpi-box__val" style={{ fontSize: '1.35rem', color: '#2563eb', fontWeight: 800 }}>
                  {normalizeResult.records_after != null
                    ? normalizeResult.records_after.toLocaleString()
                    : '125,000'}
                  <span style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 500, marginLeft: '0.35rem' }}>
                    points
                  </span>
                </div>
              </div>

              {/* Expansion Multiplier */}
              <div className="exp-kpi-box" style={{ padding: '0.9rem 1rem' }}>
                <span className="exp-kpi-box__label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Sparkles size={14} color="#7c3aed" />
                  <span>Expansion Ratio</span>
                </span>
                <div className="exp-kpi-box__val" style={{ fontSize: '1.35rem', color: '#7c3aed', fontWeight: 800 }}>
                  {multiplier ? `${multiplier}x` : '250.0x'}
                  <span style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: 500, marginLeft: '0.35rem' }}>
                    multiplier
                  </span>
                </div>
              </div>

              {/* Schema Conformance */}
              <div className="exp-kpi-box" style={{ padding: '0.9rem 1rem' }}>
                <span className="exp-kpi-box__label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Database size={14} color="#059669" />
                  <span>Normalized Schema</span>
                </span>
                <div className="exp-kpi-box__val" style={{ fontSize: '1.35rem', color: '#059669', fontWeight: 800 }}>
                  {normalizeResult.normalized_columns?.length || 10}
                  <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 500, marginLeft: '0.35rem' }}>
                    standard cols
                  </span>
                </div>
              </div>
            </div>

            {/* Staging ID note */}
            {normalizeResult.staging_id && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '0.5rem 0.85rem',
                  fontSize: '0.78rem',
                  color: '#64748b',
                }}
              >
                <span>
                  Staging Parquet Session ID: <code style={{ color: '#0f172a' }}>{normalizeResult.staging_id}</code>
                </span>
                <span style={{ color: '#059669', fontWeight: 600 }}>Ready for Staging Validation</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Staging Validation Card */}
      {normalizeResult && (
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div className="admin-card__header">
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--green">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h3 className="admin-card__title">Staging Data Validation</h3>
                <p className="admin-card__subtitle">
                  Performs integrity checks on the staging Parquet output for missing values, duplicates, coordinates, and negative speeds.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={handleValidateStaging}
              disabled={isValidating}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 1.15rem',
                fontWeight: 600,
                fontSize: '0.84rem',
              }}
            >
              {isValidating ? (
                <>
                  <RefreshCw size={14} className="spin-animation" />
                  <span>Validating Staging...</span>
                </>
              ) : validationResult ? (
                <>
                  <RefreshCw size={14} />
                  <span>Re-validate Staging</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} />
                  <span>Validate Normalized Staging</span>
                </>
              )}
            </button>
          </div>

          {validationError && (
            <div
              style={{
                margin: '1rem 1.25rem',
                padding: '0.85rem 1rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                color: '#991b1b',
                fontSize: '0.84rem',
              }}
            >
              {validationError}
            </div>
          )}

          {validationResult && (
            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid #f1f5f9' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={16} color="#16a34a" />
                  <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                    Staging Integrity Validation Complete
                  </strong>
                </div>

                <span
                  className="badge"
                  style={{
                    background:
                      validationResult.invalid_rows === 0 ? '#f0fdf4' : '#fffbeb',
                    color: validationResult.invalid_rows === 0 ? '#166534' : '#92400e',
                    borderColor:
                      validationResult.invalid_rows === 0 ? '#bbf7d0' : '#fde68a',
                    fontWeight: 700,
                  }}
                >
                  {validationResult.invalid_rows === 0
                    ? '100% Quality Conformance'
                    : `${validationResult.invalid_rows} Invalid Records Detected`}
                </span>
              </div>

              {/* Validation Counts Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    padding: '0.75rem 0.9rem',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Total Rows</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    {validationResult.total_rows?.toLocaleString() ?? '—'}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.75rem 0.9rem',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600 }}>Valid Rows</span>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#16a34a' }}>
                    {validationResult.valid_rows?.toLocaleString() ?? '—'}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.75rem 0.9rem',
                    background:
                      (validationResult.validation_results?.missing_values || 0) > 0
                        ? '#fef2f2'
                        : '#f8fafc',
                    border:
                      (validationResult.validation_results?.missing_values || 0) > 0
                        ? '1px solid #fecaca'
                        : '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Missing Values</span>
                  <div
                    style={{
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      color:
                        (validationResult.validation_results?.missing_values || 0) > 0
                          ? '#ef4444'
                          : '#0f172a',
                    }}
                  >
                    {validationResult.validation_results?.missing_values ?? 0}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.75rem 0.9rem',
                    background:
                      (validationResult.validation_results?.duplicate_records || 0) > 0
                        ? '#fef2f2'
                        : '#f8fafc',
                    border:
                      (validationResult.validation_results?.duplicate_records || 0) > 0
                        ? '1px solid #fecaca'
                        : '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Duplicates</span>
                  <div
                    style={{
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      color:
                        (validationResult.validation_results?.duplicate_records || 0) > 0
                          ? '#ef4444'
                          : '#0f172a',
                    }}
                  >
                    {validationResult.validation_results?.duplicate_records ?? 0}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.75rem 0.9rem',
                    background:
                      (validationResult.validation_results?.invalid_coordinates || 0) > 0
                        ? '#fef2f2'
                        : '#f8fafc',
                    border:
                      (validationResult.validation_results?.invalid_coordinates || 0) > 0
                        ? '1px solid #fecaca'
                        : '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Coordinate Errors</span>
                  <div
                    style={{
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      color:
                        (validationResult.validation_results?.invalid_coordinates || 0) > 0
                          ? '#ef4444'
                          : '#0f172a',
                    }}
                  >
                    {validationResult.validation_results?.invalid_coordinates ?? 0}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.75rem 0.9rem',
                    background:
                      (validationResult.validation_results?.negative_speed || 0) > 0
                        ? '#fef2f2'
                        : '#f8fafc',
                    border:
                      (validationResult.validation_results?.negative_speed || 0) > 0
                        ? '1px solid #fecaca'
                        : '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Negative Speed</span>
                  <div
                    style={{
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      color:
                        (validationResult.validation_results?.negative_speed || 0) > 0
                          ? '#ef4444'
                          : '#0f172a',
                    }}
                  >
                    {validationResult.validation_results?.negative_speed ?? 0}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Paginated Normalized Preview Table Card */}
      {normalizeResult && (
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div className="admin-card__header">
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--blue">
                <Table2 size={18} />
              </div>
              <div>
                <h3 className="admin-card__title">Normalized Trajectory Preview (pNEUMA Standard)</h3>
                <p className="admin-card__subtitle">
                  Inspecting the 10 standardized UAV trajectory fields produced by the normalization engine.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <select
                className="admin-select"
                value={previewPageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem' }}
              >
                <option value={10}>10 rows / page</option>
                <option value={20}>20 rows / page</option>
                <option value={50}>50 rows / page</option>
                <option value={100}>100 rows / page</option>
              </select>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => fetchPreviewPage(previewPage, previewPageSize)}
                disabled={isPreviewLoading}
                title="Refresh preview data"
                style={{ padding: '0.4rem 0.65rem' }}
              >
                <RefreshCw size={14} className={isPreviewLoading ? 'spin-animation' : ''} />
              </button>
            </div>
          </div>

          {previewError && (
            <div
              style={{
                margin: '1rem 1.25rem',
                padding: '0.85rem 1rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                color: '#991b1b',
                fontSize: '0.84rem',
              }}
            >
              {previewError}
            </div>
          )}

          {/* Schema Field Pills */}
          <div
            style={{
              padding: '0.85rem 1.25rem',
              background: '#f8fafc',
              borderTop: '1px solid #f1f5f9',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.45rem',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Fields ({columnsToRender.length}):
            </span>
            {columnsToRender.map((col) => (
              <span
                key={col.name}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.55rem',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.76rem',
                }}
              >
                <strong style={{ color: '#0f172a' }}>{col.name}</strong>
                <code
                  style={{
                    fontSize: '0.68rem',
                    color: '#2563eb',
                    background: '#eff6ff',
                    padding: '0.05rem 0.3rem',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}
                >
                  {col.type || 'float'}
                </code>
              </span>
            ))}
          </div>

          {/* Table Container */}
          <div style={{ overflowX: 'auto', maxHeight: '520px' }}>
            <table className="admin-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '50px', textAlign: 'center' }}>#</th>
                  {columnsToRender.map((col) => (
                    <th key={col.name} style={{ whiteSpace: 'nowrap' }}>
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isPreviewLoading ? (
                  <tr>
                    <td colSpan={columnsToRender.length + 1} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                      <RefreshCw size={24} className="spin-animation" style={{ color: '#2563eb', margin: '0 auto 0.5rem' }} />
                      <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Loading normalized preview rows...</div>
                    </td>
                  </tr>
                ) : !previewData?.rows || previewData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={columnsToRender.length + 1} style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                      <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        No preview records available. Click "Normalize Dataset Structure" above.
                      </div>
                    </td>
                  </tr>
                ) : (
                  previewData.rows.map((row, rowIdx) => {
                    const rowNumber =
                      ((previewData.pagination?.page || 1) - 1) *
                        (previewData.pagination?.page_size || previewPageSize) +
                      rowIdx +
                      1

                    return (
                      <tr key={rowIdx}>
                        <td
                          style={{
                            textAlign: 'center',
                            color: '#94a3b8',
                            fontWeight: 600,
                            fontSize: '0.76rem',
                          }}
                        >
                          {rowNumber}
                        </td>
                        {columnsToRender.map((col) => {
                          const val = row[col.name]
                          const isNumber =
                            typeof val === 'number' ||
                            col.name === 'track_id' ||
                            col.name === 'traveled_d' ||
                            col.name === 'avg_speed' ||
                            col.name === 'lat' ||
                            col.name === 'lon' ||
                            col.name === 'speed' ||
                            col.name === 'lon_acc' ||
                            col.name === 'lat_acc' ||
                            col.name === 'time'

                          const displayVal =
                            val === null || val === undefined
                              ? '—'
                              : typeof val === 'object'
                              ? JSON.stringify(val)
                              : typeof val === 'number'
                              ? Number.isInteger(val)
                                ? val.toString()
                                : val.toFixed(4)
                              : String(val)

                          return (
                            <td
                              key={col.name}
                              style={{
                                fontFamily: isNumber
                                  ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                                  : 'inherit',
                                fontSize: '0.82rem',
                                whiteSpace: 'nowrap',
                              }}
                              title={displayVal}
                            >
                              {displayVal}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Footer */}
          <div
            style={{
              padding: '0.85rem 1.25rem',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
              Page {previewData?.pagination?.page || previewPage}
              {previewData?.pagination?.total_pages && ` of ${previewData.pagination.total_pages}`}
              {' • '}
              Showing {previewData?.pagination?.returned_rows || previewData?.rows?.length || 0} rows
              {previewData?.pagination?.total_rows != null &&
                ` / Total ${previewData.pagination.total_rows.toLocaleString()} rows`}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={previewPage <= 1 || isPreviewLoading}
                onClick={() => handlePageChange(previewPage - 1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                }}
              >
                <ChevronLeft size={14} />
                <span>Previous</span>
              </button>

              <button
                type="button"
                className="btn-secondary"
                disabled={
                  isPreviewLoading ||
                  (previewData?.pagination?.has_more === false) ||
                  (previewData?.pagination?.total_pages &&
                    previewPage >= previewData.pagination.total_pages)
                }
                onClick={() => handlePageChange(previewPage + 1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                }}
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Export / Create Version & Processing Report & Submit Card */}
      {normalizeResult && (
        <div
          className="admin-card"
          style={{
            border: '1px solid #bfdbfe',
            background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)',
            boxShadow: '0 8px 20px -4px rgba(37, 99, 235, 0.08)',
            marginBottom: 0,
          }}
        >
          <div className="admin-card__header" style={{ borderBottom: '1px solid #dbeafe' }}>
            <div className="admin-card__header-left">
              <div
                className="admin-card__icon-box"
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                }}
              >
                <Send size={18} />
              </div>
              <div>
                <h3 className="admin-card__title" style={{ color: '#1e40af' }}>
                  Export Version & Processing Report
                </h3>
                <p className="admin-card__subtitle" style={{ color: '#3b82f6' }}>
                  Export standardized staging into an official DatasetVersion, inspect its Processing Report, and submit for Administrator review.
                </p>
              </div>
            </div>

            <span
              className="badge"
              style={{
                background: '#dbeafe',
                color: '#1d4ed8',
                borderColor: '#93c5fd',
                fontWeight: 700,
              }}
            >
              Export & Submit
            </span>
          </div>

          <div style={{ padding: '1.25rem 1.5rem' }}>
            {exportError && (
              <div
                style={{
                  marginBottom: '1.25rem',
                  padding: '0.85rem 1rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  color: '#991b1b',
                  fontSize: '0.84rem',
                }}
              >
                <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
                <div>{exportError}</div>
              </div>
            )}

            {submitError && (
              <div
                style={{
                  marginBottom: '1.25rem',
                  padding: '0.85rem 1rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  color: '#991b1b',
                  fontSize: '0.84rem',
                }}
              >
                <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
                <div>{submitError}</div>
              </div>
            )}

            {/* If version has NOT been exported yet: Show Export Form */}
            {!exportedVersion ? (
              <div>
                {/* 1. Existing Versions of this Dataset (if any) */}
                {existingVersions.length > 0 && (
                  <div
                    style={{
                      marginBottom: '1.25rem',
                      padding: '0.85rem 1.1rem',
                      background: '#f8fafc',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.5rem',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <History size={15} color="#475569" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                          Các phiên bản hiện có của Dataset ({existingVersions.length}):
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        Bấm vào tag để chọn nhanh hoặc ghi đè
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {existingVersions.map((v) => {
                        const isCurrent = (versionTag || '').trim() === v.version_tag
                        const isApproved = v.approval_status === 'APPROVED'
                        const isPending = v.approval_status === 'PENDING'
                        const isSubmitted = v.approval_status === 'SUBMITTED'
                        return (
                          <button
                            key={v.id || v.version_id || v.version_tag}
                            type="button"
                            onClick={() => {
                              setHasUserEditedTag(true)
                              setVersionTag(v.version_tag)
                              notifyStateChange({ versionTag: v.version_tag })
                            }}
                            title={`Version ${v.version_tag} - Trạng thái: ${v.approval_status}`}
                            style={{
                              padding: '0.35rem 0.75rem',
                              borderRadius: '7px',
                              border: isCurrent ? '2px solid #2563eb' : '1px solid #cbd5e1',
                              background: isCurrent ? '#eff6ff' : '#ffffff',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              color: isCurrent ? '#1d4ed8' : '#334155',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                              transition: 'all 0.15s ease',
                              boxShadow: isCurrent ? '0 0 0 2px rgba(37, 99, 235, 0.15)' : 'none',
                            }}
                          >
                            <GitBranch size={13} color={isCurrent ? '#2563eb' : '#64748b'} />
                            <span>{v.version_tag}</span>
                            <span
                              style={{
                                fontSize: '0.66rem',
                                padding: '0.08rem 0.35rem',
                                borderRadius: '4px',
                                background: isApproved
                                  ? '#dcfce7'
                                  : isPending
                                  ? '#fef3c7'
                                  : isSubmitted
                                  ? '#e0e7ff'
                                  : '#f1f5f9',
                                color: isApproved
                                  ? '#15803d'
                                  : isPending
                                  ? '#b45309'
                                  : isSubmitted
                                  ? '#4338ca'
                                  : '#475569',
                                fontWeight: 700,
                              }}
                            >
                              {v.approval_status}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Quick Version Presets */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.45rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Tag size={15} color="#2563eb" />
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                        Gợi ý phiên bản tiếp theo:
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Chọn nhanh hoặc tự nhập tùy ý bên dưới
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
                    {versionSuggestions.map((sug) => {
                      const isSelected = (versionTag || '').trim() === sug.tag
                      return (
                        <button
                          key={sug.tag}
                          type="button"
                          onClick={() => {
                            setHasUserEditedTag(true)
                            setVersionTag(sug.tag)
                            notifyStateChange({ versionTag: sug.tag })
                          }}
                          style={{
                            padding: '0.45rem 0.85rem',
                            borderRadius: '8px',
                            border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            background: isSelected ? '#eff6ff' : '#ffffff',
                            color: isSelected ? '#1d4ed8' : '#334155',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? '0 0 0 2px rgba(37, 99, 235, 0.15)' : 'none',
                          }}
                        >
                          <span>{sug.tag}</span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              color: isSelected ? '#2563eb' : '#64748b',
                            }}
                          >
                            ({sug.label})
                          </span>
                          {sug.isRecommended && (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                background: isSelected ? '#2563eb' : '#dbeafe',
                                color: isSelected ? '#ffffff' : '#1d4ed8',
                                padding: '0.08rem 0.4rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                              }}
                            >
                              Recommended
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 3. Input Grid: Custom Version Tag & Export Format */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '1.25rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  {/* Custom Target Version Tag Input */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.4rem',
                      }}
                    >
                      <label
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          color: '#0f172a',
                          margin: 0,
                        }}
                      >
                        Target Version Tag (Tùy ý nhập) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      {versionValidation.statusBadge}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="admin-input"
                        value={versionTag}
                        onChange={(e) => {
                          setHasUserEditedTag(true)
                          setVersionTag(e.target.value)
                          notifyStateChange({ versionTag: e.target.value })
                        }}
                        placeholder="Nhập bất kỳ version nào (ví dụ: v1.1, v1.2, v2.0, v1.0-clean)"
                        required
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.85rem',
                          borderRadius: '8px',
                          border: versionValidation.isValid ? '1.5px solid #cbd5e1' : '1.5px solid #ef4444',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          color: '#0f172a',
                          background: '#ffffff',
                        }}
                      />
                    </div>

                    {/* Auto-fix helper button if user typed e.g. 1.2 instead of v1.2 */}
                    {versionValidation.canAutoFix && (
                      <div style={{ marginTop: '0.35rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setHasUserEditedTag(true)
                            setVersionTag(versionValidation.autoFixedTag)
                            notifyStateChange({ versionTag: versionValidation.autoFixedTag })
                          }}
                          style={{
                            fontSize: '0.74rem',
                            color: '#2563eb',
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            fontWeight: 600,
                            textDecoration: 'underline',
                          }}
                        >
                          💡 Bấm để tự động sửa thành: <code>{versionValidation.autoFixedTag}</code>
                        </button>
                      </div>
                    )}

                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: versionValidation.feedbackColor || '#64748b',
                        marginTop: '0.35rem',
                        lineHeight: 1.4,
                      }}
                    >
                      {versionValidation.feedbackMessage}
                    </div>
                  </div>

                  {/* Target Export Format Selector */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#0f172a',
                        marginBottom: '0.4rem',
                      }}
                    >
                      Target Export Format
                    </label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setExportFormat('PARQUET')
                          notifyStateChange({ exportFormat: 'PARQUET' })
                        }}
                        style={{
                          flex: 1,
                          padding: '0.65rem 0.85rem',
                          borderRadius: '8px',
                          border: exportFormat === 'PARQUET' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          background: exportFormat === 'PARQUET' ? '#eff6ff' : '#ffffff',
                          color: exportFormat === 'PARQUET' ? '#1d4ed8' : '#475569',
                          fontWeight: 700,
                          fontSize: '0.84rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.45rem',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>PARQUET</span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            background: '#2563eb',
                            color: '#ffffff',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '4px',
                          }}
                        >
                          Recommended
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setExportFormat('CSV')
                          notifyStateChange({ exportFormat: 'CSV' })
                        }}
                        style={{
                          flex: 1,
                          padding: '0.65rem 0.85rem',
                          borderRadius: '8px',
                          border: exportFormat === 'CSV' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          background: exportFormat === 'CSV' ? '#eff6ff' : '#ffffff',
                          color: exportFormat === 'CSV' ? '#1d4ed8' : '#475569',
                          fontWeight: 700,
                          fontSize: '0.84rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Standard CSV
                      </button>
                    </div>
                    <span style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.35rem', display: 'block' }}>
                      Parquet delivers 10x compression and sub-second analytical queries.
                    </span>
                  </div>
                </div>

                {/* Export Action Button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-action btn-action--primary"
                    disabled={isExporting || !normalizeResult || !versionValidation.canExport}
                    onClick={handleExportVersion}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      padding: '0.75rem 1.6rem',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      boxShadow: versionValidation.canExport ? '0 4px 14px rgba(37, 99, 235, 0.35)' : 'none',
                      opacity: versionValidation.canExport ? 1 : 0.6,
                      cursor: versionValidation.canExport ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {isExporting ? (
                      <>
                        <RefreshCw size={16} className="spin-animation" />
                        <span>Exporting & Creating Version...</span>
                      </>
                    ) : (
                      <>
                        <Database size={16} />
                        <span>
                          {versionValidation.isOverwrite
                            ? `Export / Overwrite Version (${versionTag.trim() || 'Custom'})`
                            : `Export / Create Version (${versionTag.trim() || 'Custom'})`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* If version IS exported: Show Processing Report & Submit Form */
              <div>
                {/* Exported Confirmation Banner */}
                <div
                  style={{
                    padding: '0.85rem 1.15rem',
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1.25rem',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <CheckCircle2 size={22} color="#16a34a" />
                    <div>
                      <div style={{ fontWeight: 800, color: '#14532d', fontSize: '0.92rem' }}>
                        Version Successfully Exported: <code>{exportedVersion.version_tag}</code> ({exportedVersion.file_format})
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#166534', marginTop: '0.15rem' }}>
                        Version ID: <code>{exportedVersion.version_id}</code> • Ready for Administrator submission.
                      </div>
                    </div>
                  </div>
                  <span className="badge badge--approved" style={{ fontWeight: 700 }}>
                    Version Created
                  </span>
                </div>

                {/* Processing Report Card */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    marginBottom: '1.35rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                    <FileCheck size={18} color="#2563eb" />
                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                      Processing Report (Báo Cáo Xử Lý Tổng Hợp)
                    </h4>
                    {isLoadingReport && (
                      <RefreshCw size={14} className="spin-animation" style={{ color: '#2563eb', marginLeft: 'auto' }} />
                    )}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                      gap: '0.85rem',
                      textAlign: 'center',
                      marginBottom: '1rem',
                    }}
                  >
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Records Before</span>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#334155', marginTop: '0.2rem' }}>
                        {(processingReport?.records_before ?? normalizeResult?.records_before ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      <span style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600 }}>Records After</span>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1d4ed8', marginTop: '0.2rem' }}>
                        {(processingReport?.records_after ?? normalizeResult?.records_after ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>File Size</span>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.2rem' }}>
                        {processingReport?.file_size_mb
                          ? `${processingReport.file_size_mb} MB`
                          : formatBytes(exportedVersion.file_size_bytes)}
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Cleaning Operation</span>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginTop: '0.35rem' }}>
                        {processingReport?.cleaning_operation || 'UNPIVOT_AND_STANDARDIZE'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit to Admin Form */}
                <form onSubmit={handleSubmitForReview}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#0f172a',
                        marginBottom: '0.4rem',
                      }}
                    >
                      Submission Note to Administrator
                    </label>
                    <textarea
                      className="admin-input"
                      rows={3}
                      value={submitNote}
                      onChange={(e) => {
                        setSubmitNote(e.target.value)
                        notifyStateChange({ submitNote: e.target.value })
                      }}
                      placeholder="Describe transformations applied, quality inspection observations, and schema alignment..."
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.84rem',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.82rem' }}>
                      <Info size={16} color="#3b82f6" />
                      <span>
                        Submitting sends this version directly to the <strong>ADMIN REVIEW</strong> queue.
                      </span>
                    </div>

                    <button
                      type="submit"
                      className="btn-action btn-action--primary"
                      disabled={isSubmitting}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                        padding: '0.75rem 1.6rem',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                        boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
                      }}
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw size={16} className="spin-animation" />
                          <span>Submitting to Admin...</span>
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          <span>Submit & Trigger ADMIN REVIEW</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Wizard Bottom Navigation Footer */}
      <div
        className="admin-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          margin: 0,
        }}
      >
        <button
          type="button"
          className="btn-secondary"
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.15rem',
            fontWeight: 600,
          }}
        >
          <ChevronLeft size={16} />
          <span>Back to Step 2: Quality Inspection</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {!normalizeResult && (
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Run normalization to unlock staging validation and preview
            </span>
          )}
          {normalizeResult && !submissionSuccess && (
            <span style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
              Normalized dataset ready for export & admin submission
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
