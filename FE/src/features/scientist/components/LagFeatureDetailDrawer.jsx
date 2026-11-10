import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, X } from 'lucide-react'
import { formatRecordingDateTime, formatRecordingTime } from '../utils/formatters'
import {
  formatLagFlow, getLagValue, getTargetValue, LAG_FEATURE_ORDER, LAG_HORIZONS,
  LAG_TARGET_ORDER,
} from '../utils/lagFeatureView'

export default function LagFeatureDetailDrawer({ sample, index, featureOrder, targetOrder, horizons, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    const previousFocus = document.activeElement
    closeRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        event.preventDefault()
        closeRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus?.()
    }
  }, [onClose])

  if (!sample) return null
  const lagKeys = featureOrder?.length ? featureOrder : LAG_FEATURE_ORDER
  const targetKeys = targetOrder?.length ? targetOrder : LAG_TARGET_ORDER
  const horizonValues = horizons?.length ? horizons : LAG_HORIZONS

  return createPortal(
    <div className="sci-lag-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="sci-lag-drawer" role="dialog" aria-modal="true" aria-labelledby="sci-lag-drawer-title">
        <div className="sci-lag-drawer__header">
          <div>
            <span className="sci-lag-eyebrow">Chi tiết mẫu Lag Feature</span>
            <h2 id="sci-lag-drawer-title">Mẫu #{index + 1} · {formatRecordingTime(sample.time_bucket)}</h2>
            <p>Time Bucket (t): {formatRecordingDateTime(sample.time_bucket)}</p>
          </div>
          <button ref={closeRef} type="button" className="sci-lag-drawer__close" onClick={onClose} aria-label="Đóng chi tiết mẫu">
            <X size={20} />
          </button>
        </div>

        <div className="sci-lag-drawer__content">
          <div className="sci-lag-history">
            <Clock3 size={18} />
            <div>
              <strong>Khoảng lịch sử đầu vào</strong>
              <span>{formatRecordingDateTime(sample.history_start_time)} → {formatRecordingDateTime(sample.time_bucket)}</span>
            </div>
          </div>

          <section className="sci-lag-vector sci-lag-vector--x" aria-label="Vector đầu vào X">
            <div className="sci-lag-vector__heading">
              <h3>Vector X · 5 Lag Features</h3>
              <span>Mới nhất → cũ nhất</span>
            </div>
            <div className="sci-lag-vector__grid sci-lag-vector__grid--x">
              {lagKeys.map((key, position) => (
                <div className="sci-lag-value" key={key}>
                  <span>Lag {position + 1} ({position === 0 ? 't' : `t−${position}`})</span>
                  <strong>{formatLagFlow(getLagValue(sample, key, position))}</strong>
                  <small>xe/phút</small>
                </div>
              ))}
            </div>
          </section>

          <section className="sci-lag-vector sci-lag-vector--y" aria-label="Vector nhãn mục tiêu Y">
            <div className="sci-lag-vector__heading">
              <h3>Vector Y · Forecast Targets</h3>
              <span>Giá trị thực tế ở tương lai</span>
            </div>
            <div className="sci-lag-vector__grid sci-lag-vector__grid--y">
              {targetKeys.map((key, position) => (
                <div className="sci-lag-value" key={key}>
                  <span>Target +{horizonValues[position]} phút</span>
                  <strong>{formatLagFlow(getTargetValue(sample, key, position))}</strong>
                  <small>xe/phút · {formatRecordingDateTime(sample.target_times?.[key])}</small>
                </div>
              ))}
            </div>
          </section>

          <p className="sci-lag-explanation">
            Cửa sổ trượt dùng lưu lượng tại t, t−1, …, t−4 làm đầu vào X; lưu lượng tại t+1, t+3, t+5 là nhãn Y để đánh giá dự báo. X không chứa giá trị tương lai.
          </p>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
