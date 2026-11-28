import { useState } from 'react'
import { FlaskConical, Layers } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import { formatAggregationInterval, formatExperimentDate, formatExperimentMetric } from '../utils/experimentFormatters'
import { AdminPagination } from './AdminUi'

const MODEL_LABELS = { RANDOM_FOREST: 'Random forest', PERSISTENCE: 'Persistence baseline' }
const TARGET_LABELS = { vehicle_count: 'Vehicle count', traffic_flow: 'Traffic flow', flow: 'Traffic flow' }
const STATUS_TONES = { COMPLETED: 'emerald', FAILED: 'rose', RUNNING: 'blue' }

export default function AdminExperimentsTable({ experiments = [], stats = {} }) {
  const { t, language } = useLanguage()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const items = Array.isArray(experiments) ? experiments : []
  const lastPage = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.min(page, lastPage)
  const paginated = items.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return <section className="adm-panel admin-experiments">
    <header className="adm-panel__header">
      <div className="adm-panel__title-group">
        <div className="adm-panel__icon adm-tone--purple"><FlaskConical size={18} /></div>
        <h3 className="adm-panel__title">{t('Short-Term Traffic Flow Forecasting Audit')}</h3>
      </div>
      <div className="admin-experiments__summary">
        <span className="adm-badge adm-badge--slate"><Layers size={12} />{t('Total')}: {stats.total_experiments ?? 0}</span>
        <span className="adm-badge adm-badge--blue">{t('Running')}: {stats.running_count ?? 0}</span>
        <span className="adm-badge adm-badge--emerald">{t('Completed')}: {stats.completed_count ?? 0}</span>
        <span className="adm-badge adm-badge--rose">{t('Failed')}: {stats.failed_count ?? 0}</span>
      </div>
    </header>
    {items.length === 0 ? <div className="adm-empty">
      <div className="adm-empty__icon adm-tone--purple"><FlaskConical size={24} /></div>
      <h4 className="adm-empty__title">{t('No experiments recorded yet')}</h4>
      <p className="adm-empty__desc">{t('Experiments trained by Data Scientists will automatically appear in this audit ledger.')}</p>
    </div> : <div className="adm-table-wrap">
      <table className="adm-table" aria-label={t('Short-Term Traffic Flow Forecasting Audit')}>
        <thead><tr>
          <th>{t('Experiment Name')}</th><th>{t('Model')}</th><th>{t('Target Variable')}</th>
          <th>{t('Aggregation Window')}</th><th>{t('Status')}</th>
          <th className="admin-experiments__metric"><abbr title={t('Mean absolute error')}>MAE</abbr></th>
          <th className="admin-experiments__metric"><abbr title={t('Root mean squared error')}>RMSE</abbr></th>
          <th>{t('Created Date')}</th>
        </tr></thead>
        <tbody>{paginated.map((experiment) => <tr key={experiment.id}>
          <td className="admin-experiments__name">
            <strong>{experiment.name?.trim() || experiment.experiment_name?.trim() || t('Unnamed experiment')}</strong>
            {(experiment.group_name || experiment.dataset_name) && <small className="admin-cell-note">{experiment.group_name || experiment.dataset_name}</small>}
          </td>
          <td><span className="adm-badge adm-badge--purple admin-experiments__model">{t(MODEL_LABELS[experiment.model_type] || experiment.model_type || '—')}</span></td>
          <td>{t(TARGET_LABELS[experiment.target_variable] || experiment.target_variable || '—')}</td>
          <td>{formatAggregationInterval(experiment.temporal_aggregation_sec, language)}</td>
          <td><span className={`adm-badge adm-badge--${STATUS_TONES[experiment.status] || 'amber'}`}>{t(experiment.status || '—')}</span></td>
          <td className="admin-experiments__metric">{formatExperimentMetric(experiment.metrics?.mae, language)}</td>
          <td className="admin-experiments__metric">{formatExperimentMetric(experiment.metrics?.rmse, language)}</td>
          <td className="admin-experiments__date">{formatExperimentDate(experiment.created_at, language)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {items.length > 0 && <AdminPagination
      page={currentPage}
      pageSize={pageSize}
      total={items.length}
      setPage={setPage}
      setPageSize={setPageSize}
    />}
  </section>
}
