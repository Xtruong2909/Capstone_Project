import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { useManagedShareDetail } from '../../../hooks/useResourceSharing'
import SharedResultDataSection from '../../business/components/SharedResultDataSection'

const RESOURCE_GROUPS = [
  ['DATASET', 'Tập dữ liệu'],
  ['TRAIN_TEST', 'Train/Test'],
  ['EXPERIMENT', 'Thí nghiệm'],
  ['PREDICTION', 'Kết quả dự báo'],
]

const SECTION_LABELS = {
  metadata: 'Thông tin Dataset', statistics: 'Thống kê', sessions: 'Phiên ghi hình',
  traffic_flow_chart: 'Lưu lượng theo thời gian', split_summary: 'Tổng quan Train/Test',
  train_test_counts: 'Số lượng mẫu', session_distribution: 'Phân bổ phiên ghi hình',
  split_configuration: 'Cấu hình chia tập', experiment_summary: 'Tổng quan thí nghiệm',
  hyperparameters: 'Siêu tham số', evaluation_metrics: 'Chỉ số đánh giá',
  baseline_comparison: 'So sánh mô hình', prediction_rows: 'Dự báo trên tập Test',
  horizon_comparison: 'So sánh mốc dự báo', forecast_summary: 'Tổng quan dự báo',
  model_information: 'Mô hình sử dụng', lag_features: 'Đặc trưng trễ',
  forecast_results: 'Kết quả dự báo', forecast_chart: 'Biểu đồ dự báo',
}

function resourceName(resource, index) {
  const data = resource.data || {}
  if (resource.resource_type === 'DATASET') return data.metadata?.dataset_name || `Tập dữ liệu ${index + 1}`
  if (resource.resource_type === 'EXPERIMENT') return data.experiment_summary?.experiment_name || `Thí nghiệm ${index + 1}`
  if (resource.resource_type === 'PREDICTION') {
    const createdAt = data.forecast_summary?.created_at
    const date = createdAt && new Date(createdAt)
    return date && !Number.isNaN(date.getTime())
      ? `Dự báo · ${date.toLocaleString('vi-VN')}`
      : `Dự báo ${index + 1}`
  }
  return `Train/Test ${index + 1}`
}

export default function ShareDetailModal({ shareId, onClose }) {
  const { detail, error, loading } = useManagedShareDetail(shareId)
  const [expandedId, setExpandedId] = useState(null)
  const [activeSection, setActiveSection] = useState('')
  const resources = detail?.resources || []

  const toggleResource = (resource) => {
    setExpandedId((current) => current === resource.item_id ? null : resource.item_id)
    setActiveSection(resource.visible_sections[0] || '')
  }

  return <div className="share-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="share-modal share-modal--detail" role="dialog" aria-modal="true" aria-label="Chi tiết chia sẻ">
      <header className="share-modal__head share-detail-head">
        <div><h2>Chi tiết chia sẻ</h2><p>{detail?.title || (loading ? 'Đang tải…' : '')}</p></div>
        <button type="button" className="share-icon-button" aria-label="Đóng" onClick={onClose}><X size={20} /></button>
      </header>
      {detail && <div className="share-detail-overview">{RESOURCE_GROUPS.map(([type, label]) => {
        const count = resources.filter((resource) => resource.resource_type === type).length
        return count > 0 && <span key={type}><strong>{count}</strong> {label.toLowerCase()}</span>
      })}</div>}
      <div className="share-detail-list">
        {loading && <p className="share-state">Đang tải chi tiết chia sẻ…</p>}
        {error && <p className="share-error" role="alert">{error}</p>}
        {detail && resources.length === 0 && <p className="share-state">Chưa có tài nguyên trong chia sẻ này.</p>}
        {detail && RESOURCE_GROUPS.map(([type, label]) => {
          const group = resources.filter((resource) => resource.resource_type === type)
          if (group.length === 0) return null
          return <section className="share-detail-group" key={type}>
            <h3>{label}<span>{group.length}</span></h3>
            {group.map((resource, index) => {
              const expanded = expandedId === resource.item_id
              const section = activeSection || resource.visible_sections[0]
              return <div className={`share-detail-resource${expanded ? ' is-open' : ''}`} key={resource.item_id}>
                <button type="button" className="share-detail-resource__toggle" aria-expanded={expanded} onClick={() => toggleResource(resource)}>
                  <span className="share-detail-resource__name">{resourceName(resource, index)}</span>
                  <span className="share-detail-resource__count">{resource.visible_sections.length} mục</span>
                  <ChevronDown size={17} aria-hidden="true" />
                </button>
                {expanded && <div className="share-detail-resource__body">
                  <div className="share-detail-section-tabs" aria-label="Nội dung chia sẻ">
                    {resource.visible_sections.map((item) => <button type="button" key={item} className={section === item ? 'active' : ''} aria-pressed={section === item} onClick={() => setActiveSection(item)}>{SECTION_LABELS[item] || item.replaceAll('_', ' ')}</button>)}
                  </div>
                  {section && <div className="share-detail-section"><SharedResultDataSection section={section} value={resource.data?.[section]} /></div>}
                </div>}
              </div>
            })}
          </section>
        })}
      </div>
    </section>
  </div>
}
