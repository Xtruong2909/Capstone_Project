import { Fragment } from 'react'
import { ChevronDown, ChevronRight, Eye, Info } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import { DatasetStatusBadge } from './DatasetDetailModal'

export default function EngineerRecentBatches({
  batches, expandedBatchKey, onToggleBatch, onPreviewDataset, onDatasetDetails,
}) {
  const { t } = useLanguage()
  const number = (value) => value == null ? '—' : Number(value).toLocaleString('vi-VN')
  return (
    <div className="adm-table-wrap">
      <table className="adm-table eng-recent-batches">
        <thead><tr>
          <th>{t('Batch')}</th><th>{t('Dataset count')}</th><th>{t('Records')}</th>
          <th>{t('Status')}</th><th style={{ textAlign: 'right' }}>{t('Actions')}</th>
        </tr></thead>
        <tbody>{batches.map((batch) => {
          const expanded = expandedBatchKey === batch.key
          const name = batch.group_name || t(batch.group_id ? 'Unnamed batch' : 'Unassigned Batch')
          return <Fragment key={batch.key}>
            <tr>
              <td>
                <button type="button" className="eng-batch-toggle" aria-expanded={expanded}
                  onClick={() => onToggleBatch(batch.key)}>
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <strong>{name}</strong>
                </button>
              </td>
              <td>{number(batch.datasetCount)}</td>
              <td>{number(batch.totalRecords)}</td>
              <td><DatasetStatusBadge status={batch.approval_status} /></td>
              <td style={{ textAlign: 'right' }}>
                <div className="eng-batch-actions">
                  <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" aria-expanded={expanded}
                    onClick={() => onToggleBatch(batch.key)}>{t(expanded ? 'Collapse' : 'View Datasets')}</button>
                </div>
              </td>
            </tr>
            {expanded && <tr><td colSpan={5} className="eng-batch-content">
              <table className="adm-table">
                <caption className="eng-batch-caption">{t('Datasets in batch')}: {name}</caption>
                <thead><tr><th>{t('Dataset')}</th><th>{t('Records')}</th><th>{t('Status')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Actions')}</th></tr></thead>
                <tbody>{batch.datasets.map((dataset) => <tr key={dataset.dataset_id}>
                  <td><strong>{dataset.name || t('Dataset')}</strong></td>
                  <td>{number(dataset.total_records)}</td>
                  <td><DatasetStatusBadge status={dataset.approval_status} /></td>
                  <td style={{ textAlign: 'right' }}><div className="eng-batch-actions">
                    <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm"
                      title={t('Preview Data')} aria-label={`${t('Preview Data')}: ${dataset.name}`}
                      onClick={() => onPreviewDataset(dataset.dataset_id)}><Eye size={14} /></button>
                    <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm"
                      title={t('Dataset Details')} aria-label={`${t('Dataset Details')}: ${dataset.name}`}
                      onClick={() => onDatasetDetails(dataset)}><Info size={14} /></button>
                  </div></td>
                </tr>)}</tbody>
              </table>
            </td></tr>}
          </Fragment>
        })}</tbody>
      </table>
    </div>
  )
}
