import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ShieldCheck,
  Play,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Layers,
  Activity,
  Check,
} from 'lucide-react'
import pipelineService from '../../../../services/pipelineService'
import { formatStructureLabel } from '../../utils/engineerHelpers'

/**
 * Step2QualityInspection.jsx
 *
 * Milestone 3: Step 2 Data Quality Inspection Component.
 * Sequentially triggers quality validation checks, polls real-time progress,
 * presents comprehensive quality summary score cards (valid/invalid rows,
 * error/warning breakdowns, outlier thresholds), and renders a paginated
 * table of detected data quality issues.
 */

// Helper to format issue types into human-friendly labels
function formatIssueTypeName(type) {
  switch (type) {
    case 'missing_value':
      return 'Missing Value'
    case 'duplicate_record':
      return 'Duplicate Record'
    case 'invalid_timestamp':
      return 'Invalid Timestamp'
    case 'invalid_coordinate':
      return 'Invalid Coordinate (GPS)'
    case 'invalid_format':
      return 'Invalid Format'
    case 'negative_speed':
      return 'Negative Speed'
    case 'outlier':
      return 'Kinematic Outlier'
    default:
      return type ? type.replace(/_/g, ' ') : 'General Anomaly'
  }
}

export default function Step2QualityInspection({
  datasetId,
  qualityState,
  onStateChange,
  onNext,
  onBack,
}) {
  // Local state fallbacks (used when uncontrolled or when actively mutating)
  const [localCheckId, setLocalCheckId] = useState(() => qualityState?.checkId || null)
  const [localStatus, setLocalStatus] = useState(() => qualityState?.status || 'idle')
  const [localProgressPercent, setLocalProgressPercent] = useState(() => qualityState?.progressPercent || 0)
  const [localProcessedRows, setLocalProcessedRows] = useState(() => qualityState?.processedRows || 0)
  const [localTotalRows, setLocalTotalRows] = useState(() => qualityState?.totalRows || 0)
  const [localReport, setLocalReport] = useState(() => qualityState?.report || null)
  const [localErrorMessage, setLocalErrorMessage] = useState(() => qualityState?.errorMessage || null)
  const [localIssues, setLocalIssues] = useState(() => qualityState?.issues || [])
  const [localIssuesTotal, setLocalIssuesTotal] = useState(() => qualityState?.issuesTotal || 0)

  // Derived effective values (controlled prop takes precedence when provided)
  const checkId = qualityState?.checkId !== undefined ? qualityState.checkId : localCheckId
  const status = qualityState?.status !== undefined ? qualityState.status : localStatus
  const progressPercent = qualityState?.progressPercent !== undefined ? qualityState.progressPercent : localProgressPercent
  const processedRows = qualityState?.processedRows !== undefined ? qualityState.processedRows : localProcessedRows
  const totalRows = qualityState?.totalRows !== undefined ? qualityState.totalRows : localTotalRows
  const report = qualityState?.report !== undefined ? qualityState.report : localReport
  const errorMessage = qualityState?.errorMessage !== undefined ? qualityState.errorMessage : localErrorMessage
  const issues = qualityState?.issues !== undefined ? qualityState.issues : localIssues
  const issuesTotal = qualityState?.issuesTotal !== undefined ? qualityState.issuesTotal : localIssuesTotal

  const [isStartingScan, setIsStartingScan] = useState(false)

  // Issues pagination and filter state
  const [issuesPage, setIssuesPage] = useState(1)
  const [issuesPageSize, setIssuesPageSize] = useState(20)
  const [isIssuesLoading, setIsIssuesLoading] = useState(false)
  const [severityFilter, setSeverityFilter] = useState('all') // 'all' | 'error' | 'warning'

  // Outlier Rules configuration panel
  const [isOutlierPanelOpen, setIsOutlierPanelOpen] = useState(false)
  const [enableSpeedRule, setEnableSpeedRule] = useState(true)
  const [maxSpeedLimit, setMaxSpeedLimit] = useState(150)
  const [enableLonAccRule, setEnableLonAccRule] = useState(true)
  const [maxLonAcc, setMaxLonAcc] = useState(8)
  const [minLonAcc, setMinLonAcc] = useState(-10)
  const [enableLatAccRule, setEnableLatAccRule] = useState(false)
  const [maxLatAcc, setMaxLatAcc] = useState(5)

  // State update helper synchronizing local state and notifying parent
  const updateQualityState = useCallback(
    (patch) => {
      if (patch.checkId !== undefined) setLocalCheckId(patch.checkId)
      if (patch.status !== undefined) setLocalStatus(patch.status)
      if (patch.progressPercent !== undefined) setLocalProgressPercent(patch.progressPercent)
      if (patch.processedRows !== undefined) setLocalProcessedRows(patch.processedRows)
      if (patch.totalRows !== undefined) setLocalTotalRows(patch.totalRows)
      if (patch.report !== undefined) setLocalReport(patch.report)
      if (patch.errorMessage !== undefined) setLocalErrorMessage(patch.errorMessage)
      if (patch.issues !== undefined) setLocalIssues(patch.issues)
      if (patch.issuesTotal !== undefined) setLocalIssuesTotal(patch.issuesTotal)

      onStateChange?.({
        checkId,
        status,
        progressPercent,
        processedRows,
        totalRows,
        report,
        issues,
        issuesTotal,
        errorMessage,
        ...patch,
      })
    },
    [
      checkId,
      status,
      progressPercent,
      processedRows,
      totalRows,
      report,
      issues,
      issuesTotal,
      errorMessage,
      onStateChange,
    ]
  )

  // Construct configured outlier rules array for backend submission
  const constructOutlierRules = useCallback(() => {
    const rules = []

    if (enableSpeedRule && maxSpeedLimit !== '' && !isNaN(Number(maxSpeedLimit))) {
      rules.push({
        field: 'speed',
        min_value: 0,
        max_value: Number(maxSpeedLimit),
        unit: 'km/h',
        basis: `Upper vehicle speed threshold of ${maxSpeedLimit} km/h`,
      })
    }

    if (enableLonAccRule) {
      const hasMin = minLonAcc !== '' && !isNaN(Number(minLonAcc))
      const hasMax = maxLonAcc !== '' && !isNaN(Number(maxLonAcc))
      if (hasMin || hasMax) {
        rules.push({
          field: 'lon_acc',
          min_value: hasMin ? Number(minLonAcc) : null,
          max_value: hasMax ? Number(maxLonAcc) : null,
          unit: 'm/s^2',
          basis: `Longitudinal acceleration bounds [${hasMin ? minLonAcc : '-inf'}, ${hasMax ? maxLonAcc : '+inf'}] m/s^2`,
        })
      }
    }

    if (enableLatAccRule && maxLatAcc !== '' && !isNaN(Number(maxLatAcc))) {
      rules.push({
        field: 'lat_acc',
        min_value: null,
        max_value: Number(maxLatAcc),
        unit: 'm/s^2',
        basis: `Lateral acceleration upper bound of ${maxLatAcc} m/s^2`,
      })
    }

    return rules
  }, [
    enableSpeedRule,
    maxSpeedLimit,
    enableLonAccRule,
    maxLonAcc,
    minLonAcc,
    enableLatAccRule,
    maxLatAcc,
  ])

  // Trigger quality inspection scan
  const handleStartScan = async () => {
    if (!datasetId) {
      updateQualityState({
        errorMessage: 'No dataset specified for quality scanning.',
        status: 'failed',
      })
      return
    }

    setIsStartingScan(true)

    try {
      const rules = constructOutlierRules()
      const result = await pipelineService.startQualityCheck(datasetId, rules)

      const newCheckId = result.check_id
      const initialProgress = result.progress_percent ?? 0
      const initialStatus = result.status || 'queued'

      setIssuesPage(1)
      updateQualityState({
        checkId: newCheckId,
        status: initialStatus,
        progressPercent: initialProgress,
        processedRows: 0,
        totalRows: 0,
        report: null,
        issues: [],
        issuesTotal: 0,
        errorMessage: null,
      })
    } catch (err) {
      const msg =
        err.response?.data?.detail || err.message || 'Failed to trigger quality inspection scan.'
      updateQualityState({
        status: 'failed',
        errorMessage: msg,
      })
    } finally {
      setIsStartingScan(false)
    }
  }

  // Load paginated issues from server
  const fetchIssues = useCallback(
    async (targetCheckId, page, pageSize) => {
      if (!datasetId || !targetCheckId) return
      setIsIssuesLoading(true)
      try {
        const issuesRes = await pipelineService.getQualityIssues(datasetId, targetCheckId, {
          page,
          pageSize,
        })
        const items = issuesRes.issues || []
        const total = issuesRes.total || 0

        setIssuesPage(issuesRes.page || page)
        updateQualityState({
          issues: items,
          issuesTotal: total,
        })
      } catch (err) {
        console.error('Failed to load quality issues:', err)
      } finally {
        setIsIssuesLoading(false)
      }
    },
    [datasetId, updateQualityState]
  )

  // Polling loop for queued and running scans (every 1.5s)
  useEffect(() => {
    if (!datasetId || !checkId) return
    if (status !== 'queued' && status !== 'running') return

    let isDisposed = false

    const pollStatus = async () => {
      try {
        const statusRes = await pipelineService.getQualityCheckStatus(datasetId, checkId)
        if (isDisposed) return

        const currentStatus = statusRes.status
        const currentProgress = statusRes.progress_percent ?? 0
        const currentProcessed = statusRes.processed_rows ?? 0
        const currentTotal = statusRes.total_rows ?? 0

        if (currentStatus === 'completed') {
          // Scan completed - fetch report & initial issues
          const [reportData, issuesData] = await Promise.all([
            pipelineService.getQualityReport(datasetId, checkId).catch(() => null),
            pipelineService
              .getQualityIssues(datasetId, checkId, { page: 1, pageSize: issuesPageSize })
              .catch(() => ({ issues: [], total: 0 })),
          ])

          if (isDisposed) return

          setIssuesPage(1)
          updateQualityState({
            status: 'completed',
            progressPercent: 100,
            processedRows: currentProcessed,
            totalRows: currentTotal,
            report: reportData,
            issues: issuesData?.issues || [],
            issuesTotal: issuesData?.total || 0,
            errorMessage: null,
          })
        } else if (currentStatus === 'failed') {
          const failMsg =
            statusRes.error_message || 'Quality inspection task encountered a fatal error.'
          updateQualityState({
            status: 'failed',
            errorMessage: failMsg,
          })
        } else {
          // Still queued or running
          updateQualityState({
            status: currentStatus,
            progressPercent: currentProgress,
            processedRows: currentProcessed,
            totalRows: currentTotal,
          })
        }
      } catch (err) {
        if (isDisposed) return
        const errMsg =
          err.response?.data?.detail || err.message || 'Failed to poll inspection status.'
        updateQualityState({
          status: 'failed',
          errorMessage: errMsg,
        })
      }
    }

    // Initial immediate poll, then poll every 1.5 seconds
    pollStatus()
    const timerId = setInterval(pollStatus, 1500)

    return () => {
      isDisposed = true
      clearInterval(timerId)
    }
  }, [datasetId, checkId, status, issuesPageSize, updateQualityState])

  // Pagination navigation handlers
  const totalPages = Math.max(1, Math.ceil(issuesTotal / issuesPageSize))

  const handlePrevPage = () => {
    if (issuesPage > 1 && !isIssuesLoading) {
      const prev = issuesPage - 1
      setIssuesPage(prev)
      fetchIssues(checkId, prev, issuesPageSize)
    }
  }

  const handleNextPage = () => {
    if (issuesPage < totalPages && !isIssuesLoading) {
      const next = issuesPage + 1
      setIssuesPage(next)
      fetchIssues(checkId, next, issuesPageSize)
    }
  }

  const handlePageSizeChange = (e) => {
    const newSize = Number(e.target.value)
    setIssuesPageSize(newSize)
    setIssuesPage(1)
    fetchIssues(checkId, 1, newSize)
  }

  // Filter issues in memory by severity
  const displayedIssues = useMemo(() => {
    if (severityFilter === 'error') {
      return issues.filter((item) => item.severity === 'error')
    }
    if (severityFilter === 'warning') {
      return issues.filter((item) => item.severity === 'warning')
    }
    return issues
  }, [issues, severityFilter])

  // Calculate score card metrics
  const scoreCardMetrics = useMemo(() => {
    if (!report) return null

    const total = report.total_rows || 0
    const valid = report.valid_rows || 0
    const invalid = report.invalid_rows || 0
    const errors = report.total_errors || 0
    const warnings = report.total_warnings || 0

    const validPercent = total > 0 ? ((valid / total) * 100).toFixed(1) : '100.0'
    const invalidPercent = total > 0 ? ((invalid / total) * 100).toFixed(1) : '0.0'

    return {
      total,
      valid,
      invalid,
      errors,
      warnings,
      validPercent,
      invalidPercent,
    }
  }, [report])

  // Error type breakdown list from backend report
  const errorTypeBreakdown = useMemo(() => {
    if (!report?.errors_by_type) return []
    return Object.entries(report.errors_by_type).map(([typeKey, stats]) => ({
      key: typeKey,
      label: formatIssueTypeName(typeKey),
      totalErrors: stats?.total_errors ?? 0,
      affectedRows: stats?.affected_rows ?? 0,
    }))
  }, [report])

  // Warning type breakdown list from backend report
  const warningTypeBreakdown = useMemo(() => {
    if (!report?.warnings_by_type) return []
    return Object.entries(report.warnings_by_type).map(([typeKey, stats]) => ({
      key: typeKey,
      label: formatIssueTypeName(typeKey),
      totalWarnings: stats?.total_warnings ?? 0,
      affectedRows: stats?.affected_rows ?? 0,
    }))
  }, [report])

  const isScanning = status === 'queued' || status === 'running'
  const isCompleted = status === 'completed'

  return (
    <div className="step2-quality-inspection" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Header & Scan Trigger Command Card */}
      <div className="admin-card">
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--blue">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="admin-card__title">Step 2: Data Quality Inspection</h3>
              <p className="admin-card__subtitle">
                Validate pNEUMA UAV trajectory records, inspect coordinates, speeds, timestamps, and outlier bounds.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Outlier Config Toggle */}
            <button
              type="button"
              className="btn-action"
              onClick={() => setIsOutlierPanelOpen((prev) => !prev)}
              disabled={isScanning}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: isOutlierPanelOpen ? '#eff6ff' : '#ffffff',
                color: isOutlierPanelOpen ? '#1d4ed8' : '#475569',
                border: '1px solid #cbd5e1',
                padding: '0.5rem 0.85rem',
              }}
            >
              <Sliders size={16} />
              <span>Outlier Rules</span>
              {isOutlierPanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {/* Run Quality Scan Button */}
            <button
              type="button"
              className={`btn-action ${isCompleted ? '' : 'btn-action--primary'}`}
              onClick={handleStartScan}
              disabled={isScanning || isStartingScan}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.15rem',
                ...(isCompleted
                  ? {
                      background: '#ffffff',
                      color: '#1e293b',
                      border: '1px solid #cbd5e1',
                    }
                  : {}),
              }}
            >
              {isScanning || isStartingScan ? (
                <>
                  <RefreshCw size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Scanning Records...</span>
                </>
              ) : isCompleted ? (
                <>
                  <RefreshCw size={16} />
                  <span>Re-run Quality Scan</span>
                </>
              ) : (
                <>
                  <Play size={16} />
                  <span>Run Quality Scan</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Outlier Rules Configuration Drawer */}
        {isOutlierPanelOpen && (
          <div
            style={{
              padding: '1.25rem 1.5rem',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              borderBottom: '1px solid #e2e8f0',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Sliders size={16} style={{ color: '#2563eb' }} />
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                Optional Outlier Detection Thresholds (Physical & Dynamics Rules)
              </h4>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1rem',
              }}
            >
              {/* Max Speed Threshold */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '1rem',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: 600,
                    fontSize: '0.825rem',
                    color: '#1e293b',
                    cursor: 'pointer',
                    marginBottom: '0.65rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enableSpeedRule}
                    onChange={(e) => setEnableSpeedRule(e.target.checked)}
                    disabled={isScanning}
                  />
                  <span>Max Vehicle Speed Limit</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    min="10"
                    max="400"
                    step="5"
                    className="admin-input"
                    value={maxSpeedLimit}
                    onChange={(e) => setMaxSpeedLimit(e.target.value)}
                    disabled={!enableSpeedRule || isScanning}
                    style={{ width: '100px' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>km/h</span>
                </div>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.74rem', color: '#64748b' }}>
                  Flags instantaneous speeds exceeding this bound as trajectory outliers.
                </p>
              </div>

              {/* Longitudinal Acceleration Bounds */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '1rem',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: 600,
                    fontSize: '0.825rem',
                    color: '#1e293b',
                    cursor: 'pointer',
                    marginBottom: '0.65rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enableLonAccRule}
                    onChange={(e) => setEnableLonAccRule(e.target.checked)}
                    disabled={isScanning}
                  />
                  <span>Longitudinal Acceleration Bounds</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Min:</span>
                    <input
                      type="number"
                      step="1"
                      className="admin-input"
                      value={minLonAcc}
                      onChange={(e) => setMinLonAcc(e.target.value)}
                      disabled={!enableLonAccRule || isScanning}
                      style={{ width: '75px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Max:</span>
                    <input
                      type="number"
                      step="1"
                      className="admin-input"
                      value={maxLonAcc}
                      onChange={(e) => setMaxLonAcc(e.target.value)}
                      disabled={!enableLonAccRule || isScanning}
                      style={{ width: '75px' }}
                    />
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>m/s²</span>
                </div>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.74rem', color: '#64748b' }}>
                  Normal urban vehicle dynamics range typically stays within [-10, 8] m/s².
                </p>
              </div>

              {/* Lateral Acceleration Limit */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '1rem',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: 600,
                    fontSize: '0.825rem',
                    color: '#1e293b',
                    cursor: 'pointer',
                    marginBottom: '0.65rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enableLatAccRule}
                    onChange={(e) => setEnableLatAccRule(e.target.checked)}
                    disabled={isScanning}
                  />
                  <span>Lateral Acceleration Bound</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    className="admin-input"
                    value={maxLatAcc}
                    onChange={(e) => setMaxLatAcc(e.target.value)}
                    disabled={!enableLatAccRule || isScanning}
                    style={{ width: '80px' }}
                  />
                  <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>m/s²</span>
                </div>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.74rem', color: '#64748b' }}>
                  Flags severe lateral turn anomalies or sensor noise beyond 5 m/s².
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Scan Status Banner when Idle */}
        {status === 'idle' && !errorMessage && (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '14px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.75rem',
                border: '1px solid #bfdbfe',
              }}
            >
              <Activity size={26} />
            </div>
            <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
              Dataset Ready for Quality Scan
            </h4>
            <p style={{ margin: '0 auto', maxWidth: '520px', fontSize: '0.85rem', color: '#475569' }}>
              Click <strong>"Run Quality Scan"</strong> to inspect every row for null coordinates, negative speeds,
              duplicate timestamps, and kinematic outliers before proceeding to normalization.
            </p>
          </div>
        )}

        {/* Scan Progress Monitor Bar (when Queued or Running) */}
        {isScanning && (
          <div
            style={{
              padding: '1.5rem',
              background: 'linear-gradient(180deg, #f0f7ff 0%, #ffffff 100%)',
              borderTop: '1px solid #bfdbfe',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#2563eb',
                    boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.2)',
                  }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>
                  {status === 'queued' ? 'Queuing Inspection Job...' : 'Scanning Dataset Telemetry Records...'}
                </span>
                <span className="badge badge--engineer" style={{ textTransform: 'capitalize' }}>
                  {status}
                </span>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1d4ed8' }}>
                {progressPercent}%
              </div>
            </div>

            {/* High-contrast Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '10px',
                background: '#e2e8f0',
                borderRadius: '9999px',
                overflow: 'hidden',
                marginBottom: '0.75rem',
              }}
            >
              <div
                style={{
                  width: `${Math.max(5, Math.min(100, progressPercent))}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #2563eb 0%, #4f46e5 50%, #10b981 100%)',
                  borderRadius: '9999px',
                  transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
                color: '#64748b',
              }}
            >
              <span>
                Processed{' '}
                <strong style={{ color: '#0f172a' }}>{processedRows.toLocaleString()}</strong>
                {totalRows > 0 ? ` of ${totalRows.toLocaleString()} total rows` : ' rows...'}
              </span>
              <span>Polling backend every 1.5s</span>
            </div>
          </div>
        )}

        {/* Error Banner when Failed */}
        {status === 'failed' && (
          <div
            style={{
              padding: '1.25rem 1.5rem',
              background: '#fef2f2',
              borderTop: '1px solid #fecaca',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertCircle size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.92rem', fontWeight: 700, color: '#991b1b' }}>
                Quality Inspection Scan Failed
              </h4>
              <p style={{ margin: 0, fontSize: '0.825rem', color: '#b91c1c' }}>
                {errorMessage || 'An error occurred during backend quality validation.'}
              </p>
            </div>
            <button
              type="button"
              className="btn-action btn-action--danger"
              onClick={handleStartScan}
              style={{ flexShrink: 0 }}
            >
              Retry Scan
            </button>
          </div>
        )}
      </div>

      {/* 2. Summary Score Card (when scan is Completed) */}
      {isCompleted && scoreCardMetrics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top 5 Stat Cards */}
          <div className="stats-grid" style={{ marginBottom: 0 }}>
            {/* 1. Total Rows Scanned */}
            <div className="stat-card stat-card--blue">
              <div className="stat-card__top">
                <div className="stat-card__info">
                  <div className="stat-card__eyebrow">Dataset Volume</div>
                  <h3>{scoreCardMetrics.total.toLocaleString()}</h3>
                  <p>Total Rows Scanned</p>
                  <div className="stat-card__subtext">
                    Structure: {formatStructureLabel(report?.detected_structure)}
                  </div>
                </div>
                <div className="stat-card__icon stat-card__icon--blue">
                  <Layers size={22} />
                </div>
              </div>
              <div className="stat-card__footer">
                <span className="badge badge--engineer">100% Evaluated</span>
              </div>
            </div>

            {/* 2. Valid Records */}
            <div className="stat-card stat-card--green">
              <div className="stat-card__top">
                <div className="stat-card__info">
                  <div className="stat-card__eyebrow">Conformance Rate</div>
                  <h3 style={{ color: '#059669' }}>{scoreCardMetrics.valid.toLocaleString()}</h3>
                  <p>Valid Trajectory Rows</p>
                  <div className="stat-card__subtext">
                    {scoreCardMetrics.validPercent}% Schema Pass Rate
                  </div>
                </div>
                <div className="stat-card__icon stat-card__icon--green">
                  <CheckCircle2 size={22} />
                </div>
              </div>
              <div className="stat-card__footer">
                <span className="badge badge--active">
                  <Check size={12} /> {scoreCardMetrics.validPercent}% Conformance
                </span>
              </div>
            </div>

            {/* 3. Invalid Records */}
            <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="stat-card__top">
                <div className="stat-card__info">
                  <div className="stat-card__eyebrow">Defect Ratio</div>
                  <h3 style={{ color: scoreCardMetrics.invalid > 0 ? '#dc2626' : '#059669' }}>
                    {scoreCardMetrics.invalid.toLocaleString()}
                  </h3>
                  <p>Invalid Rows</p>
                  <div className="stat-card__subtext">
                    {scoreCardMetrics.invalidPercent}% Row Defect Rate
                  </div>
                </div>
                <div
                  className="stat-card__icon"
                  style={{
                    background: scoreCardMetrics.invalid > 0 ? '#fef2f2' : '#ecfdf5',
                    color: scoreCardMetrics.invalid > 0 ? '#dc2626' : '#059669',
                    border: `1px solid ${scoreCardMetrics.invalid > 0 ? '#fecaca' : '#a7f3d0'}`,
                  }}
                >
                  <XCircle size={22} />
                </div>
              </div>
              <div className="stat-card__footer">
                <span className={`badge ${scoreCardMetrics.invalid > 0 ? 'badge--admin' : 'badge--active'}`}>
                  {scoreCardMetrics.invalid === 0 ? 'Zero Invalid Rows' : `${scoreCardMetrics.invalidPercent}% Rejected`}
                </span>
              </div>
            </div>

            {/* 4. Total Errors */}
            <div className="stat-card" style={{ borderLeft: '4px solid #dc2626' }}>
              <div className="stat-card__top">
                <div className="stat-card__info">
                  <div className="stat-card__eyebrow">Fatal Violations</div>
                  <h3 style={{ color: scoreCardMetrics.errors > 0 ? '#dc2626' : '#059669' }}>
                    {scoreCardMetrics.errors.toLocaleString()}
                  </h3>
                  <p>Total Errors</p>
                  <div className="stat-card__subtext">
                    {scoreCardMetrics.errors > 0 ? 'Blocking normalization' : 'Zero fatal errors'}
                  </div>
                </div>
                <div
                  className="stat-card__icon"
                  style={{
                    background: scoreCardMetrics.errors > 0 ? '#fef2f2' : '#ecfdf5',
                    color: scoreCardMetrics.errors > 0 ? '#dc2626' : '#059669',
                    border: `1px solid ${scoreCardMetrics.errors > 0 ? '#fecaca' : '#a7f3d0'}`,
                  }}
                >
                  <AlertCircle size={22} />
                </div>
              </div>
              <div className="stat-card__footer">
                <span className={`badge ${scoreCardMetrics.errors > 0 ? 'badge--admin' : 'badge--active'}`}>
                  {scoreCardMetrics.errors > 0 ? 'Action Required' : 'Clean Schema'}
                </span>
              </div>
            </div>

            {/* 5. Total Warnings / Outliers */}
            <div className="stat-card stat-card--amber">
              <div className="stat-card__top">
                <div className="stat-card__info">
                  <div className="stat-card__eyebrow">Informational</div>
                  <h3 style={{ color: '#d97706' }}>{scoreCardMetrics.warnings.toLocaleString()}</h3>
                  <p>Outlier Warnings</p>
                  <div className="stat-card__subtext">Non-blocking kinematic alerts</div>
                </div>
                <div className="stat-card__icon stat-card__icon--amber">
                  <AlertTriangle size={22} />
                </div>
              </div>
              <div className="stat-card__footer">
                <span className="badge badge--pending">
                  {scoreCardMetrics.warnings} Outliers
                </span>
              </div>
            </div>
          </div>

          {/* Issue Breakdown Badges & Outlier Rules Evaluation Panel */}
          <div className="admin-card">
            <div className="admin-card__header">
              <div className="admin-card__header-left">
                <div className="admin-card__icon-box admin-card__icon-box--purple">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="admin-card__title">Anomaly Distribution & Outlier Breakdown</h3>
                  <p className="admin-card__subtitle">
                    Disaggregated view of fatal error types, missing coordinates, and kinematic threshold violations.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.85rem',
                  marginBottom: '1.25rem',
                }}
              >
                {/* Dynamic Error Type Cards from Backend Report */}
                {errorTypeBreakdown.length > 0 ? (
                  errorTypeBreakdown.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        padding: '0.85rem 1rem',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>{item.label}</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: item.totalErrors > 0 ? '#dc2626' : '#059669' }}>
                          {item.totalErrors.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          {item.affectedRows.toLocaleString()} rows affected
                        </div>
                      </div>
                      <span className={`badge ${item.totalErrors > 0 ? 'badge--admin' : 'badge--active'}`}>
                        {item.key}
                      </span>
                    </div>
                  ))
                ) : (
                  <>
                    <div
                      style={{
                        padding: '0.85rem 1rem',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>Missing Values</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>0</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>0 rows affected</div>
                      </div>
                      <span className="badge badge--active">missing_value</span>
                    </div>

                    <div
                      style={{
                        padding: '0.85rem 1rem',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>Invalid Coordinates</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>0</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>GPS in bounds</div>
                      </div>
                      <span className="badge badge--active">GPS Valid</span>
                    </div>
                  </>
                )}

                {/* Dynamic Warning Type Cards from Backend Report */}
                {warningTypeBreakdown.length > 0 ? (
                  warningTypeBreakdown.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        padding: '0.85rem 1rem',
                        background: '#fffbeb',
                        borderRadius: '10px',
                        border: '1px solid #fde68a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.74rem', color: '#92400e', fontWeight: 600 }}>{item.label}</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#d97706' }}>
                          {item.totalWarnings.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#b45309' }}>
                          {item.affectedRows.toLocaleString()} rows flagged
                        </div>
                      </div>
                      <span className="badge badge--pending">{item.key}</span>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      padding: '0.85rem 1rem',
                      background: '#f8fafc',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>Outlier Warnings</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>
                        {report?.total_warnings || 0}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Within physical bounds</div>
                    </div>
                    <span className="badge badge--active">No Outliers</span>
                  </div>
                )}
              </div>

              {/* Missing Required Columns Warning (if any) */}
              {report?.missing_required_columns && report.missing_required_columns.length > 0 && (
                <div
                  style={{
                    padding: '0.85rem 1.15rem',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    color: '#92400e',
                    fontSize: '0.825rem',
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Missing Standard pNEUMA UAV Columns:</strong>{' '}
                    {report.missing_required_columns.join(', ')}. Please return to Step 1: Column Mapping to assign these headers.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Paginated Issues Table Card */}
          <div className="admin-card">
            <div className="admin-card__header">
              <div className="admin-card__header-left">
                <div className="admin-card__icon-box admin-card__icon-box--amber">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="admin-card__title">
                    Quality Issues Inspector ({issuesTotal.toLocaleString()} Total)
                  </h3>
                  <p className="admin-card__subtitle">
                    Row-by-row diagnostics showing offending values, schema constraints, and severity flags.
                  </p>
                </div>
              </div>

              {/* Severity Filter Pills & Page Size */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <button
                    type="button"
                    onClick={() => setSeverityFilter('all')}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: severityFilter === 'all' ? '#2563eb' : '#cbd5e1',
                      background: severityFilter === 'all' ? '#eff6ff' : '#ffffff',
                      color: severityFilter === 'all' ? '#1d4ed8' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    All Issues ({issuesTotal})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeverityFilter('error')}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: severityFilter === 'error' ? '#dc2626' : '#cbd5e1',
                      background: severityFilter === 'error' ? '#fef2f2' : '#ffffff',
                      color: severityFilter === 'error' ? '#dc2626' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    Errors ({scoreCardMetrics.errors})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeverityFilter('warning')}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: severityFilter === 'warning' ? '#d97706' : '#cbd5e1',
                      background: severityFilter === 'warning' ? '#fffbeb' : '#ffffff',
                      color: severityFilter === 'warning' ? '#d97706' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    Warnings ({scoreCardMetrics.warnings})
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#64748b' }}>
                  <span>Page Size:</span>
                  <select
                    className="admin-select"
                    value={issuesPageSize}
                    onChange={handlePageSizeChange}
                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Table Content */}
            <div style={{ overflowX: 'auto', minHeight: '180px' }}>
              {isIssuesLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading quality issues page...</p>
                </div>
              ) : displayedIssues.length === 0 ? (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
                  <CheckCircle2 size={38} style={{ color: '#10b981', margin: '0 auto 0.65rem auto' }} />
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                    {issuesTotal === 0 ? 'Zero Quality Issues Detected' : 'No issues match the selected filter'}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: '#64748b' }}>
                    {issuesTotal === 0
                      ? 'Every trajectory point conforms to schema bounds and data constraints.'
                      : 'Switch filter back to "All Issues" to review full diagnostics.'}
                  </p>
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: '85px' }}>Row #</th>
                      <th style={{ width: '105px' }}>Severity</th>
                      <th style={{ width: '130px' }}>Column</th>
                      <th style={{ width: '160px' }}>Issue Type</th>
                      <th style={{ width: '150px' }}>Observed Value</th>
                      <th>Description / Constraint Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedIssues.map((issue, idx) => {
                      const isError = issue.severity === 'error'
                      return (
                        <tr key={`${issue.row_number}-${issue.column_name}-${idx}`}>
                          <td style={{ fontWeight: 600, color: '#475569', fontFamily: 'monospace' }}>
                            {issue.row_number != null ? `#${issue.row_number}` : '—'}
                          </td>
                          <td>
                            <span className={`badge ${isError ? 'badge--admin' : 'badge--pending'}`}>
                              {isError ? <AlertCircle size={12} /> : <AlertTriangle size={12} />}
                              <span style={{ textTransform: 'capitalize' }}>{issue.severity || 'error'}</span>
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, color: '#0f172a' }}>
                            {issue.column_name || <span style={{ color: '#94a3b8' }}>Dataset</span>}
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.55rem',
                                background: '#f1f5f9',
                                color: '#334155',
                                borderRadius: '6px',
                                fontSize: '0.73rem',
                                fontWeight: 600,
                              }}
                            >
                              {formatIssueTypeName(issue.issue_type)}
                            </span>
                          </td>
                          <td>
                            {issue.observed_value != null && issue.observed_value !== '' ? (
                              <code
                                style={{
                                  display: 'inline-block',
                                  padding: '0.2rem 0.45rem',
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '5px',
                                  color: '#0f172a',
                                  fontSize: '0.75rem',
                                }}
                              >
                                {String(issue.observed_value)}
                              </code>
                            ) : (
                              <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.75rem' }}>
                                null / empty
                              </span>
                            )}
                          </td>
                          <td style={{ color: '#334155', fontSize: '0.825rem' }}>
                            {issue.message || 'Validation constraint violation.'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {issuesTotal > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1.35rem',
                  borderTop: '1px solid #f1f5f9',
                  background: '#f8fafc',
                  fontSize: '0.78rem',
                  color: '#64748b',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  Showing{' '}
                  <strong style={{ color: '#0f172a' }}>
                    {Math.min((issuesPage - 1) * issuesPageSize + 1, issuesTotal)}
                  </strong>{' '}
                  to{' '}
                  <strong style={{ color: '#0f172a' }}>
                    {Math.min(issuesPage * issuesPageSize, issuesTotal)}
                  </strong>{' '}
                  of <strong style={{ color: '#0f172a' }}>{issuesTotal}</strong> issues
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    disabled={issuesPage <= 1 || isIssuesLoading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: issuesPage <= 1 ? '#f1f5f9' : '#ffffff',
                      color: issuesPage <= 1 ? '#94a3b8' : '#1e293b',
                      cursor: issuesPage <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                    }}
                  >
                    <ChevronLeft size={14} />
                    <span>Previous</span>
                  </button>

                  <span style={{ fontWeight: 600, color: '#0f172a' }}>
                    Page {issuesPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={issuesPage >= totalPages || isIssuesLoading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: issuesPage >= totalPages ? '#f1f5f9' : '#ffffff',
                      color: issuesPage >= totalPages ? '#94a3b8' : '#1e293b',
                      cursor: issuesPage >= totalPages ? 'not-allowed' : 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                    }}
                  >
                    <span>Next</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Bottom Sequential Navigation Buttons */}
      <div
        className="admin-card"
        style={{
          padding: '1.25rem 1.5rem',
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
          <span>Back to Step 1: Column Mapping</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {!isCompleted && (
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Run and complete quality scan to unlock Step 3
            </span>
          )}

          <button
            type="button"
            className="btn-action btn-action--primary"
            onClick={onNext}
            disabled={!isCompleted || isScanning}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1.35rem',
              fontWeight: 700,
              fontSize: '0.875rem',
              opacity: !isCompleted || isScanning ? 0.5 : 1,
              cursor: !isCompleted || isScanning ? 'not-allowed' : 'pointer',
            }}
          >
            <span>Proceed to Step 3: Normalization & Preview</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
