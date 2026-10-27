import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Database,
  Upload,
  RefreshCw,
  CheckCircle2,
  Clock,
  ArrowRight,
  HardDrive,
  GitBranch,
  MessageSquareWarning,
  FileSpreadsheet,
  Eye,
  Info,
  Layers,
} from 'lucide-react'
import {
  formatBytes,
  resolveEffectiveVersionTag,
  resolveEffectiveRecordCount,
} from '../utils/engineerHelpers'
import DatasetDetailModal, { DatasetStatusBadge } from '../components/DatasetDetailModal'

export default function EngineerOverviewPage() {
  const navigate = useNavigate()
  const {
    dbStatus,
    datasets,
    isLoadingCatalog,
    versionLineageMap,
    recordCountsMap,
    fetchCatalogAndHealth,
    openPreviewForDataset,
    startNewVersionIteration,
  } = useOutletContext()

  const [detailModalItem, setDetailModalItem] = useState(null)

  const isOnline = dbStatus?.status === 'connected'
  const totalDatasetsCount = datasets.length
  const approvedCount = datasets.filter((d) => d.approval_status === 'APPROVED').length
  const pendingCount = datasets.filter((d) => d.approval_status === 'PENDING').length
  const rejectedCount = datasets.filter((d) => d.approval_status === 'REJECTED').length
  const totalStorageBytes = datasets.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0)
  const approvalRatePct =
    totalDatasetsCount > 0 ? Math.round((approvedCount / totalDatasetsCount) * 100) : 100

  const recentDatasets = datasets.slice(0, 6)

  return (
    <>
      {/* 1. Hero Banner */}
      <div className="admin-hero-banner">
        <div className="admin-hero-banner__top">
          <div className="admin-hero-banner__content">
            <h2 className="admin-hero-banner__title">
              UAV Trajectory Data Ingestion & Schema QA
            </h2>
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
              <span>{isOnline ? 'Database Online' : 'Database Offline'}</span>
            </div>

            <button
              type="button"
              className="btn-hero-primary"
              onClick={() => navigate('/engineer/upload')}
            >
              <Upload size={16} />
              <span>Upload Dataset</span>
            </button>

            <button
              type="button"
              className="btn-hero-refresh"
              onClick={fetchCatalogAndHealth}
            >
              <RefreshCw size={15} className={isLoadingCatalog ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick Navigation Tiles */}
        <div className="hero-quick-grid">
          <div
            className="hero-quick-tile"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/engineer/datasets?status=ALL')}
          >
            <div className="hero-quick-tile__left">
              <div className="hero-quick-tile__icon admin-card__icon-box--blue">
                <Database size={18} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{totalDatasetsCount}</div>
                <div className="hero-quick-tile__label">Total Datasets</div>
              </div>
            </div>
            <span className="hero-quick-tile__cta">
              <ArrowRight size={14} />
            </span>
          </div>

          <div
            className="hero-quick-tile"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/engineer/datasets?status=PENDING')}
          >
            <div className="hero-quick-tile__left">
              <div className="hero-quick-tile__icon admin-card__icon-box--amber">
                <Clock size={18} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{pendingCount}</div>
                <div className="hero-quick-tile__label">Pending Review</div>
              </div>
            </div>
            <span className="hero-quick-tile__cta">
              <ArrowRight size={14} />
            </span>
          </div>

          <div
            className="hero-quick-tile"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/engineer/datasets?status=APPROVED')}
          >
            <div className="hero-quick-tile__left">
              <div className="hero-quick-tile__icon admin-card__icon-box--green">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{approvedCount}</div>
                <div className="hero-quick-tile__label">Approved</div>
              </div>
            </div>
            <span className="hero-quick-tile__cta">
              <ArrowRight size={14} />
            </span>
          </div>

          <div
            className="hero-quick-tile"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/engineer/preview')}
          >
            <div className="hero-quick-tile__left">
              <div className="hero-quick-tile__icon admin-card__icon-box--purple">
                <HardDrive size={18} />
              </div>
              <div>
                <div className="hero-quick-tile__value">{formatBytes(totalStorageBytes)}</div>
                <div className="hero-quick-tile__label">Storage Used</div>
              </div>
            </div>
            <span className="hero-quick-tile__cta">
              <ArrowRight size={14} />
            </span>
          </div>
        </div>
      </div>

      {/* 2. KPI Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card stat-card--blue">
          <Database size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <h3>{totalDatasetsCount}</h3>
              <p>Ingested Versions</p>
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
              <p>Approval Rate</p>
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
              <p>Awaiting Admin Review</p>
            </div>
            <div className="stat-card__icon stat-card__icon--amber">
              <Clock size={22} />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card--purple">
          <GitBranch size={96} className="stat-card__watermark" />
          <div className="stat-card__top">
            <div className="stat-card__info">
              <h3>{Object.keys(versionLineageMap).length + totalDatasetsCount}</h3>
              <p>Tracked Lineage Commits</p>
            </div>
            <div className="stat-card__icon stat-card__icon--purple">
              <GitBranch size={22} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Rejected Alert Banner */}
      {rejectedCount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '0.9rem 1.15rem',
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: '12px',
            color: '#9f1239',
            marginBottom: '1.25rem',
            fontSize: '0.86rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600 }}>
            <MessageSquareWarning size={18} color="#e11d48" />
            <span>
              {rejectedCount} dataset version(s) were rejected during Admin review. Inspect feedback
              and upload a cleaned iteration (<code>v1.1-cleaned</code>).
            </span>
          </div>
          <button
            type="button"
            className="btn-action btn-action--danger"
            style={{ fontSize: '0.78rem', padding: '0.38rem 0.8rem' }}
            onClick={() => navigate('/engineer/datasets?status=REJECTED')}
          >
            View Rejected ({rejectedCount})
          </button>
        </div>
      )}

      {/* 4. Two-Column Overview Layout: Recent Datasets + Pipeline Readiness */}
      <div className="overview-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.75rem' }}>
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div className="admin-card__header">
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--blue">
                <FileSpreadsheet size={18} />
              </div>
              <h3 className="admin-card__title">Recent Ingested Datasets</h3>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/engineer/datasets')}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
            >
              View Full Catalog ({totalDatasetsCount})
            </button>
          </div>

          {recentDatasets.length === 0 ? (
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
                No datasets uploaded yet
              </h4>
              <button
                type="button"
                className="btn-action btn-action--primary"
                style={{ marginTop: '0.5rem' }}
                onClick={() => navigate('/engineer/upload')}
              >
                <Upload size={15} />
                <span>Upload First Dataset</span>
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Version</th>
                    <th>Format & Size</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDatasets.map((item) => {
                    const effectiveTag = resolveEffectiveVersionTag(item, versionLineageMap)
                    const lineage = versionLineageMap[item.dataset_id]
                    const recordCount = resolveEffectiveRecordCount(item, recordCountsMap)

                    return (
                      <tr key={item.version_id || item.dataset_id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {item.location_name}
                          </div>
                        </td>
                        <td>
                          <code
                            style={{
                              background: lineage ? '#f3e8ff' : '#eff6ff',
                              color: lineage ? '#7c3aed' : '#1d4ed8',
                              padding: '0.18rem 0.48rem',
                              borderRadius: '6px',
                              border: lineage ? '1px solid #d8b4fe' : '1px solid #bfdbfe',
                              fontWeight: 700,
                              fontSize: '0.76rem',
                            }}
                          >
                            {effectiveTag}
                          </code>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.82rem' }}>
                            {item.file_format} ({formatBytes(item.file_size_bytes)})
                          </div>
                          {recordCount != null && (
                            <div style={{ fontSize: '0.73rem', color: '#059669', fontWeight: 600 }}>
                              {Number(recordCount).toLocaleString()} records
                            </div>
                          )}
                        </td>
                        <td>
                          <DatasetStatusBadge status={item.approval_status} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="btn-action btn-action--primary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                              onClick={() => openPreviewForDataset(item.dataset_id)}
                            >
                              <Eye size={13} />
                              <span>Preview</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Card: Pipeline Quality & Quick Actions */}
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div className="admin-card__header">
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--purple">
                <Layers size={18} />
              </div>
              <h3 className="admin-card__title">Pipeline Quality & Actions</h3>
            </div>
          </div>

          <div
            style={{
              padding: '1.5rem 1.6rem 1.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.35rem',
            }}
          >
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '1.25rem 1.4rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  marginBottom: '0.65rem',
                }}
              >
                <span>Approved for Data Science</span>
                <span style={{ color: '#059669', fontWeight: 800 }}>
                  {approvedCount} / {totalDatasetsCount} ({approvalRatePct}%)
                </span>
              </div>
              <div className="stat-card__mini-bar" style={{ height: '7px', marginBottom: '1.15rem' }}>
                <div
                  className="stat-card__mini-bar-fill"
                  style={{
                    width: `${approvalRatePct}%`,
                    background: 'linear-gradient(90deg, #059669, #34d399)',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.75rem',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #bbf7d0',
                    borderRadius: '10px',
                    padding: '0.9rem 0.6rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
                    {approvedCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '0.3rem' }}>
                    Approved
                  </div>
                </div>
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #fde68a',
                    borderRadius: '10px',
                    padding: '0.9rem 0.6rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>
                    {pendingCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '0.3rem' }}>
                    Pending
                  </div>
                </div>
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #fecaca',
                    borderRadius: '10px',
                    padding: '0.9rem 0.6rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>
                    {rejectedCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '0.3rem' }}>
                    Rejected
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                alignItems: 'center',
                paddingTop: '0.2rem',
              }}
            >
              <button
                type="button"
                className="btn-action btn-action--primary"
                style={{
                  width: '100%',
                  maxWidth: '340px',
                  justifyContent: 'center',
                  padding: '0.72rem 1.25rem',
                  fontSize: '0.86rem',
                  borderRadius: '9px',
                }}
                onClick={() => navigate('/engineer/upload')}
              >
                <Upload size={16} />
                <span>Upload New Dataset (v1.0)</span>
              </button>

              <button
                type="button"
                className="btn-action"
                style={{
                  width: '100%',
                  maxWidth: '340px',
                  justifyContent: 'center',
                  padding: '0.72rem 1.25rem',
                  fontSize: '0.86rem',
                  background: '#f3e8ff',
                  color: '#7c3aed',
                  border: '1px solid #d8b4fe',
                  borderRadius: '9px',
                  fontWeight: 700,
                }}
                onClick={() => startNewVersionIteration(datasets[0])}
              >
                <GitBranch size={16} />
                <span>Create Version Iteration (v1.1 / v2.0)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <DatasetDetailModal
        item={detailModalItem}
        versionLineageMap={versionLineageMap}
        recordCountsMap={recordCountsMap}
        onClose={() => setDetailModalItem(null)}
        onStartNewVersion={startNewVersionIteration}
        onPreviewDataset={openPreviewForDataset}
      />
    </>
  )
}
