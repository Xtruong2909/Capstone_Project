import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database,
  Upload,
  Table2,
  LayoutDashboard,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  Sparkles,
  ArrowRight,
  LogOut,
  Search,
  Eye,
  Layers,
  HardDrive,
  MapPin,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  X,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { datasetService } from '../../services/datasetService'
import apiClient from '../../services/apiClient'
import '../admin/AdminLayout.css'

const SAMPLE_PNEUMA_CSV_CONTENT = [
  'track_id;type;traveled_d;avg_speed;lat;lon;speed;lon_acc;lat_acc;time',
  '101;Car;145.8;34.2;37.97552;23.73482;32.5;0.15;-0.04;0.0;37.97561;23.73495;34.8;0.22;0.02;0.5;37.97574;23.73510;35.4;0.08;-0.01;1.0',
  '102;Motorcycle;210.4;42.6;37.97580;23.73460;41.2;0.45;0.12;0.0;37.97598;23.73479;43.9;0.31;-0.08;0.5',
  '103;Bus;98.2;22.1;37.97530;23.73520;21.8;-0.12;0.01;0.0;37.97539;23.73531;22.4;0.05;0.00;0.5',
  '104;Taxi;176.0;31.5;37.97610;23.73545;30.9;0.19;-0.05;0.0;37.97622;23.73560;32.1;0.14;0.03;0.5',
  '105;Medium Vehicle;120.5;27.4;37.97515;23.73440;27.0;0.09;0.02;0.0;37.97525;23.73452;27.8;0.11;-0.02;0.5',
].join('\n')

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val >= 10 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`
}

function formatStructureLabel(structure) {
  switch (structure) {
    case 'pneuma_trajectory':
      return 'Quỹ đạo UAV pNEUMA'
    case 'generic_csv':
      return 'CSV Tiêu chuẩn'
    case 'generic_parquet':
      return 'Apache Parquet'
    case 'generic_json':
      return 'JSON'
    case 'generic_xlsx':
    case 'generic_xls':
      return 'Bảng tính Excel'
    default:
      return structure || 'Chưa xác định'
  }
}

export default function EngineerWorkspace() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  // Active Sidebar Tab: 'catalog' | 'upload' | 'preview'
  const [activeTab, setActiveTab] = useState('catalog')

  // System & Catalog State
  const [dbStatus, setDbStatus] = useState(null)
  const [datasets, setDatasets] = useState([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Upload Form State
  const [selectedFile, setSelectedFile] = useState(null)
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

  // Preview State
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [previewRepresentation, setPreviewRepresentation] = useState('normalized')
  const [previewPage, setPreviewPage] = useState(1)
  const [previewPageSize, setPreviewPageSize] = useState(20)
  const [previewData, setPreviewData] = useState(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const fetchCatalogAndHealth = async () => {
    setIsLoadingCatalog(true)
    setCatalogError(null)
    try {
      const [listResult, healthResult] = await Promise.all([
        datasetService.listDatasets({ limit: 100 }),
        apiClient.get('/health/db').catch(() => ({ data: { status: 'disconnected' } })),
      ])
      setDatasets(listResult)
      setDbStatus(healthResult.data)
      if (listResult.length > 0 && !selectedDatasetId) {
        setSelectedDatasetId(listResult[0].dataset_id)
      }
    } catch (err) {
      setCatalogError(
        err.response?.data?.detail || 'Không thể tải danh sách bộ dữ liệu từ máy chủ.'
      )
    } finally {
      setIsLoadingCatalog(false)
    }
  }

  useEffect(() => {
    fetchCatalogAndHealth()
  }, [])

  const fetchDatasetPreview = async (
    targetId = selectedDatasetId,
    page = previewPage,
    pageSize = previewPageSize,
    representation = previewRepresentation
  ) => {
    if (!targetId) return
    setIsPreviewLoading(true)
    setPreviewError(null)
    try {
      const result = await datasetService.previewDataset(targetId, {
        page,
        page_size: pageSize,
        representation,
      })
      setPreviewData(result)
    } catch (err) {
      setPreviewData(null)
      setPreviewError(
        err.response?.data?.detail ||
          'Không thể đọc bản xem trước của bộ dữ liệu này.'
      )
    } finally {
      setIsPreviewLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'preview' && selectedDatasetId) {
      fetchDatasetPreview(
        selectedDatasetId,
        previewPage,
        previewPageSize,
        previewRepresentation
      )
    }
  }, [activeTab, selectedDatasetId, previewPage, previewPageSize, previewRepresentation])

  const handleOpenPreviewForDataset = (datasetId) => {
    setSelectedDatasetId(datasetId)
    setPreviewPage(1)
    setActiveTab('preview')
  }

  const handleGenerateSamplePneumaFile = () => {
    const blob = new Blob([SAMPLE_PNEUMA_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' })
    const timestampSuffix = new Date().toTimeString().slice(0, 5).replace(':', '')
    const sampleFile = new File([blob], `pneuma_athens_uav_${timestampSuffix}.csv`, {
      type: 'text/csv',
    })
    setSelectedFile(sampleFile)
    setUploadForm({
      name: `pNEUMA Athens Corridor ${timestampSuffix}`,
      source: 'pNEUMA Drone Swarm - EPFL Open Traffic',
      location_name: 'Athens Central Business District (Syntagma)',
      capture_date: '2018-10-24',
      description:
        'Dữ liệu quỹ đạo phương tiện thu thập từ đội bay UAV pNEUMA (chuẩn hóa tọa độ lat/lon, vận tốc và gia tốc theo bước thời gian).',
    })
    setUploadError(null)
    setUploadSuccess(null)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setUploadError(null)
    setUploadSuccess(null)
    if (!uploadForm.name) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ')
      setUploadForm((prev) => ({
        ...prev,
        name: baseName.length >= 3 ? baseName : `Dataset ${baseName}`,
      }))
    }
  }

  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFile) {
      setUploadError('Vui lòng chọn file dữ liệu (.csv, .parquet, .xlsx, .xls, .json).')
      return
    }
    if (uploadForm.name.trim().length < 3) {
      setUploadError('Tên bộ dữ liệu phải có ít nhất 3 ký tự.')
      return
    }
    if (!uploadForm.source.trim() || !uploadForm.location_name.trim()) {
      setUploadError('Vui lòng nhập đầy đủ Nguồn thu thập và Khu vực giao thông.')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      const uploaded = await datasetService.uploadDataset(
        {
          file: selectedFile,
          ...uploadForm,
        },
        (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setUploadProgress(pct)
          }
        }
      )

      setUploadSuccess(uploaded)
      setDatasets((prev) => [uploaded, ...prev])
      setSelectedDatasetId(uploaded.dataset_id)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setUploadError(
        err.response?.data?.detail ||
          'Tải bộ dữ liệu lên thất bại. Vui lòng kiểm tra định dạng hoặc tên bộ dữ liệu.'
      )
    } finally {
      setIsUploading(false)
    }
  }

  // Computed metrics
  const isOnline = dbStatus?.status === 'connected'
  const totalDatasetsCount = datasets.length
  const approvedCount = datasets.filter((d) => d.approval_status === 'APPROVED').length
  const pendingCount = datasets.filter((d) => d.approval_status === 'PENDING').length
  const totalStorageBytes = datasets.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0)
  const approvalRatePct =
    totalDatasetsCount > 0 ? Math.round((approvedCount / totalDatasetsCount) * 100) : 100

  const filteredDatasets = datasets.filter((item) => {
    const matchesStatus = statusFilter === 'ALL' || item.approval_status === statusFilter
    const q = searchQuery.trim().toLowerCase()
    const matchesQuery =
      !q ||
      item.name?.toLowerCase().includes(q) ||
      item.code?.toLowerCase().includes(q) ||
      item.location_name?.toLowerCase().includes(q) ||
      item.original_filename?.toLowerCase().includes(q)
    return matchesStatus && matchesQuery
  })

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return <span className="badge badge--approved">Đã phê duyệt</span>
      case 'REJECTED':
        return <span className="badge badge--rejected">Từ chối</span>
      default:
        return <span className="badge badge--pending">Chờ phê duyệt</span>
    }
  }

  return (
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar__header">
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo-badge">
              <Database size={20} />
            </div>
            <div className="admin-sidebar__brand-text">
              <h2>Urban Traffic</h2>
              <span>Data Engineer</span>
            </div>
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`admin-nav-item ${activeTab === 'catalog' ? 'active' : ''}`}
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <LayoutDashboard size={18} />
            <span>Danh mục Dataset</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`admin-nav-item ${activeTab === 'upload' ? 'active' : ''}`}
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <Upload size={18} />
            <span>Tải lên Dataset UAV</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`admin-nav-item ${activeTab === 'preview' ? 'active' : ''}`}
            style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <Table2 size={18} />
            <span>Kiểm tra & Xem trước</span>
          </button>
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-user-profile">
            <div className="admin-avatar">
              {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'E'}
            </div>
            <div className="admin-user-info">
              <span className="admin-user-name">{user?.full_name || 'Data Engineer'}</span>
              <span className="admin-user-email">{user?.email || 'engineer@gmail.com'}</span>
            </div>
          </div>

          <button type="button" className="admin-logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__title">
            <h1>Không gian Kỹ sư Dữ liệu (pNEUMA Pipeline)</h1>
          </div>
          <div className="admin-header__badge">
            <span>Vai trò: Data Engineer</span>
          </div>
        </header>

        <main className="admin-content">
          {/* 1. Hero Banner */}
          <div className="admin-hero-banner">
            <div className="admin-hero-banner__top">
              <div className="admin-hero-banner__content">
                <h2 className="admin-hero-banner__title">Quản lý & Chuẩn hóa Dữ liệu UAV</h2>
              </div>

              <div className="admin-hero-banner__actions">
                <div
                  className={`status-pill-live ${
                    isOnline ? 'status-pill-live--online' : 'status-pill-live--offline'
                  }`}
                >
                  <span
                    className={`status-pulse-dot ${
                      isOnline ? 'status-pulse-dot--online' : 'status-pulse-dot--offline'
                    }`}
                  />
                  <span>{isOnline ? 'CSDL trực tuyến' : 'Mất kết nối CSDL'}</span>
                </div>

                <button
                  type="button"
                  className="btn-hero-primary"
                  onClick={() => setActiveTab('upload')}
                >
                  <Upload size={16} />
                  <span>Tải dataset mới</span>
                </button>

                <button
                  type="button"
                  className="btn-hero-refresh"
                  onClick={fetchCatalogAndHealth}
                >
                  <RefreshCw size={15} className={isLoadingCatalog ? 'animate-spin' : ''} />
                  <span>Làm mới</span>
                </button>
              </div>
            </div>

            {/* Quick Navigation Tiles */}
            <div className="hero-quick-grid">
              <div
                className="hero-quick-tile"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setStatusFilter('ALL')
                  setActiveTab('catalog')
                }}
              >
                <div className="hero-quick-tile__left">
                  <div className="hero-quick-tile__icon admin-card__icon-box--blue">
                    <Database size={18} />
                  </div>
                  <div>
                    <div className="hero-quick-tile__value">{totalDatasetsCount}</div>
                    <div className="hero-quick-tile__label">Tổng bộ dữ liệu</div>
                  </div>
                </div>
                <span className="hero-quick-tile__cta">
                  <ArrowRight size={14} />
                </span>
              </div>

              <div
                className="hero-quick-tile"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setStatusFilter('PENDING')
                  setActiveTab('catalog')
                }}
              >
                <div className="hero-quick-tile__left">
                  <div className="hero-quick-tile__icon admin-card__icon-box--amber">
                    <Clock size={18} />
                  </div>
                  <div>
                    <div className="hero-quick-tile__value">{pendingCount}</div>
                    <div className="hero-quick-tile__label">Chờ phê duyệt</div>
                  </div>
                </div>
                <span className="hero-quick-tile__cta">
                  <ArrowRight size={14} />
                </span>
              </div>

              <div
                className="hero-quick-tile"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setStatusFilter('APPROVED')
                  setActiveTab('catalog')
                }}
              >
                <div className="hero-quick-tile__left">
                  <div className="hero-quick-tile__icon admin-card__icon-box--green">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <div className="hero-quick-tile__value">{approvedCount}</div>
                    <div className="hero-quick-tile__label">Đã phê duyệt</div>
                  </div>
                </div>
                <span className="hero-quick-tile__cta">
                  <ArrowRight size={14} />
                </span>
              </div>

              <div
                className="hero-quick-tile"
                style={{ cursor: 'pointer' }}
                onClick={() => setActiveTab('preview')}
              >
                <div className="hero-quick-tile__left">
                  <div className="hero-quick-tile__icon admin-card__icon-box--purple">
                    <HardDrive size={18} />
                  </div>
                  <div>
                    <div className="hero-quick-tile__value">{formatBytes(totalStorageBytes)}</div>
                    <div className="hero-quick-tile__label">Dung lượng lưu trữ</div>
                  </div>
                </div>
                <span className="hero-quick-tile__cta">
                  <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </div>

          {/* TAB 1: DATASET CATALOG */}
          {activeTab === 'catalog' && (
            <>
              <div className="stats-grid">
                <div className="stat-card stat-card--blue">
                  <Database size={96} className="stat-card__watermark" />
                  <div className="stat-card__top">
                    <div className="stat-card__info">
                      <h3>{totalDatasetsCount}</h3>
                      <p>Phiên bản đã tiếp nhận</p>
                    </div>
                    <div className="stat-card__icon stat-card__icon--blue">
                      <Database size={22} />
                    </div>
                  </div>
                </div>

                <div className="stat-card stat-card--green">
                  <CheckCircle2 size={96} className="stat-card__watermark" />
                  <div className="stat-card__top">
                    <div className="stat-card__info">
                      <h3>{approvalRatePct}%</h3>
                      <p>Tỷ lệ phê duyệt</p>
                    </div>
                    <div className="stat-card__icon stat-card__icon--green">
                      <CheckCircle2 size={22} />
                    </div>
                  </div>
                  <div className="stat-card__mini-bar">
                    <div
                      className="stat-card__mini-bar-fill"
                      style={{
                        width: `${approvalRatePct}%`,
                        background: 'linear-gradient(90deg, #059669, #34d399)',
                      }}
                    />
                  </div>
                </div>

                <div className="stat-card stat-card--amber">
                  <Clock size={96} className="stat-card__watermark" />
                  <div className="stat-card__top">
                    <div className="stat-card__info">
                      <h3>{pendingCount}</h3>
                      <p>Đang chờ Admin duyệt</p>
                    </div>
                    <div className="stat-card__icon stat-card__icon--amber">
                      <Clock size={22} />
                    </div>
                  </div>
                </div>

                <div className="stat-card stat-card--purple">
                  <Layers size={96} className="stat-card__watermark" />
                  <div className="stat-card__top">
                    <div className="stat-card__info">
                      <h3>5 định dạng</h3>
                      <p>CSV • Parquet • Excel • JSON</p>
                    </div>
                    <div className="stat-card__icon stat-card__icon--purple">
                      <Layers size={22} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-card">
                <div className="admin-card__header">
                  <div className="admin-card__header-left">
                    <div className="admin-card__icon-box admin-card__icon-box--blue">
                      <FileSpreadsheet size={18} />
                    </div>
                    <h3 className="admin-card__title">Danh mục Bộ dữ liệu Giao thông</h3>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                      <Search
                        size={15}
                        style={{
                          position: 'absolute',
                          left: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#64748b',
                        }}
                      />
                      <input
                        type="text"
                        className="admin-input"
                        placeholder="Tìm tên, mã, khu vực..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '2.2rem', minWidth: '220px' }}
                      />
                    </div>

                    <select
                      className="admin-select"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      style={{ minWidth: '160px' }}
                    >
                      <option value="ALL">Tất cả trạng thái</option>
                      <option value="PENDING">Chờ phê duyệt</option>
                      <option value="APPROVED">Đã phê duyệt</option>
                      <option value="REJECTED">Từ chối</option>
                    </select>

                    <button
                      type="button"
                      className="btn-action btn-action--primary"
                      onClick={() => setActiveTab('upload')}
                    >
                      <Upload size={15} />
                      <span>Tải lên</span>
                    </button>
                  </div>
                </div>

                {isLoadingCatalog ? (
                  <div className="empty-state">
                    <RefreshCw
                      size={26}
                      className="animate-spin"
                      style={{ margin: '0 auto 0.75rem', color: '#2563eb' }}
                    />
                    <p>Đang tải danh sách bộ dữ liệu...</p>
                  </div>
                ) : catalogError ? (
                  <div className="empty-state">
                    <AlertCircle size={26} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
                    <p>{catalogError}</p>
                  </div>
                ) : filteredDatasets.length === 0 ? (
                  <div className="vivid-empty-box">
                    <div
                      className="vivid-empty-box__icon"
                      style={{
                        background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                        color: '#1d4ed8',
                        border: '1px solid #93c5fd',
                      }}
                    >
                      <Upload size={26} />
                    </div>
                    <h4 style={{ margin: '0.2rem 0 0', fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>
                      Chưa có bộ dữ liệu nào phù hợp
                    </h4>
                    <button
                      type="button"
                      className="btn-action btn-action--primary"
                      style={{ marginTop: '0.5rem' }}
                      onClick={() => setActiveTab('upload')}
                    >
                      <Upload size={15} />
                      <span>Tải dataset đầu tiên lên</span>
                    </button>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Bộ dữ liệu & File gốc</th>
                          <th>Nguồn & Khu vực</th>
                          <th>Phiên bản</th>
                          <th>Định dạng & Dung lượng</th>
                          <th>Ngày tải lên</th>
                          <th>Trạng thái</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDatasets.map((item) => (
                          <tr key={item.version_id || item.dataset_id}>
                            <td>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.name}</div>
                              <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '0.15rem' }}>
                                <code>{item.code}</code> • {item.original_filename}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.84rem' }}>
                                {item.location_name}
                              </div>
                              <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                                {item.source}
                                {item.capture_date ? ` • Ghi hình: ${item.capture_date}` : ''}
                              </div>
                            </td>
                            <td>
                              <code
                                style={{
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '6px',
                                  border: '1px solid #bfdbfe',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                }}
                              >
                                {item.version_tag}
                              </code>
                            </td>
                            <td>
                              <span style={{ fontWeight: 700, color: '#334155' }}>
                                {item.file_format}
                              </span>
                              <span style={{ color: '#64748b', fontSize: '0.8rem', marginLeft: '0.4rem' }}>
                                ({formatBytes(item.file_size_bytes)})
                              </span>
                            </td>
                            <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                              {new Date(item.created_at).toLocaleString('vi-VN')}
                            </td>
                            <td>{renderStatusBadge(item.approval_status)}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-action btn-action--primary"
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}
                                onClick={() => handleOpenPreviewForDataset(item.dataset_id)}
                              >
                                <Eye size={14} />
                                <span>Xem trước</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: UPLOAD DATASET */}
          {activeTab === 'upload' && (
            <div className="admin-card">
              <div className="admin-card__header">
                <div className="admin-card__header-left">
                  <div className="admin-card__icon-box admin-card__icon-box--blue">
                    <Upload size={18} />
                  </div>
                  <h3 className="admin-card__title">Tải lên Bộ dữ liệu Quỹ đạo Giao thông</h3>
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
                  <span>Tạo dữ liệu mẫu pNEUMA (.csv)</span>
                </button>
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
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    padding: '1rem 1.25rem',
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '12px',
                    color: '#166534',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <CheckCircle2 size={22} color="#16a34a" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        Đã tải lên thành công: {uploadSuccess.name} ({uploadSuccess.version_tag})
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#15803d' }}>
                        Mã: <code>{uploadSuccess.code}</code> • Định dạng: {uploadSuccess.file_format} • Dung lượng:{' '}
                        {formatBytes(uploadSuccess.file_size_bytes)} • Trạng thái: {uploadSuccess.approval_status}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-action btn-action--success"
                    onClick={() => handleOpenPreviewForDataset(uploadSuccess.dataset_id)}
                  >
                    <Eye size={15} />
                    <span>Kiểm tra Schema & Xem trước ngay</span>
                  </button>
                </div>
              )}

              <form onSubmit={handleUploadSubmit}>
                {/* File Selector Box */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: selectedFile ? '2px solid #2563eb' : '2px dashed #cbd5e1',
                    background: selectedFile ? '#eff6ff' : '#f8fafc',
                    borderRadius: '14px',
                    padding: '1.75rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    marginBottom: '1.5rem',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json,.xls,.xlsx,.parquet"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />

                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      margin: '0 auto 0.75rem',
                      borderRadius: '12px',
                      background: selectedFile ? '#dbeafe' : '#e2e8f0',
                      color: selectedFile ? '#1d4ed8' : '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileText size={24} />
                  </div>

                  {selectedFile ? (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e3a8a' }}>
                        {selectedFile.name}
                      </div>
                      <div style={{ fontSize: '0.84rem', color: '#2563eb', marginTop: '0.25rem' }}>
                        Dung lượng: {formatBytes(selectedFile.size)} • Nhấn để đổi file khác
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0f172a' }}>
                        Nhấn để chọn file dữ liệu hoặc dùng nút &ldquo;Tạo dữ liệu mẫu pNEUMA&rdquo;
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.25rem' }}>
                        Định dạng hỗ trợ: CSV, Parquet, Excel (.xls, .xlsx), JSON
                      </div>
                    </div>
                  )}
                </div>

                {/* Metadata Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '1.1rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div className="form-field">
                    <label className="form-label">Tên bộ dữ liệu (3–128 ký tự) *</label>
                    <input
                      type="text"
                      className="admin-input"
                      required
                      minLength={3}
                      maxLength={128}
                      placeholder="VD: pNEUMA Athens Morning Peak v1"
                      value={uploadForm.name}
                      onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label">Nguồn thu thập (Source) *</label>
                    <input
                      type="text"
                      className="admin-input"
                      required
                      maxLength={255}
                      placeholder="VD: pNEUMA Drone Swarm - EPFL"
                      value={uploadForm.source}
                      onChange={(e) => setUploadForm({ ...uploadForm, source: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label">Khu vực giao thông (Location) *</label>
                    <input
                      type="text"
                      className="admin-input"
                      required
                      maxLength={255}
                      placeholder="VD: Athens Central Business District"
                      value={uploadForm.location_name}
                      onChange={(e) =>
                        setUploadForm({ ...uploadForm, location_name: e.target.value })
                      }
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label">Ngày ghi hình UAV (Capture Date)</label>
                    <input
                      type="date"
                      className="admin-input"
                      value={uploadForm.capture_date}
                      onChange={(e) =>
                        setUploadForm({ ...uploadForm, capture_date: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="form-field" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label">Mô tả kỹ thuật (Tùy chọn)</label>
                  <textarea
                    className="admin-input"
                    rows={3}
                    placeholder="Ghi chú về tần suất lấy mẫu, số lượng drone, điều kiện giao thông..."
                    value={uploadForm.description}
                    onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                    style={{ resize: 'vertical' }}
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
                      <span>Đang tải file và khởi tạo phiên bản v1.0...</span>
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
                    onClick={() => setActiveTab('catalog')}
                  >
                    Quay lại danh mục
                  </button>
                  <button
                    type="submit"
                    className="btn-action btn-action--primary"
                    disabled={isUploading}
                    style={{ padding: '0.65rem 1.4rem', fontSize: '0.9rem' }}
                  >
                    <Upload size={16} />
                    <span>{isUploading ? 'Đang tải lên...' : 'Tải lên & Trình phê duyệt'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: DATASET PREVIEW & SCHEMA INSPECTOR */}
          {activeTab === 'preview' && (
            <div className="admin-card">
              <div className="admin-card__header">
                <div className="admin-card__header-left">
                  <div className="admin-card__icon-box admin-card__icon-box--purple">
                    <Table2 size={18} />
                  </div>
                  <h3 className="admin-card__title">
                    Kiểm tra Schema & Chuẩn hóa Quỹ đạo pNEUMA
                  </h3>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
                  {/* Dataset Selector */}
                  <select
                    className="admin-select"
                    value={selectedDatasetId}
                    onChange={(e) => {
                      setSelectedDatasetId(e.target.value)
                      setPreviewPage(1)
                    }}
                    style={{ minWidth: '250px', fontWeight: 600 }}
                  >
                    <option value="">-- Chọn bộ dữ liệu để xem trước --</option>
                    {datasets.map((d) => (
                      <option key={d.dataset_id} value={d.dataset_id}>
                        {d.name} ({d.file_format} • {d.version_tag})
                      </option>
                    ))}
                  </select>

                  {/* Representation Toggle: normalized vs raw */}
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
                        setPreviewRepresentation('normalized')
                        setPreviewPage(1)
                      }}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: previewRepresentation === 'normalized' ? '#2563eb' : 'transparent',
                        color: previewRepresentation === 'normalized' ? '#ffffff' : '#475569',
                      }}
                    >
                      Chuẩn hóa pNEUMA (normalized)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewRepresentation('raw')
                        setPreviewPage(1)
                      }}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: previewRepresentation === 'raw' ? '#2563eb' : 'transparent',
                        color: previewRepresentation === 'raw' ? '#ffffff' : '#475569',
                      }}
                    >
                      Dữ liệu gốc (raw)
                    </button>
                  </div>

                  {/* Page Size Selector */}
                  <select
                    className="admin-select"
                    value={previewPageSize}
                    onChange={(e) => {
                      setPreviewPageSize(Number(e.target.value))
                      setPreviewPage(1)
                    }}
                  >
                    <option value={10}>10 dòng / trang</option>
                    <option value={20}>20 dòng / trang</option>
                    <option value={50}>50 dòng / trang</option>
                    <option value={100}>100 dòng / trang</option>
                  </select>
                </div>
              </div>

              {!selectedDatasetId ? (
                <div className="vivid-empty-box">
                  <div
                    className="vivid-empty-box__icon"
                    style={{
                      background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                      color: '#7c3aed',
                      border: '1px solid #d8b4fe',
                    }}
                  >
                    <Table2 size={26} />
                  </div>
                  <h4 style={{ margin: '0.2rem 0 0', fontSize: '0.96rem', fontWeight: 700, color: '#0f172a' }}>
                    Chọn một bộ dữ liệu ở thanh trên để kiểm tra Schema và xem trước các dòng bản ghi
                  </h4>
                </div>
              ) : isPreviewLoading ? (
                <div className="empty-state">
                  <RefreshCw
                    size={26}
                    className="animate-spin"
                    style={{ margin: '0 auto 0.75rem', color: '#2563eb' }}
                  />
                  <p>Đang đọc và phân tích cấu trúc dữ liệu...</p>
                </div>
              ) : previewError ? (
                <div className="empty-state">
                  <AlertCircle size={26} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
                  <p>{previewError}</p>
                </div>
              ) : previewData ? (
                <>
                  {/* Metadata & Detected Structure KPI Ribbon */}
                  <div className="exp-kpi-ribbon" style={{ marginBottom: '1.15rem' }}>
                    <div className="exp-kpi-box">
                      <span className="exp-kpi-box__label">Cấu trúc phát hiện</span>
                      <div className="exp-kpi-box__val" style={{ fontSize: '1rem', color: '#1d4ed8' }}>
                        {formatStructureLabel(previewData.detected_structure)}
                      </div>
                    </div>

                    <div className="exp-kpi-box">
                      <span className="exp-kpi-box__label">File gốc & Dung lượng</span>
                      <div className="exp-kpi-box__val" style={{ fontSize: '0.95rem' }}>
                        {previewData.original_filename} ({formatBytes(previewData.file_size)})
                      </div>
                    </div>

                    <div className="exp-kpi-box">
                      <span className="exp-kpi-box__label">Số cột Schema</span>
                      <div className="exp-kpi-box__val" style={{ color: '#7c3aed' }}>
                        {previewData.columns?.length || 0} cột ({previewData.representation})
                      </div>
                    </div>

                    <div className="exp-kpi-box">
                      <span className="exp-kpi-box__label">Tổng số dòng bản ghi</span>
                      <div className="exp-kpi-box__val" style={{ color: '#059669' }}>
                        {previewData.pagination?.total_rows != null
                          ? previewData.pagination.total_rows.toLocaleString()
                          : `${previewData.pagination?.returned_rows || 0}+`}
                      </div>
                    </div>
                  </div>

                  {/* Warnings Banner (if any) */}
                  {previewData.warnings && previewData.warnings.length > 0 && (
                    <div
                      style={{
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '10px',
                        padding: '0.85rem 1.1rem',
                        marginBottom: '1.15rem',
                        color: '#92400e',
                        fontSize: '0.84rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                        <AlertTriangle size={16} color="#d97706" />
                        <span>Cảnh báo kiểm tra cấu trúc ({previewData.warnings.length})</span>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.4rem' }}>
                        {previewData.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Schema Column Pills */}
                  <div style={{ marginBottom: '1.15rem' }}>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: '#475569',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Lược đồ các cột ({previewData.columns?.length || 0} trường dữ liệu)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                      {previewData.columns?.map((col) => (
                        <span
                          key={col.name}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.28rem 0.65rem',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                          }}
                        >
                          <strong style={{ color: '#0f172a' }}>{col.name}</strong>
                          <code
                            style={{
                              fontSize: '0.7rem',
                              color: '#2563eb',
                              background: '#dbeafe',
                              padding: '0.08rem 0.35rem',
                              borderRadius: '4px',
                              fontWeight: 700,
                            }}
                          >
                            {col.type}
                          </code>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Paginated Data Table */}
                  <div
                    style={{
                      overflowX: 'auto',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      marginBottom: '1rem',
                    }}
                  >
                    <table className="admin-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: '56px', textAlign: 'center' }}>#</th>
                          {previewData.columns?.map((col) => (
                            <th key={col.name}>{col.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.rows?.map((row, rowIdx) => {
                          const rowNumber =
                            (previewData.pagination.page - 1) * previewData.pagination.page_size +
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
                              {previewData.columns?.map((col) => {
                                const val = row[col.name]
                                const displayVal =
                                  val === null || val === undefined
                                    ? '—'
                                    : typeof val === 'object'
                                    ? JSON.stringify(val)
                                    : String(val)
                                return (
                                  <td
                                    key={col.name}
                                    style={{
                                      fontFamily:
                                        col.type === 'float' || col.type === 'integer'
                                          ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                                          : 'inherit',
                                      fontSize: '0.82rem',
                                      whiteSpace: 'nowrap',
                                      maxWidth: '260px',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                    title={displayVal}
                                  >
                                    {displayVal}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ fontSize: '0.84rem', color: '#475569', fontWeight: 600 }}>
                      Trang {previewData.pagination?.page || 1} • Hiển thị{' '}
                      {previewData.pagination?.returned_rows || 0} bản ghi
                      {previewData.pagination?.total_rows != null &&
                        ` / Tổng ${previewData.pagination.total_rows.toLocaleString()} bản ghi`}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={previewPage <= 1 || isPreviewLoading}
                        onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        <ChevronLeft size={15} />
                        <span>Trang trước</span>
                      </button>

                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!previewData.pagination?.has_more || isPreviewLoading}
                        onClick={() => setPreviewPage((p) => p + 1)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        <span>Trang tiếp</span>
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
