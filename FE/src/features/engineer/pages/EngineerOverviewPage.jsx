import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Database,
  Upload,
  RefreshCw,
  CheckCircle2,
  Clock,
  ArrowRight,
  Send,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react'
import { useEngineerOverview } from '../../../hooks/useEngineerOverview'
import { useLanguage } from '../../../hooks/useLanguage'
import DatasetDetailModal from '../components/DatasetDetailModal'
import EngineerRecentBatches from '../components/EngineerRecentBatches'

export default function EngineerOverviewPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const {
    datasets,
    isLoadingCatalog,
    catalogError,
    fetchCatalogAndHealth,
    openPreviewForDataset,
    openPipelineStudioForDataset,
  } = useOutletContext()

  const [detailModalItem, setDetailModalItem] = useState(null)

  const {
    totalDatasetsCount, approvedCount, pendingCount, draftCount, rejectedCount,
    approvalRatePct, recentDatasets, recentBatches, expandedBatchKey, toggleBatch,
  } = useEngineerOverview(datasets)

  return (
    <>
      {/* Overview and dataset statistics */}
      <section className="adm-command-hero">
        <div className="adm-command-hero__top">
          <div>
            <h2 className="adm-command-hero__title">{t('Data Engineering & Schema QA Studio')}</h2>
            <p className="adm-command-hero__desc">
              {t('Upload UAV trajectory data, check its structure and quality, and submit it for administrator approval.')}
            </p>
          </div>

          <div className="adm-command-hero__actions">
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => navigate('/engineer/upload')}
            >
              <Upload size={15} />
              <span>{t('Upload Dataset')}</span>
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--glass"
              onClick={fetchCatalogAndHealth}
              disabled={isLoadingCatalog}
              aria-label={t('Refresh dataset catalog')}
              title={t('Refresh catalog')}
            >
              <RefreshCw size={15} className={isLoadingCatalog ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="adm-command-ribbon eng-overview-ribbon">
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
                <div className="adm-ribbon-tile__lbl">{t('Total Datasets')}</div>
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
                <div className="adm-ribbon-tile__lbl">{t('Pending Review')}</div>
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
                <div className="adm-ribbon-tile__lbl">{t('Approved')}</div>
              </div>
            </div>
            <ArrowRight size={15} style={{ color: '#64748b' }} />
          </button>

        </div>
      </section>

      {catalogError && (
        <div className="eng-alert eng-alert--error">
          <div className="eng-alert__content">
            <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{t(catalogError)}</span>
          </div>
          <div className="eng-alert__actions">
            <button
              type="button"
              className="adm-btn adm-btn--ghost adm-btn--sm"
              onClick={fetchCatalogAndHealth}
            >
              {t('Retry')}
            </button>
          </div>
        </div>
      )}

      {/* 2. Bento Grid: Recent Files (8 cols) + Quality & Workflow (4 cols) */}
      <div className="adm-bento-grid">
        <section className="adm-panel adm-col-8">
          <div className="adm-panel__header">
            <div className="adm-panel__title-group">
              <div className="adm-panel__icon adm-tone--blue">
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <h3 className="adm-panel__title">{t('Recent Batches')}</h3>
              </div>
            </div>
            <button
              type="button"
              className="adm-btn adm-btn--ghost adm-btn--sm"
              onClick={() => navigate('/engineer/datasets')}
            >
              <span>{t('View All')}</span>
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
            ) : recentBatches.length === 0 ? (
              <div className="adm-empty">
                <div className="adm-empty__icon">
                  <Database size={24} />
                </div>
                <div className="adm-empty__title">{t('No datasets ingested yet')}</div>
                <p className="adm-empty__desc">
                  Tải dữ liệu lên để bắt đầu tạo và xử lý batch.
                </p>
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn--primary adm-btn--sm"
                    onClick={() => navigate('/engineer/upload')}
                  >
                    <Upload size={14} />
                    <span>{t('Upload Dataset')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <EngineerRecentBatches
                batches={recentBatches}
                expandedBatchKey={expandedBatchKey}
                onToggleBatch={toggleBatch}
                onPreviewDataset={openPreviewForDataset}
                onDatasetDetails={setDetailModalItem}
              />
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
                <h3 className="adm-panel__title">{t('Quality Gate & Workflow')}</h3>
              </div>
            </div>
          </div>

          <div className="adm-panel__body eng-overview-workflow">
            {/* Approval Rate Gauge */}
            <div className="adm-gauge-card">
              <div className="adm-gauge-card__top">
                <div>
                  <span className="adm-gauge-card__val">{approvalRatePct}%</span>
                  <span className="adm-gauge-card__lbl">{t('Approval Rate')}</span>
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
              <div className="adm-gauge-card__meta eng-overview-statuses">
                <span>{t('Pending Review')}: {pendingCount}</span>
                <span>{t('Not submitted')}: {draftCount}</span>
                <span>{t('Rejected')}: {rejectedCount}</span>
              </div>
              <p className="adm-panel__subtitle">{t('Based on the latest dataset_file of each dataset.')}</p>
            </div>

            {/* 3-Step Pipeline Quick Launch */}
            <div>
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
                {t('Pipeline Workflow')}
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
                      {t('1. Ingest Raw Dataset')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {t('Upload CSV recording files')}
                    </div>
                  </div>
                  <ArrowRight size={15} style={{ color: '#64748b', flexShrink: 0 }} />
                </button>

                <button
                  type="button"
                  className="adm-queue-item"
                  style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  onClick={() => openPipelineStudioForDataset(recentDatasets[0]?.dataset_id, 1)}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a' }}>
                      {t('2. Run 3-Step QA Studio')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {t('Map schema, inspect anomalies, normalize')}
                    </div>
                  </div>
                  <ArrowRight size={15} style={{ color: '#64748b', flexShrink: 0 }} />
                </button>

                <button
                  type="button"
                  className="adm-queue-item"
                  style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  disabled={recentDatasets.length === 0}
                  onClick={() => openPipelineStudioForDataset(recentDatasets[0]?.dataset_id)}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0f172a' }}>
                      {t('3. Export and submit for approval')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {t('Export processed data and send it to the administrator')}
                    </div>
                  </div>
                  <Send size={15} style={{ color: '#64748b', flexShrink: 0 }} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <DatasetDetailModal
        item={detailModalItem}
        onClose={() => setDetailModalItem(null)}
        onPreviewDataset={openPreviewForDataset}
        onOpenPipelineStudio={openPipelineStudioForDataset}
        onResubmitted={fetchCatalogAndHealth}
      />

    </>
  )
}
