import { useMemo, useState } from 'react'
import { Eye, FlaskConical, RefreshCw, Search } from 'lucide-react'
import { formatDate } from '../utils/formatters'

const STATUS_LABELS = {
  COMPLETED: 'Hoàn thành',
  RUNNING: 'Đang chạy',
  PENDING: 'Chờ xử lý',
  FAILED: 'Thất bại',
}

export default function ExperimentBrowserList({ dataset, experiments, isLoading, error, onReload, onOpen, onCreate }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [sort, setSort] = useState('newest')
  const versionById = useMemo(() => new Map(dataset.versions.map((version) => [String(version.version_id), version.version_tag])), [dataset])
  const visible = useMemo(() => experiments
    .filter((experiment) => {
      const matchesStatus = status === 'ALL' || experiment.status === status
      const text = `${experiment.experiment_name || ''} ${experiment.experiment_id || ''} ${versionById.get(String(experiment.dataset_version_id)) || ''}`.toLocaleLowerCase()
      return matchesStatus && text.includes(query.trim().toLocaleLowerCase())
    })
    .sort((a, b) => sort === 'oldest'
      ? new Date(a.created_at) - new Date(b.created_at)
      : new Date(b.created_at) - new Date(a.created_at)), [experiments, query, status, sort, versionById])

  return (
    <section className="admin-card sci-browser-results">
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--purple"><FlaskConical size={18} /></div>
          <div>
            <h2 className="admin-card__title">Thí nghiệm của {dataset.dataset_name}</h2>
            <p className="admin-card__subtitle">{dataset.versions.length} phiên bản đã duyệt · {experiments.length} thí nghiệm</p>
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={onReload} disabled={isLoading}>
          <RefreshCw size={15} /> Làm mới
        </button>
      </div>
      <div className="sci-card-body">
        {!isLoading && !error && experiments.length > 0 && (
          <div className="sci-exp-list-filters">
            <label className="sci-exp-list-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên, mã thí nghiệm hoặc phiên bản..." aria-label="Tìm thí nghiệm" /></label>
            <select className="sci-dataset-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Lọc trạng thái">
              <option value="ALL">Mọi trạng thái</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="sci-dataset-select" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sắp xếp">
              <option value="newest">Mới nhất trước</option><option value="oldest">Cũ nhất trước</option>
            </select>
          </div>
        )}
        {isLoading && <div className="sci-state"><div className="sci-spinner" />Đang tải thí nghiệm...</div>}
        {!isLoading && error && <div className="sci-state sci-state--error"><p>{error}</p><button type="button" className="btn-secondary" onClick={onReload}>Thử lại</button></div>}
        {!isLoading && !error && experiments.length === 0 && (
          <div className="sci-state"><FlaskConical size={34} color="#94a3b8" /><h3>Dataset này chưa có thí nghiệm</h3><p>Hãy mở Training Workspace để chuẩn bị dữ liệu và chạy thí nghiệm đầu tiên.</p><button type="button" className="btn-action btn-action--primary" onClick={onCreate}>Mở Training Workspace</button></div>
        )}
        {!isLoading && !error && experiments.length > 0 && visible.length === 0 && <div className="sci-state">Không có thí nghiệm phù hợp bộ lọc.</div>}
        {!isLoading && !error && visible.length > 0 && (
          <div className="sci-grid">
            {visible.map((experiment) => (
              <button type="button" key={experiment.experiment_id} className="sci-card sci-browser-experiment-card" onClick={() => onOpen(experiment.experiment_id)}>
                <span className="sci-card__top"><strong className="sci-card__title">{experiment.experiment_name || `Thí nghiệm ${String(experiment.experiment_id).slice(0, 8)}`}</strong><span className={`sci-pill ${experiment.status === 'COMPLETED' ? 'sci-pill--approved' : 'sci-pill--version'}`}>{STATUS_LABELS[experiment.status] || experiment.status}</span></span>
                <span className="sci-browser-experiment-card__info">Mã: {String(experiment.experiment_id).slice(0, 8)} · {versionById.get(String(experiment.dataset_version_id)) || 'Phiên bản không xác định'}</span>
                <span className="sci-browser-experiment-card__info">Chạy lúc {formatDate(experiment.created_at)}</span>
                <span className="sci-card__footer"><span className="sci-browser-experiment-card__config">{experiment.hyperparameters?.n_estimators ?? '—'} cây · độ sâu {experiment.hyperparameters?.max_depth ?? '∞'}</span><span className="sci-action-chip sci-action-chip--primary"><Eye size={14} /> Xem chi tiết</span></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
