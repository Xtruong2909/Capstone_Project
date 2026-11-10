import { ChevronDown, CheckCircle2, Loader2, AlertCircle, Circle } from 'lucide-react'

const STATUS_LABELS = {
  pending: 'Chưa thực hiện',
  processing: 'Đang xử lý',
  completed: 'Hoàn thành',
  error: 'Lỗi',
}

const STATUS_ICONS = {
  pending: Circle,
  processing: Loader2,
  completed: CheckCircle2,
  error: AlertCircle,
}

export default function TrainingPreparationAccordion({
  id,
  index,
  title,
  description,
  status,
  isOpen,
  onToggle,
  children,
}) {
  const StatusIcon = STATUS_ICONS[status] || Circle

  return (
    <section className={`sci-prep-accordion sci-prep-accordion--${status}`}>
      <button
        type="button"
        className="sci-prep-accordion__trigger"
        aria-expanded={isOpen}
        aria-controls={`${id}-content`}
        onClick={onToggle}
      >
        <span className="sci-prep-accordion__number">{index}</span>
        <span className="sci-prep-accordion__heading">
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <span className={`sci-prep-status sci-prep-status--${status}`} role="status">
          <StatusIcon size={15} className={status === 'processing' ? 'sci-spin' : ''} />
          {STATUS_LABELS[status]}
        </span>
        <ChevronDown size={18} className={`sci-prep-accordion__chevron ${isOpen ? 'is-open' : ''}`} />
      </button>
      <div id={`${id}-content`} className="sci-prep-accordion__content" hidden={!isOpen}>
        {children}
      </div>
    </section>
  )
}
