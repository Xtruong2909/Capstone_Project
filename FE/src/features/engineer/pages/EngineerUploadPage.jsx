import { useEffect, useRef, useState } from 'react'
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
import PneumaSampleGeneratorModal from '../components/PneumaSampleGeneratorModal'

export default function EngineerUploadPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef(null)

  const {
    datasets,
    versionLineageMap,
    registerVersionLineage,
    registerRecordCount,
    prependUploadedDataset,
    openPreviewForDataset,
  } = useOutletContext()

  const [uploadMode, setUploadMode] = useState('new')
  const [parentDatasetId, setParentDatasetId] = useState('')
  const [targetVersionTag, setTargetVersionTag] = useState('v1.1-cleaned')
  const [changeSummary, setChangeSummary] = useState('')

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
  const [isSampleGeneratorOpen, setIsSampleGeneratorOpen] = useState(false)

  // Apply URL query or router state when arriving from "New Version" action
  useEffect(() => {
    const modeParam = searchParams.get('mode')
    const parentIdParam = searchParams.get('parentId')
    const baseFromState = location.state?.baseDataset

    if (modeParam === 'iteration' || baseFromState) {
      setUploadMode('iteration')
      const baseDataset =
        baseFromState ||
        datasets.find((d) => d.dataset_id === parentIdParam) ||
        datasets[0]

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
      }
    }
  }, [searchParams, location.state, datasets])

  const handleParentDatasetSelect = (datasetId) => {
    setParentDatasetId(datasetId)
    const found = datasets.find((d) => d.dataset_id === datasetId)
    if (found) {
      const cleanBaseName = found.name.replace(/\s*\(v[\d.]+[^)]*\)\s*$/i, '')
      setUploadForm({
        name: `${cleanBaseName} (${targetVersionTag})`,
        source: found.source || 'pNEUMA Drone Swarm - Athens',
        location_name: found.location_name || 'Athens Central Business District',
        capture_date: found.capture_date || new Date().toISOString().slice(0, 10),
        description: found.description || '',
      })
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
      const parent = datasets.find((d) => d.dataset_id === parentDatasetId)
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

  const handleGenerateSamplePneumaFile = () => {
    setIsSampleGeneratorOpen(true)
  }

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
        const parentItem = datasets.find((d) => d.dataset_id === parentDatasetId)
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
    <div className="admin-card">
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--blue">
            {uploadMode === 'iteration' ? <GitBranch size={18} /> : <Upload size={18} />}
          </div>
          <h3 className="admin-card__title">
            {uploadMode === 'iteration'
              ? 'Upload New Dataset Version Iteration (v1.1 / v2.0)'
              : 'Upload Traffic Trajectory Dataset'}
          </h3>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Mode Switcher: New Dataset vs Version Iteration */}
          <div
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: '0.22rem',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setUploadMode('new')
                setUploadError(null)
              }}
              style={{
                padding: '0.38rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.79rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: uploadMode === 'new' ? '#2563eb' : 'transparent',
                color: uploadMode === 'new' ? '#ffffff' : '#475569',
              }}
            >
              New Dataset (v1.0)
            </button>
            <button
              type="button"
              onClick={() => {
                setUploadMode('iteration')
                setUploadError(null)
                if (datasets.length > 0 && !parentDatasetId) {
                  handleParentDatasetSelect(datasets[0].dataset_id)
                }
              }}
              style={{
                padding: '0.38rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.79rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: uploadMode === 'iteration' ? '#7c3aed' : 'transparent',
                color: uploadMode === 'iteration' ? '#ffffff' : '#475569',
              }}
            >
              Version Iteration (v1.1 / v2.0)
            </button>
          </div>

          <button
            type="button"
            className="btn-action"
            style={{
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              fontWeight: 700,
            }}
            onClick={handleGenerateSamplePneumaFile}
          >
            <Sparkles size={15} />
            <span>Generate Sample pNEUMA (.csv)</span>
          </button>
        </div>
      </div>

      {uploadError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.9rem 1rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            color: '#b91c1c',
            marginBottom: '1.25rem',
            fontSize: '0.88rem',
            fontWeight: 600,
          }}
        >
          <AlertCircle size={18} />
          <span>{uploadError}</span>
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
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #a7f3d0',
                borderLeft: '4px solid #10b981',
                borderRadius: '10px',
                padding: '0.7rem 0.95rem',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.05)',
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#059669',
                  marginBottom: '0.22rem',
                }}
              >
                Version Tag
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#064e3b' }}>
                {resolveEffectiveVersionTag(uploadSuccess, versionLineageMap)}
              </div>
            </div>

            <div
              style={{
                background: '#ffffff',
                border: '1px solid #a7f3d0',
                borderLeft: '4px solid #14b8a6',
                borderRadius: '10px',
                padding: '0.7rem 0.95rem',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.05)',
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#0d9488',
                  marginBottom: '0.22rem',
                }}
              >
                Dataset Code
              </div>
              <div
                style={{
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                }}
              >
                {uploadSuccess.code}
              </div>
            </div>

            <div
              style={{
                background: '#ffffff',
                border: '1px solid #a7f3d0',
                borderLeft: '4px solid #10b981',
                borderRadius: '10px',
                padding: '0.7rem 0.95rem',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.05)',
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#059669',
                  marginBottom: '0.22rem',
                }}
              >
                Format
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#064e3b' }}>
                {uploadSuccess.file_format}
              </div>
            </div>

            <div
              style={{
                background: '#ffffff',
                border: '1px solid #a7f3d0',
                borderLeft: '4px solid #10b981',
                borderRadius: '10px',
                padding: '0.7rem 0.95rem',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.05)',
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#059669',
                  marginBottom: '0.22rem',
                }}
              >
                File Size
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#064e3b' }}>
                {formatBytes(uploadSuccess.file_size_bytes)}
              </div>
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
                  {datasets.map((d) => (
                    <option key={d.dataset_id} value={d.dataset_id}>
                      {d.name} [{d.approval_status}] (
                      {resolveEffectiveVersionTag(d, versionLineageMap)})
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
                    const parent = datasets.find((d) => d.dataset_id === parentDatasetId)
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

        {/* SECTION 01: Dataset File */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '1.2rem 1.35rem',
            marginBottom: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: '#2563eb',
                  background: '#dbeafe',
                  padding: '0.18rem 0.55rem',
                  borderRadius: '6px',
                  letterSpacing: '0.04em',
                }}
              >
                01
              </span>
              <span style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0f172a' }}>
                Dataset File
              </span>
            </div>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
              CSV, Parquet, Excel, JSON
            </span>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: isDraggingFile
                ? '2px dashed #7c3aed'
                : selectedFile
                ? '2px solid #2563eb'
                : '1.5px dashed #cbd5e1',
              background: isDraggingFile
                ? '#f5f3ff'
                : selectedFile
                ? '#eff6ff'
                : '#ffffff',
              borderRadius: '12px',
              padding: '1.6rem',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
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
                onClick={handleClearSelectedFile}
                title="Remove selected file"
                style={{
                  position: 'absolute',
                  top: '0.85rem',
                  right: '0.85rem',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0.35rem 0.6rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  color: '#dc2626',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={13} />
                <span>Clear File</span>
              </button>
            )}

            <div
              style={{
                width: '46px',
                height: '46px',
                margin: '0 auto 0.65rem',
                borderRadius: '12px',
                background: selectedFile ? '#dbeafe' : '#f1f5f9',
                color: selectedFile ? '#1d4ed8' : '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={22} />
            </div>

            {selectedFile ? (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#1e3a8a' }}>
                  {selectedFile.name}
                </div>
                <div style={{ fontSize: '0.83rem', color: '#2563eb', marginTop: '0.2rem' }}>
                  Size: {formatBytes(selectedFile.size)} / Max{' '}
                  {formatBytes(MAX_UPLOAD_SIZE_BYTES)}
                </div>

                {fileInspection && (
                  <div
                    style={{
                      display: 'inline-flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      justifyContent: 'center',
                      marginTop: '0.65rem',
                    }}
                  >
                    <span className="badge badge--active">
                      <Check size={12} style={{ marginRight: '0.25rem' }} />
                      {fileInspection.schemaHint}
                    </span>
                    {fileInspection.estimatedRows != null && (
                      <span className="badge badge--engineer">
                        {fileInspection.isPneuma
                          ? `~${fileInspection.estimatedRows.toLocaleString()} vehicle tracks`
                          : `~${fileInspection.estimatedRows.toLocaleString()} trajectory rows`}
                      </span>
                    )}
                    {fileInspection.delimiter && (
                      <span className="badge badge--pending">
                        Delimiter: {fileInspection.delimiter}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                  {isDraggingFile
                    ? 'Drop your dataset file here...'
                    : 'Drag & drop a dataset file here, or click to browse'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Max size: {formatBytes(MAX_UPLOAD_SIZE_BYTES)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 02: Dataset Metadata */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '1.2rem 1.35rem',
            marginBottom: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.95rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: '#2563eb',
                  background: '#dbeafe',
                  padding: '0.18rem 0.55rem',
                  borderRadius: '6px',
                  letterSpacing: '0.04em',
                }}
              >
                02
              </span>
              <span style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0f172a' }}>
                Dataset Metadata
              </span>
            </div>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
              Core identification & origin
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1rem',
            }}
          >
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Dataset Name (3–128 characters) *</label>
              <input
                type="text"
                className="admin-input"
                required
                minLength={3}
                maxLength={128}
                placeholder="e.g. pNEUMA Athens Morning Peak v1"
                value={uploadForm.name}
                onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                style={{ background: '#ffffff' }}
              />
            </div>

            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Collection Source *</label>
              <input
                type="text"
                className="admin-input"
                required
                maxLength={255}
                placeholder="e.g. pNEUMA Drone Swarm - EPFL"
                value={uploadForm.source}
                onChange={(e) => setUploadForm({ ...uploadForm, source: e.target.value })}
                style={{ background: '#ffffff' }}
              />
            </div>

            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">Traffic Corridor / Location *</label>
              <input
                type="text"
                className="admin-input"
                required
                maxLength={255}
                placeholder="e.g. Athens Central Business District"
                value={uploadForm.location_name}
                onChange={(e) => setUploadForm({ ...uploadForm, location_name: e.target.value })}
                style={{ background: '#ffffff' }}
              />
            </div>

            <div className="form-field" style={{ marginBottom: 0 }}>
              <label className="form-label">UAV Capture Date</label>
              <input
                type="date"
                className="admin-input"
                value={uploadForm.capture_date}
                onChange={(e) => setUploadForm({ ...uploadForm, capture_date: e.target.value })}
                style={{ background: '#ffffff' }}
              />
            </div>
          </div>
        </div>

        {/* SECTION 03: Description */}
        <div
          className="form-field"
          style={{
            marginBottom: '1.5rem',
            padding: '1.2rem 1.35rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
              marginBottom: '0.75rem',
            }}
          >
            <label
              className="form-label"
              style={{
                margin: 0,
                fontSize: '0.96rem',
                fontWeight: 700,
                color: '#0f172a',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: '#2563eb',
                  background: '#dbeafe',
                  padding: '0.18rem 0.55rem',
                  borderRadius: '6px',
                  letterSpacing: '0.04em',
                }}
              >
                03
              </span>
              <span>Description</span>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: '#64748b',
                  background: '#e2e8f0',
                  padding: '0.12rem 0.5rem',
                  borderRadius: '999px',
                }}
              >
                Optional
              </span>
            </label>

            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>
              {(uploadForm.description || '').length} characters
            </span>
          </div>

          {/* Quick-Insert Tag Chips */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.45rem',
              marginBottom: '0.75rem',
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
                onClick={() =>
                  setUploadForm((prev) => ({
                    ...prev,
                    description: prev.description ? `${prev.description.trim()} • ${tag}` : tag,
                  }))
                }
                style={{
                  background: '#ffffff',
                  border: '1px solid #bfdbfe',
                  color: '#1d4ed8',
                  borderRadius: '999px',
                  padding: '0.25rem 0.7rem',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + {tag}
              </button>
            ))}
          </div>

          <textarea
            className="admin-input"
            rows={5}
            placeholder="Enter a clear overview of this dataset (e.g., UAV flight altitude, sampling frequency, weather conditions, corridor boundaries, or preprocessing notes)..."
            value={uploadForm.description}
            onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
            style={{
              width: '100%',
              minHeight: '135px',
              fontSize: '0.96rem',
              lineHeight: 1.6,
              padding: '0.9rem 1.05rem',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              color: '#0f172a',
              resize: 'vertical',
            }}
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
            <div className="stat-card__mini-bar">
              <div
                className="stat-card__mini-bar-fill"
                style={{
                  width: `${uploadProgress}%`,
                  background: 'linear-gradient(90deg, #2563eb, #38bdf8)',
                }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/engineer/datasets')}
          >
            Back to Catalog
          </button>
          <button
            type="submit"
            className="btn-action btn-action--primary"
            disabled={isUploading}
            style={{ padding: '0.65rem 1.4rem', fontSize: '0.9rem' }}
          >
            <Upload size={16} />
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

      {isSampleGeneratorOpen && (
        <PneumaSampleGeneratorModal
          isOpen={isSampleGeneratorOpen}
          onClose={() => setIsSampleGeneratorOpen(false)}
          onGenerate={handleSampleDatasetGenerated}
        />
      )}
    </div>
  )
}
