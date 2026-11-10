import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Database, Eye, FlaskConical, MapPin, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useApprovedDatasetCatalog, useDatasetExperimentBrowser } from '../../../hooks/useExperimentBrowser'
import ExperimentBrowserList from '../components/ExperimentBrowserList'
import ExperimentListDetailPanel from '../components/ExperimentListDetailPanel'

const CATALOG_PATH = '/scientist/experiments'

export default function ScientistExperimentsPage() {
  const navigate = useNavigate()
  const { datasetId, experimentId } = useParams()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const { datasets, isLoading, error, reload } = useApprovedDatasetCatalog()
  const selectedDataset = useMemo(() => datasets.find((dataset) => String(dataset.dataset_id) === String(datasetId)), [datasets, datasetId])
  const visibleDatasets = useMemo(() => datasets.filter((dataset) => `${dataset.dataset_name || ''} ${dataset.dataset_code || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [datasets, search])
  const { experiments, isLoadingList, listError, reload: reloadExperiments, selectedExperiment, isLoadingDetail, detailError, recordingReference } = useDatasetExperimentBrowser(datasetId, selectedDataset?.versions || [], experimentId)
  const visibleExperiment = String(selectedExperiment?.experiment_id) === String(experimentId) ? selectedExperiment : null
  const selectedVersion = selectedDataset?.versions.find((version) => String(version.version_id) === String(visibleExperiment?.dataset_version_id))
  const datasetPath = (id) => `${CATALOG_PATH}/${encodeURIComponent(id)}`
  const trainingPath = (versionId) => `/scientist/datasets/${encodeURIComponent(datasetId)}/versions/${encodeURIComponent(versionId)}/train`

  return (
    <div className="sci-page">
      {!datasetId && <>
        <section className="admin-card">
          <div className="admin-card__header">
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--purple"><FlaskConical size={19} /></div>
              <div><h2 className="admin-card__title">Thí nghiệm · Datasets đã duyệt</h2><p className="admin-card__subtitle">Chọn dataset để xem các thí nghiệm đã chạy.</p></div>
            </div>
            {!isLoading && <span className="sci-pill sci-pill--version">{datasets.length} dataset</span>}
          </div>
          <form className="sci-toolbar" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput) }}>
            <div className="sci-toolbar__left">
              <label className="sci-search"><Search size={16} /><input className="admin-input" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tìm theo tên dataset..." aria-label="Tìm dataset" /></label>
              <button type="submit" className="btn-action btn-action--primary">Tìm kiếm</button>
            </div>
            <div className="sci-toolbar__right"><button type="button" className="btn-secondary" onClick={reload} disabled={isLoading}><RefreshCw size={15} /> Làm mới</button></div>
          </form>
        </section>
        {isLoading && <div className="sci-grid">{[1, 2, 3].map((number) => <div key={number} className="sci-skeleton" />)}</div>}
        {!isLoading && error && <div className="sci-state sci-state--error"><p>{error}</p><button type="button" className="btn-secondary" onClick={reload}>Thử lại</button></div>}
        {!isLoading && !error && datasets.length === 0 && <div className="sci-state"><Database size={36} color="#94a3b8" /><h3>Chưa có dataset đã duyệt</h3><p>Dataset cần được duyệt và cấp quyền trước khi bạn có thể xem thí nghiệm.</p></div>}
        {!isLoading && !error && datasets.length > 0 && visibleDatasets.length === 0 && <div className="sci-state">Không tìm thấy dataset phù hợp.</div>}
        {!isLoading && !error && visibleDatasets.length > 0 && <div className="sci-grid">
          {visibleDatasets.map((dataset) => <button type="button" key={dataset.dataset_id} className="sci-card sci-browser-dataset-card" onClick={() => navigate(datasetPath(dataset.dataset_id))}>
            <span className="sci-card__top"><strong className="sci-card__title">{dataset.dataset_name || 'Dataset chưa đặt tên'}</strong><span className="sci-pill sci-pill--approved"><ShieldCheck size={12} /> Approved</span></span>
            <span className="sci-meta"><span><Database size={13} /><em>{dataset.source || '—'}</em></span><span><MapPin size={13} /><em>{dataset.location_name || '—'}</em></span></span>
            <span className="sci-card__footer"><span className="sci-pill sci-pill--version">{dataset.versions.length === 1 ? dataset.versions[0].version_tag : `${dataset.versions.length} phiên bản`}</span><span className="sci-action-chip sci-action-chip--primary"><Eye size={14} /> Xem thí nghiệm</span></span>
          </button>)}
        </div>}
      </>}

      {datasetId && <>
        <section className="admin-card">
          <div className="admin-card__header">
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--purple"><FlaskConical size={19} /></div>
              <div><h2 className="admin-card__title">{selectedDataset?.dataset_name || 'Thí nghiệm của dataset'}</h2><p className="admin-card__subtitle">{experimentId ? 'Chi tiết kết quả thí nghiệm' : 'Danh sách thí nghiệm của dataset đã chọn'}</p></div>
            </div>
            <button type="button" className="btn-secondary" onClick={() => navigate(experimentId ? datasetPath(datasetId) : CATALOG_PATH)}><ArrowLeft size={16} /> {experimentId ? 'Danh sách thí nghiệm' : 'Danh sách dataset'}</button>
          </div>
        </section>
        {isLoading && <div className="sci-state"><div className="sci-spinner" />Đang tải dataset...</div>}
        {!isLoading && error && <div className="sci-state sci-state--error">{error}</div>}
        {!isLoading && !error && !selectedDataset && <div className="sci-state sci-state--error">Dataset này không có trong danh sách được duyệt hoặc bạn không có quyền truy cập.</div>}
        {selectedDataset && !experimentId && <ExperimentBrowserList dataset={selectedDataset} experiments={experiments} isLoading={isLoadingList} error={listError} onReload={reloadExperiments} onOpen={(id) => navigate(`${datasetPath(datasetId)}/${encodeURIComponent(id)}`)} onCreate={() => navigate(trainingPath(selectedDataset.versions[0].version_id))} />}
        {selectedDataset && experimentId && <ExperimentListDetailPanel
          datasetMeta={selectedVersion || selectedDataset}
          recordingReference={recordingReference}
          versionId={visibleExperiment?.dataset_version_id}
          selectedExperiment={visibleExperiment}
          isLoadingDetail={isLoadingDetail || (!visibleExperiment && !detailError)}
          detailError={detailError}
          onBackToList={() => navigate(datasetPath(datasetId))}
          onUseForPrediction={(experiment) => navigate(`/scientist/datasets/${encodeURIComponent(datasetId)}/versions/${encodeURIComponent(experiment.dataset_version_id)}/predict?experimentId=${encodeURIComponent(experiment.experiment_id)}`)}
        />}
      </>}
    </div>
  )
}
