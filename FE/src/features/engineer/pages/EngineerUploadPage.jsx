import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import {
  Upload,
  GitBranch,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Eye,
  X,
  Trash2,
  FileText,
  Check,
  Workflow,
} from 'lucide-react'
import { datasetService } from '../../../services/datasetService'
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_SIZE_BYTES,
  formatBytes,
  resolveEffectiveVersionTag,
} from '../utils/engineerHelpers'

export default function EngineerUploadPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef(null)

  const {
    datasets = [],
    versionLineageMap,
    registerVersionLineage,
    registerRecordCount,
    prependUploadedDataset,
    openPreviewForDataset,
  } = useOutletContext()

  // Distinct datasets deduplicated by dataset_id so every dropdown option is unique and selectable
  const uniqueDatasets = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const d of datasets) {
      if (d?.dataset_id && !seen.has(d.dataset_id)) {
        seen.add(d.dataset_id)
        result.push(d)
      }
    }
    return result
  }, [datasets])

  const [uploadMode, setUploadMode] = useState('new')
  const [parentDatasetId, setParentDatasetId] = useState('')
  const [targetVersionTag, setTargetVersionTag] = useState('v1.1-cleaned')
  const [changeSummary, setChangeSummary] = useState('')
  const hasInitializedIterationRef = useRef(false)

  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileInspection, setFileInspection] = useState(null)

  const [uploadForm, setUploadForm] = useState({
    name: '',
    source: 'pNEUMA Drone Swarm - Athens',
    location_name: 'Athens Central Business District',
    capture_date: new Date().toISOString().slice(0, 10),
    description: '',
  })
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState(null)

  // Apply URL query or router state when arriving from "New Version" action
  useEffect(() => {
    const modeParam = searchParams.get('mode')
    const parentIdParam = searchParams.get('parentId')
    const baseFromState = location.state?.baseDataset

    if (modeParam === 'iteration' || baseFromState || parentIdParam) {
      setUploadMode('iteration')
      if (!hasInitializedIterationRef.current && uniqueDatasets.length > 0) {
        const baseDataset =
          baseFromState ||
          uniqueDatasets.find((d) => d.dataset_id === parentIdParam) ||
          uniqueDatasets[0]

        if (baseDataset) {
          setParentDatasetId(baseDataset.dataset_id)
          const nextTag =
            baseDataset.approval_status === 'REJECTED' ? 'v1.1-cleaned' : 'v2.0-aligned'
          setTargetVersionTag(nextTag)
          setChangeSummary(
            baseDataset.approval_status === 'REJECTED'
              ? 'Removed malformed trajectory records and re-validated pNEUMA schema.'
              : 'Updated temporal alignment and trajectory smoothing.'
          )
          const cleanBaseName = baseDataset.name.replace(/\s*\(v[\d.]+[^)]*\)\s*$/i, '')
          setUploadForm({
            name: `${cleanBaseName} (${nextTag})`,
            source: baseDataset.source || 'pNEUMA Drone Swarm - Athens',
            location_name: baseDataset.location_name || 'Athens Central Business District',
            capture_date: baseDataset.capture_date || new Date().toISOString().slice(0, 10),
            description: baseDataset.description || '',
          })
          hasInitializedIterationRef.current = true
        }
      }
    }
  }, [searchParams, location.state, uniqueDatasets])

  const handleParentDatasetSelect = (datasetId) => {
    setParentDatasetId(datasetId)
    const found = uniqueDatasets.find((d) => d.dataset_id === datasetId)
    if (found) {
      const cleanBaseName = found.name.replace(/\s*\(v[\d.]+[^)]*\)\s*$/i, '')
      setUploadForm((prev) => ({
        ...prev,
        name: `${cleanBaseName} (${targetVersionTag})`,
        source: found.source || prev.source || 'pNEUMA Drone Swarm - Athens',
        location_name: found.location_name || prev.location_name || 'Athens Central Business District',
        capture_date: found.capture_date || prev.capture_date || new Date().toISOString().slice(0, 10),
        description: found.description || prev.description || '',
      }))
    }
  }

  const validateAndInspectFile = (file, { updateFormName = true } = {}) => {
    if (!file) return
    setUploadError(null)
    setUploadSuccess(null)

    const dotIndex = file.name.lastIndexOf('.')
    const ext = dotIndex !== -1 ? file.name.slice(dotIndex).toLowerCase() : ''

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setSelectedFile(null)
      setFileInspection(null)
      setUploadError(
        `Unsupported file extension "${ext || 'unknown'}". Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}`
      )
      return
    }

    if (file.size === 0) {
      setSelectedFile(null)
      setFileInspection(null)
      setUploadError('The selected file is empty (0 bytes). Please choose a valid dataset file.')
      return
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setSelectedFile(null)
      setFileInspection(null)
      setUploadError(
        `File size (${formatBytes(file.size)}) exceeds the maximum limit of ${formatBytes(
          MAX_UPLOAD_SIZE_BYTES
        )}.`
      )
      return
    }

    setSelectedFile(file)

    if (updateFormName && uploadMode === 'new' && !uploadForm.name) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ')
      setUploadForm((prev) => ({
        ...prev,
        name: baseName.length >= 3 ? baseName : `Dataset ${baseName}`,
      }))
    }

    if (ext === '.csv' && file.size <= 5 * 1024 * 1024) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = String(ev.target?.result || '')
        const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
        const firstLine = lines[0] || ''
        const isPneumaHeader =
          firstLine.includes('track_id') &&
          firstLine.includes('traveled_d') &&
          firstLine.includes(';')
        const estimatedRows = Math.max(0, lines.length - 1)
        setFileInspection({
          extension: ext.slice(1).toUpperCase(),
          estimatedRows,
          delimiter: firstLine.includes(';') ? 'Semicolon (;)' : 'Comma (,)',
          schemaHint: isPneumaHeader
            ? 'pNEUMA UAV Trajectory Schema Detected'
            : 'Standard Tabular CSV',
          isPneuma: isPneumaHeader,
        })
      }
      reader.readAsText(file)
    } else {
      setFileInspection({
        extension: ext.slice(1).toUpperCase(),
        estimatedRows: null,
        delimiter: null,
        schemaHint: `${ext.slice(1).toUpperCase()} Binary / Structured Dataset`,
        isPneuma: false,
      })
    }
  }

  const handleSampleDatasetGenerated = (sampleFile, summary) => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    setUploadError(null)
    setUploadSuccess(null)
    validateAndInspectFile(sampleFile, { updateFormName: false })

    const typeSummary =
      summary?.types?.length === 6
        ? 'All 6 Vehicle Types'
        : summary?.types?.join(', ') || 'pNEUMA Corridor'

    const timeTag =
      summary?.timestampSuffix ||
      new Date().toTimeString().slice(0, 8).replace(/:/g, '')

    if (uploadMode === 'iteration' && parentDatasetId) {
      const parent = uniqueDatasets.find((d) => d.dataset_id === parentDatasetId)
      const cleanBaseName = parent
        ? parent.name.replace(/\s*\(v[\d.]+[^)]*\)\s*$/i, '')
        : `pNEUMA Athens Corridor`
      setUploadForm((prev) => ({
        ...prev,
        name: `${cleanBaseName} (${targetVersionTag})`,
      }))
    } else {
      setUploadForm({
        name: `pNEUMA Athens (${summary?.count || 5} veh - ${typeSummary}) #${timeTag}`,
        source: 'pNEUMA Drone Swarm - EPFL Open Traffic',
        location_name: 'Athens Central Business District (Syntagma / Panepistimiou)',
        capture_date: '2018-10-24',
        description: `Genuine pNEUMA UAV trajectory recording sampled from Athens drone swarm (EPFL Open Traffic). Contains ${summary?.count || 5} vehicles (${typeSummary}) with 25Hz GPS coordinates, instantaneous velocity, and kinematics.`,
      })
    }
  }

  // Auto-load sample file if passed via navigation state from EngineerOverviewPage
  useEffect(() => {
    if (location.state?.sampleFile) {
      handleSampleDatasetGenerated(location.state.sampleFile, location.state.sampleSummary)
    }
  }, [location.state])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    validateAndInspectFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDraggingFile) setIsDraggingFile(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFile(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFile(false)
    const droppedFile = e.dataTransfer?.files?.[0]
    if (droppedFile) {
      validateAndInspectFile(droppedFile)
    }
  }

  const handleClearSelectedFile = (e) => {
    e.stopPropagation()
    setSelectedFile(null)
    setFileInspection(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFile) {
      setUploadError(
        'Please select or drag-and-drop a dataset file (.csv, .parquet, .xlsx, .xls, .json).'
      )
      return
    }
    if (uploadMode === 'iteration' && !parentDatasetId) {
      setUploadError('Please select a base dataset to create a new version iteration.')
      return
    }
    if (uploadForm.name.trim().length < 3) {
      setUploadError('Dataset name must be at least 3 characters long.')
      return
    }
    if (!uploadForm.source.trim() || !uploadForm.location_name.trim()) {
      setUploadError('Please fill in both Source and Location fields.')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError(null)
    setUploadSuccess(null)

    const enrichedDescription =
      uploadMode === 'iteration' && changeSummary.trim()
        ? `[Version ${targetVersionTag} Changelog: ${changeSummary.trim()}] ${
            uploadForm.description || ''
          }`.trim()
        : uploadForm.description

    try {
      const uploaded = await datasetService.uploadDataset(
        {
          file: selectedFile,
          ...uploadForm,
          description: enrichedDescription,
        },
        (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setUploadProgress(pct)
          }
        }
      )

      if (uploadMode === 'iteration') {
        const parentItem = uniqueDatasets.find((d) => d.dataset_id === parentDatasetId)
        registerVersionLineage(uploaded.dataset_id, {
          customVersionTag: targetVersionTag,
          parentDatasetId,
          parentDatasetName: parentItem?.name || 'Base Dataset',
          parentCode: parentItem?.code || '',
          changeSummary: changeSummary.trim(),
        })
      }

      if (fileInspection?.estimatedRows != null) {
        registerRecordCount(uploaded.dataset_id, fileInspection.estimatedRows)
      }

      setUploadSuccess(uploaded)
      prependUploadedDataset(uploaded)
      setSelectedFile(null)
      setFileInspection(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setUploadError(
        err.response?.data?.detail ||
          'Dataset upload failed. Please check the file format or dataset name uniqueness.'
      )
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <section className="adm-panel">
      <div className="adm-panel__header">
        <div className="adm-panel__title-group">
          <div className="adm-panel__icon adm-tone--blue">
            {uploadMode === 'iteration' ? <GitBranch size={18} /> : <Upload size={18} />}
          </div>
          <div>
            <h2 className="adm-panel__title">
              {uploadMode === 'iteration'
                ? 'Upload Dataset Version Iteration'
                : 'Upload Traffic Trajectory Dataset'}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="adm-filter-pills" role="group" aria-label="Upload mode">
            <button
              type="button"
              className={`adm-filter-pill ${uploadMode === 'new' ? 'active' : ''}`}
              onClick={() => {
                setUploadMode('new')
                setUploadError(null)
              }}
            >
              New Dataset (v1.0)
            </button>
            <button
              type="button"
              className={`adm-filter-pill ${uploadMode === 'iteration' ? 'active' : ''}`}
              onClick={() => {
                setUploadMode('iteration')
                setUploadError(null)
                if (datasets.length > 0 && !parentDatasetId) {
                  handleParentDatasetSelect(datasets[0].dataset_id)
                }
              }}
            >
              Version Iteration
            </button>
          </div>
        </div>
      </div>

      <div className="adm-panel__body">
      {uploadError && (
        <div className="eng-alert eng-alert--error">
          <div className="eng-alert__content">
            <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{uploadError}</span>
          </div>
        </div>
      )}

      {uploadSuccess && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1.5px solid #6ee7b7',
            borderRadius: '16px',
            overflow: 'hidden',
            marginBottom: '1.85rem',
            boxShadow: '0 10px 26px -6px rgba(16, 185, 129, 0.2)',
          }}
        >
          {/* Top Row: Soft Mint-Emerald Header + Action CTA */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              padding: '1.15rem 1.5rem',
              background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
              borderBottom: '1px solid #6ee7b7',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.95rem' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: '#10b981',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.28)',
                  flexShrink: 0,
                }}
              >
                <CheckCircle2 size={25} />
              </div>
              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: '#047857',
                    background: '#ffffff',
                    border: '1px solid #6ee7b7',
                    padding: '0.14rem 0.55rem',
                    borderRadius: '999px',
                    marginBottom: '0.28rem',
                  }}
                >
                  <Sparkles size={11} color="#10b981" />
                  <span>Upload Successful</span>
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: '1.15rem',
                    color: '#064e3b',
                    lineHeight: 1.25,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {uploadSuccess.name}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/engineer/pipeline-studio?datasetId=${encodeURIComponent(
                      uploadSuccess.dataset_id
                    )}`
                  )
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.58rem 1.15rem',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  border: '1.5px solid #047857',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(4, 120, 87, 0.28)',
                }}
              >
                <Workflow size={16} color="#ffffff" />
                <span>Proceed to Pipeline Studio</span>
              </button>
              <button
                type="button"
                onClick={() => openPreviewForDataset(uploadSuccess.dataset_id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.58rem 1.1rem',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#065f46',
                  background: '#ffffff',
                  border: '1.5px solid #34d399',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 3px 10px rgba(6, 95, 70, 0.12)',
                }}
              >
                <Eye size={16} color="#059669" />
                <span>Inspect Schema & Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setUploadSuccess(null)}
                title="Dismiss notification"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  border: '1px solid #6ee7b7',
                  background: 'rgba(255, 255, 255, 0.85)',
                  color: '#047857',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Bottom Row: Cleanly Separated Minimalist Metadata Tiles */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '0.85rem',
              padding: '1.1rem 1.5rem',
              background: '#f0fdf4',
            }}
          >
            <div className="eng-kv-item" style={{ background: '#ffffff' }}>
              <span className="eng-kv-item__label">Version Tag</span>
              <span className="eng-kv-item__value">
                {resolveEffectiveVersionTag(uploadSuccess, versionLineageMap)}
              </span>
            </div>

            <div className="eng-kv-item" style={{ background: '#ffffff' }}>
              <span className="eng-kv-item__label">Dataset Code</span>
              <span className="eng-kv-item__value eng-break-all" style={{ fontFamily: 'monospace', fontSize: '0.84rem' }}>
                {uploadSuccess.code}
              </span>
            </div>

            <div className="eng-kv-item" style={{ background: '#ffffff' }}>
              <span className="eng-kv-item__label">Format</span>
              <span className="eng-kv-item__value">{uploadSuccess.file_format}</span>
            </div>

            <div className="eng-kv-item" style={{ background: '#ffffff' }}>
              <span className="eng-kv-item__label">File Size</span>
              <span className="eng-kv-item__value">
                {formatBytes(uploadSuccess.file_size_bytes)}
              </span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleUploadSubmit}>
        {/* Version Iteration Selector Box */}
        {uploadMode === 'iteration' && (
          <div
            style={{
              background: '#faf5ff',
              border: '1px solid #e9d5ff',
              borderRadius: '14px',
              padding: '1.2rem 1.35rem',
              marginBottom: '1.35rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#6b21a8',
                fontWeight: 700,
                fontSize: '0.88rem',
                marginBottom: '0.85rem',
              }}
            >
              <GitBranch size={16} />
              <span>Version Lineage Configuration</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1rem',
              }}
            >
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Base Dataset to Upgrade *</label>
                <select
                  className="admin-select"
                  required
                  value={parentDatasetId}
                  onChange={(e) => handleParentDatasetSelect(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">-- Select existing dataset --</option>
                  {uniqueDatasets.map((d) => (
                    <option key={d.dataset_id} value={d.dataset_id}>
                      {d.name} [{d.approval_status}] ({resolveEffectiveVersionTag(d, versionLineageMap)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Target Version Tag *</label>
                <select
                  className="admin-select"
                  value={targetVersionTag}
                  onChange={(e) => {
                    const newTag = e.target.value
                    setTargetVersionTag(newTag)
                    const parent = uniqueDatasets.find((d) => d.dataset_id === parentDatasetId)
                    if (parent) {
                      const cleanBaseName = parent.name.replace(/\s*\(v[\d.]+[^)]*\)\s*$/i, '')
                      setUploadForm((prev) => ({
                        ...prev,
                        name: `${cleanBaseName} (${newTag})`,
                      }))
                    }
                  }}
                  style={{ width: '100%' }}
                >
                  <option value="v1.1-cleaned">v1.1-cleaned (Outlier & Null Removal)</option>
                  <option value="v1.2-filtered">
                    v1.2-filtered (Physical Constraints Filtered)
                  </option>
                  <option value="v2.0-aligned">v2.0-aligned (Temporal & ROI Aligned)</option>
                  <option value="v2.1-enriched">v2.1-enriched (Feature Enriched)</option>
                </select>
              </div>

              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Cleaning / Iteration Changelog</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="e.g. Dropped null coordinates & smoothed speed outliers"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Dataset File */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.65rem',
            }}
          >
            <span className="adm-label" style={{ marginBottom: 0 }}>
              Dataset File *
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              CSV, Parquet, Excel, JSON (max {formatBytes(MAX_UPLOAD_SIZE_BYTES)})
            </span>
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-label="Select or drop a dataset file to upload"
            className={`eng-dropzone ${isDraggingFile || selectedFile ? 'eng-dropzone--active' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{ position: 'relative' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.xls,.xlsx,.parquet"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {selectedFile && (
              <button
                type="button"
                className="adm-btn adm-btn--ghost adm-btn--sm"
                onClick={handleClearSelectedFile}
                aria-label="Remove selected file"
                title="Remove selected file"
                style={{
                  position: 'absolute',
                  top: '0.75rem',
                  right: '0.75rem',
                  color: '#dc2626',
                }}
              >
                <Trash2 size={13} />
                <span>Clear</span>
              </button>
            )}

            <div
              style={{
                width: '44px',
                height: '44px',
                margin: '0 auto 0.65rem',
                borderRadius: '12px',
                background: selectedFile ? '#dbeafe' : '#e2e8f0',
                color: selectedFile ? '#1d4ed8' : '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={21} />
            </div>

            {selectedFile ? (
              <div style={{ maxWidth: '100%' }}>
                <div
                  className="eng-truncate"
                  title={selectedFile.name}
                  style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e3a8a', padding: '0 2rem' }}
                >
                  {selectedFile.name}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#2563eb', marginTop: '0.2rem' }}>
                  {formatBytes(selectedFile.size)} / {formatBytes(MAX_UPLOAD_SIZE_BYTES)}
                </div>

                {fileInspection && (
                  <div
                    style={{
                      display: 'inline-flex',
                      flexWrap: 'wrap',
                      gap: '0.45rem',
                      justifyContent: 'center',
                      marginTop: '0.65rem',
                    }}
                  >
                    <span className="adm-badge adm-badge--emerald">
                      <Check size={12} />
                      {fileInspection.schemaHint}
                    </span>
                    {fileInspection.estimatedRows != null && (
                      <span className="adm-badge adm-badge--blue">
                        {fileInspection.isPneuma
                          ? `~${fileInspection.estimatedRows.toLocaleString()} vehicle tracks`
                          : `~${fileInspection.estimatedRows.toLocaleString()} trajectory rows`}
                      </span>
                    )}
                    {fileInspection.delimiter && (
                      <span className="adm-badge adm-badge--slate">
                        Delimiter: {fileInspection.delimiter}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                  {isDraggingFile
                    ? 'Drop your dataset file here...'
                    : 'Drag & drop a dataset file here, or click to browse'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Supported: {ALLOWED_EXTENSIONS.join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dataset Metadata */}
        <div
          style={{
            paddingTop: '1.1rem',
            borderTop: '1px solid #f1f5f9',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1rem',
            }}
          >
            <div className="adm-field" style={{ marginBottom: 0 }}>
              <label htmlFor="upload-dataset-name" className="adm-label">
                Dataset Name (3–128 chars) *
              </label>
              <input
                id="upload-dataset-name"
                type="text"
                className="adm-input"
                required
                minLength={3}
                maxLength={128}
                placeholder="e.g. pNEUMA Athens Morning Peak v1"
                value={uploadForm.name}
                onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
              />
            </div>

            <div className="adm-field" style={{ marginBottom: 0 }}>
              <label htmlFor="upload-dataset-source" className="adm-label">
                Collection Source *
              </label>
              <input
                id="upload-dataset-source"
                type="text"
                className="adm-input"
                required
                maxLength={255}
                placeholder="e.g. pNEUMA Drone Swarm - EPFL"
                value={uploadForm.source}
                onChange={(e) => setUploadForm({ ...uploadForm, source: e.target.value })}
              />
            </div>

            <div className="adm-field" style={{ marginBottom: 0 }}>
              <label htmlFor="upload-dataset-location" className="adm-label">
                Traffic Corridor / Location *
              </label>
              <input
                id="upload-dataset-location"
                type="text"
                className="adm-input"
                required
                maxLength={255}
                placeholder="e.g. Athens Central Business District"
                value={uploadForm.location_name}
                onChange={(e) => setUploadForm({ ...uploadForm, location_name: e.target.value })}
              />
            </div>

            <div className="adm-field" style={{ marginBottom: 0 }}>
              <label htmlFor="upload-capture-date" className="adm-label">
                UAV Capture Date
              </label>
              <input
                id="upload-capture-date"
                type="date"
                className="adm-input"
                value={uploadForm.capture_date}
                onChange={(e) => setUploadForm({ ...uploadForm, capture_date: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div
          className="adm-field"
          style={{
            paddingTop: '1.1rem',
            borderTop: '1px solid #f1f5f9',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '0.5rem',
            }}
          >
            <label htmlFor="upload-description" className="adm-label" style={{ marginBottom: 0 }}>
              Description
            </label>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {(uploadForm.description || '').length} characters
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.4rem',
              marginBottom: '0.65rem',
            }}
          >
            {[
              '25Hz UAV Trajectory Sampling',
              '10-Drone Swarm Coverage',
              'Morning Peak Congestion',
              'WGS84 Coordinates & Instantaneous Speed',
            ].map((tag) => (
              <button
                key={tag}
                type="button"
                className="adm-btn adm-btn--ghost adm-btn--sm"
                style={{ fontSize: '0.74rem', minHeight: '28px', padding: '0.2rem 0.6rem' }}
                onClick={() =>
                  setUploadForm((prev) => ({
                    ...prev,
                    description: prev.description ? `${prev.description.trim()} • ${tag}` : tag,
                  }))
                }
              >
                + {tag}
              </button>
            ))}
          </div>

          <textarea
            id="upload-description"
            className="adm-textarea"
            rows={4}
            placeholder="Flight altitude, sampling frequency, corridor boundaries, or preprocessing notes..."
            value={uploadForm.description}
            onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
          />
        </div>

        {isUploading && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#1d4ed8',
                marginBottom: '0.35rem',
              }}
            >
              <span>
                Uploading file and registering version{' '}
                {uploadMode === 'iteration' ? targetVersionTag : 'v1.0'}...
              </span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="adm-progress-track">
              <div
                className="adm-progress-fill"
                style={{ width: `${uploadProgress}%`, background: '#2563eb' }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
          <button
            type="button"
            className="adm-btn adm-btn--ghost"
            onClick={() => navigate('/engineer/datasets')}
          >
            Back to Catalog
          </button>
          <button
            type="submit"
            className="adm-btn adm-btn--primary"
            disabled={isUploading}
          >
            <Upload size={15} />
            <span>
              {isUploading
                ? 'Uploading...'
                : uploadMode === 'iteration'
                  ? `Upload Iteration (${targetVersionTag})`
                  : 'Upload & Submit for Approval'}
            </span>
          </button>
        </div>
      </form>
      </div>
    </section>
  )
}
