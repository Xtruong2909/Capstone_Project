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
  FileSpreadsheet,
  Eye,
  Info,
  Sparkles,
  Workflow,
  AlertCircle,
} from 'lucide-react'
import {
  formatBytes,
  resolveEffectiveVersionTag,
  resolveEffectiveRecordCount,
} from '../utils/engineerHelpers'
import DatasetDetailModal, { DatasetStatusBadge } from '../components/DatasetDetailModal'
import PneumaSampleGeneratorModal from '../components/PneumaSampleGeneratorModal'

export default function EngineerOverviewPage() {
  const navigate = useNavigate()
  const {
    datasets,
    isLoadingCatalog,
    catalogError,
    versionLineageMap,
    recordCountsMap,
    fetchCatalogAndHealth,
    openPreviewForDataset,
    openPipelineStudioForDataset,
    startNewVersionIteration,
  } = useOutletContext()

  const [detailModalItem, setDetailModalItem] = useState(null)
  const [isSampleModalOpen, setIsSampleModalOpen] = useState(false)

  const totalDatasetsCount = datasets.length
  const approvedCount = datasets.filter((d) => d.approval_status === 'APPROVED').length
  const pendingCount = datasets.filter((d) => d.approval_status === 'PENDING').length
  const rejectedCount = datasets.filter((d) => d.approval_status === 'REJECTED').length
  const totalStorageBytes = datasets.reduce((sum, d) => sum + (d.file_size_bytes || 0), 0)
  const approvalRatePct =
    totalDatasetsCount > 0 ? Math.round((approvedCount / totalDatasetsCount) * 100) : 0

  const recentDatasets = datasets.slice(0, 6)

  const handleSampleGenerated = (file, summary) => {
    setIsSampleModalOpen(false)
    navigate('/engineer/upload', { state: { sampleFile: file, sampleSummary: summary } })
  }

  return (
    <>
      {/* 1. Command Hero + 4-Tile Ribbon */}
      <section className="adm-command-hero">
        <div className="adm-command-hero__top">
          <div>
            <h2 className="adm-command-hero__title">Data Engineering & Schema QA Studio</h2>
            <p className="adm-command-hero__desc">
              Ingest UAV trajectory datasets, run 3-step schema & quality checks, and submit
              verified versions to the Admin Quality Gate.
            </p>
          </div>

          <div className="adm-command-hero__actions">
            <button
              type="button"
              className="adm-btn adm-btn--glass"
              onClick={() => setIsSampleModalOpen(true)}
            >
              <Sparkles size={15} />
              <span>Generate Sample</span>
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => navigate('/engineer/upload')}
            >
              <Upload size={15} />
              <span>Upload Dataset</span>
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--glass"
              onClick={fetchCatalogAndHealth}
              disabled={isLoadingCatalog}
              aria-label="Refresh dataset catalog"
              title="Refresh catalog"
            >
              <RefreshCw size={15} className={isLoadingCatalog ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="adm-command-ribbon">
          <button
            type="button"
            className="adm-ribbon-tile eng-ribbon-tile--interactive"
            onClick={() => navigate('/engineer/datasets')}
          >
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon adm-tone--blue">
                <Database size={18} />
              </div>
              <div>
                <div className="adm-ribbon-tile__val">{totalDatasetsCount}</div>
                <div className="adm-ribbon-tile__lbl">Total Datasets</div>
              </div>
            </div>
            <ArrowRight size={15} style={{ color: '#64748b' }} />
          </button>

          <button
            type="button"
            className="adm-ribbon-tile eng-ribbon-tile--interactive"
            onClick={() => navigate('/engineer/datasets')}
          >
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon adm-tone--amber">
                <Clock size={18} />
              </div>
              <div>
                <div className="adm-ribbon-tile__val">{pendingCount}</div>
                <div className="adm-ribbon-tile__lbl">Pending Review</div>
              </div>
            </div>
            <ArrowRight size={15} style={{ color: '#64748b' }} />
          </button>

          <button
            type="button"
            className="adm-ribbon-tile eng-ribbon-tile--interactive"
            onClick={() => navigate('/engineer/datasets')}
          >
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon adm-tone--emerald">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="adm-ribbon-tile__val">{approvedCount}</div>
                <div className="adm-ribbon-tile__lbl">Approved</div>
              </div>
            </div>
            <ArrowRight size={15} style={{ color: '#64748b' }} />
          </button>

          <div className="adm-ribbon-tile">
            <div className="adm-ribbon-tile__left">
              <div className="adm-ribbon-tile__icon adm-tone--purple">
                <HardDrive size={18} />
              </div>
              <div>
                <div className="adm-ribbon-tile__val">{formatBytes(totalStorageBytes)}</div>
                <div className="adm-ribbon-tile__lbl">Storage Used</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {catalogError && (
        <div className="eng-alert eng-alert--error">
          <div className="eng-alert__content">
            <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{catalogError}</span>
          </div>
          <div className="eng-alert__actions">
            <button
              type="button"
              className="adm-btn adm-btn--ghost adm-btn--sm"
              onClick={fetchCatalogAndHealth}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* 2. Bento Grid: Recent Versions (8 cols) + Quality & Workflow (4 cols) */}
      <div className="adm-bento-grid">
        <section className="adm-panel adm-col-8">
          <div className="adm-panel__header">
            <div className="adm-panel__title-group">
              <div className="adm-panel__icon adm-tone--blue">
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <h3 className="adm-panel__title">Recent Dataset Versions</h3>
              </div>
            </div>
            <button
              type="button"
              className="adm-btn adm-btn--ghost adm-btn--sm"
              onClick={() => navigate('/engineer/datasets')}
            >
              <span>View All</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="adm-panel__body" style={{ padding: 0 }}>
            {isLoadingCatalog ? (
              <div style={{ padding: '1.25rem', display: 'grid', gap: '0.75rem' }}>
                {[1, 2, 3, 4].map((idx) => (
                  <div key={idx} className="eng-skeleton" style={{ height: '38px' }} />
                ))}
              </div>
            ) : recentDatasets.length === 0 ? (
              <div className="adm-empty">
                <div className="adm-empty__icon">
                  <Database size={24} />
                </div>
                <div className="adm-empty__title">No datasets ingested yet</div>
                <p className="adm-empty__desc">
                  Upload a raw CSV, Parquet, Excel, or JSON file, or generate a synthetic pNEUMA
                  sample to begin.
                </p>
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn--primary adm-btn--sm"
                    onClick={() => navigate('/engineer/upload')}
                  >
                    <Upload size={14} />
                    <span>Upload Dataset</span>
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                    onClick={() => setIsSampleModalOpen(true)}
                  >
                    <Sparkles size={14} />
                    <span>Generate Sample</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Dataset</th>
                      <th>Version</th>
                      <th>Records</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDatasets.map((item) => {
                      const effectiveVersion = resolveEffectiveVersionTag(item, versionLineageMap)
                      const effectiveRecordCount = resolveEffectiveRecordCount(item, recordCountsMap)

                      return (
                        <tr key={item.dataset_id}>
                          <td style={{ maxWidth: '240px' }}>
                            <div
                              className="eng-truncate"
                              title={item.name}
                              style={{ fontWeight: 700, color: '#0f172a' }}
                            >
                              {item.name}
                            </div>
                            <div
                              className="eng-truncate"
                              title={item.original_filename}
                              style={{ fontSize: '0.75rem', color: '#64748b' }}
                            >
                              {item.original_filename || item.code}
                            </div>
                          </td>
                          <td>
                            <span className="adm-code-tag">{effectiveVersion}</span>
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {effectiveRecordCount != null
                              ? Number(effectiveRecordCount).toLocaleString()
                              : '—'}
                          </td>
                          <td>
                            <DatasetStatusBadge status={item.approval_status} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                              <button
                                type="button"
                                className="adm-btn adm-btn--ghost adm-btn--sm"
                                title="Open in Pipeline Studio"
                                aria-label={`Open ${item.name} in Pipeline Studio`}
                                onClick={() => openPipelineStudioForDataset(item.dataset_id, 1)}
                              >
                                <Workflow size={14} />
                              </button>
                              <button
                                type="button"
                                className="adm-btn adm-btn--ghost adm-btn--sm"
                                title="Preview Data"
                                aria-label={`Preview ${item.name}`}
                                onClick={() => openPreviewForDataset(item.dataset_id)}
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                type="button"
                                className="adm-btn adm-btn--ghost adm-btn--sm"
                                title="Dataset Details"
                                aria-label={`View details for ${item.name}`}
                                onClick={() => setDetailModalItem(item)}
                              >
                                <Info size={14} />
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
        </section>

        <section className="adm-panel adm-col-4">
          <div className="adm-panel__header">
            <div className="adm-panel__title-group">
              <div className="adm-panel__icon adm-tone--emerald">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <h3 className="adm-panel__title">Quality Gate & Workflow</h3>
              </div>
            </div>
          </div>

          <div className="adm-panel__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {/* Approval Rate Gauge */}
            <div className="adm-gauge-card">
              <div className="adm-gauge-card__top">
                <div>
                  <span className="adm-gauge-card__val">{approvalRatePct}%</span>
                  <span className="adm-gauge-card__lbl">Approval Rate</span>
                </div>
                <span className="adm-badge adm-badge--emerald">
                  {approvedCount} / {totalDatasetsCount}
                </span>
              </div>
              <div className="adm-progress-track">
                <div
                  className="adm-progress-fill"
                  style={{ width: `${approvalRatePct}%`, background: '#10b981' }}
                />
              </div>
              <div className="adm-gauge-card__meta">
                <span>Pending: {pendingCount}</span>
                <span>Rejected: {rejectedCount}</span>
              </div>
            </div>

            {/* 3-Step Pipeline Quick Launch */}
            <div className="adm-rbac-stack">
              <div
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#64748b',
                  marginBottom: '0.65rem',
                }}
              >
                Pipeline Workflow
              </div>
              <div className="adm-queue-list">
                <button
                  type="button"
                  className="adm-queue-item"
                  style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  onClick={() => navigate('/engineer/upload')}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a' }}>
                      1. Ingest Raw Dataset
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Upload CSV, Parquet, Excel, or JSON
                    </div>
                  </div>
                  <ArrowRight size={15} style={{ color: '#64748b', flexShrink: 0 }} />
                </button>

                <button
                  type="button"
                  className="adm-queue-item"
                  style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  onClick={() => openPipelineStudioForDataset(datasets[0]?.dataset_id, 1)}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a' }}>
                      2. Run 3-Step QA Studio
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Map schema, inspect anomalies, normalize
                    </div>
                  </div>
                  <ArrowRight size={15} style={{ color: '#64748b', flexShrink: 0 }} />
                </button>

                <button
                  type="button"
                  className="adm-queue-item"
                  style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  disabled={datasets.length === 0}
                  onClick={() => startNewVersionIteration(datasets[0])}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a' }}>
                      3. Create Version Iteration
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Upgrade an existing dataset version
                    </div>
                  </div>
                  <GitBranch size={15} style={{ color: '#64748b', flexShrink: 0 }} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <DatasetDetailModal
        item={detailModalItem}
        versionLineageMap={versionLineageMap}
        recordCountsMap={recordCountsMap}
        onClose={() => setDetailModalItem(null)}
        onStartNewVersion={startNewVersionIteration}
        onPreviewDataset={openPreviewForDataset}
        onOpenPipelineStudio={openPipelineStudioForDataset}
        onResubmitted={fetchCatalogAndHealth}
      />

      <PneumaSampleGeneratorModal
        isOpen={isSampleModalOpen}
        onClose={() => setIsSampleModalOpen(false)}
        onGenerate={handleSampleGenerated}
      />
    </>
  )
}
