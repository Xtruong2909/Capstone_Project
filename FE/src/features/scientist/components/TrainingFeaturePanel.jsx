import { ChevronLeft, ChevronRight, Database, Loader2, Play } from 'lucide-react'
import useLagFeatureTable from '../../../hooks/useLagFeatureTable'
import { formatNumber, formatRecordingDateTime, formatRecordingTime } from '../utils/formatters'
import {
  formatLagFlow, getLagValue, getTargetValue,
  LAG_FEATURE_ORDER, LAG_HORIZONS, LAG_TARGET_ORDER,
} from '../utils/lagFeatureView'
import LagFeatureDetailDrawer from './LagFeatureDetailDrawer'

const EMPTY_SAMPLES = []

export default function TrainingFeaturePanel({
  featureData, isLoading, error, onGenerate,
  hasDependentSplit = false,
}) {
  const samples = featureData?.samples ?? EMPTY_SAMPLES
  const config = featureData?.configuration
  const featureOrder = featureData?.feature_order?.length ? featureData.feature_order : LAG_FEATURE_ORDER
  const targetOrder = featureData?.target_order?.length ? featureData.target_order : LAG_TARGET_ORDER
  const horizons = config?.forecast_horizons?.length ? config.forecast_horizons : LAG_HORIZONS
  const table = useLagFeatureTable(samples)

  const handleRun = (event) => {
    event.preventDefault()
    if (hasDependentSplit && !table.confirmRegenerate) {
      table.setConfirmRegenerate(true)
      return
    }
    table.setConfirmRegenerate(false)
    table.resetTable()
    onGenerate('MAIN_ROI')
  }

  return (
    <section className="admin-card sci-lag-panel">
      <div className="admin-card__header sci-lag-panel__header">
        <div>
          <h2 className="admin-card__title">Tạo đặc trưng trễ · Lag Features</h2>
          <p className="sci-lag-panel__hint">5 mốc lưu lượng gần nhất tạo đầu vào X; 3 mốc tương lai tạo nhãn Y.</p>
        </div>
        <div className="sci-train-actions">
          <form onSubmit={handleRun}>
            <button type="submit" className="btn-action btn-action--primary sci-train-btn" disabled={isLoading}>
              {isLoading ? <Loader2 size={16} className="sci-spin" /> : <Play size={16} />}
              <span>{isLoading ? 'Đang tính Lag Features...' : table.confirmRegenerate ? 'Xác nhận tính lại' : featureData ? 'Tính lại Lag Features' : 'Tính Lag Features'}</span>
            </button>
          </form>
        </div>
      </div>

      <div className="sci-card-body sci-lag-panel__body">
        {table.confirmRegenerate && (
          <div className="sci-warning" role="alert">
            Tính lại Lag Features có thể khiến kết quả Train/Test hiện tại không còn phù hợp. Nhấn “Xác nhận tính lại” để tiếp tục, hoặc{' '}
            <button type="button" className="sci-inline-link" onClick={() => table.setConfirmRegenerate(false)}>Hủy</button>.
          </div>
        )}
        {isLoading && <div className="sci-state" role="status"><div className="sci-spinner" /><strong>Đang tạo Lag Features từ dữ liệu 1 phút...</strong></div>}
        {!isLoading && error && <div className="sci-state sci-state--error" role="alert"><strong>Không thể tải Lag Features</strong><p>{error}</p></div>}
        {!isLoading && !error && !featureData && (
          <div className="sci-state">
            <Database size={32} aria-hidden="true" />
            <strong>Chưa có Lag Features</strong>
            <p>Chọn “Tính Lag Features” để xem các mẫu đầu vào và nhãn dự báo từ dataset này.</p>
          </div>
        )}

        {!isLoading && !error && featureData && (
          <>
            <div className="sci-lag-table-heading">
              <div>
                <h3>Bảng Lag Feature</h3>
                <p>Chọn một dòng để xem cửa sổ lịch sử và thời gian của từng Target.</p>
              </div>
              <span className="sci-lag-unit">Đơn vị: xe/phút</span>
            </div>

            {samples.length === 0 ? (
              <div className="sci-state sci-lag-empty">
                <strong>Chưa có mẫu hợp lệ</strong>
                <p>API chưa trả về mẫu có đủ Lag và Target. Hãy kiểm tra dữ liệu tổng hợp theo phút của dataset.</p>
              </div>
            ) : (
              <>
                <div className="sci-table-wrap sci-lag-table-wrap">
                  <table className="sci-table sci-lag-table">
                    <thead><tr>
                      <th scope="col">STT</th>
                      <th scope="col">Time Bucket (t)</th>
                      {featureOrder.map((key, position) => (
                        <th key={key} scope="col" className="sci-th-x">Lag {position + 1} ({position === 0 ? 't' : `t−${position}`})</th>
                      ))}
                      {targetOrder.map((key, position) => (
                        <th key={key} scope="col" className="sci-th-y">Target +{horizons[position]} phút</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {table.pagedSamples.map((sample, position) => {
                        const index = (table.page - 1) * table.pageSize + position
                        return (
                          <tr
                            key={`${sample.recording_session_id}-${sample.time_bucket}-${index}`}
                            className="sci-lag-table__row"
                            tabIndex={0}
                            aria-label={`Xem chi tiết mẫu ${index + 1}, Time Bucket ${formatRecordingTime(sample.time_bucket)}`}
                            onClick={() => table.openSample(index)}
                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); table.openSample(index) } }}
                          >
                            <td>{index + 1}</td>
                            <td className="sci-lag-table__time" title={formatRecordingDateTime(sample.time_bucket)}>{formatRecordingTime(sample.time_bucket)}</td>
                            {featureOrder.map((key, lagIndex) => <td key={key} className="sci-td-x">{formatLagFlow(getLagValue(sample, key, lagIndex))}</td>)}
                            {targetOrder.map((key, targetIndex) => <td key={key} className="sci-td-y">{formatLagFlow(getTargetValue(sample, key, targetIndex))}</td>)}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {samples.length > table.pageSize && (
                  <div className="sci-pager sci-lag-pager">
                    <span>Mẫu <strong>{(table.page - 1) * table.pageSize + 1}–{Math.min(table.page * table.pageSize, samples.length)}</strong> / <strong>{formatNumber(samples.length)}</strong></span>
                    <div className="sci-pager__controls">
                      <button type="button" className="btn-secondary" disabled={table.page === 1} onClick={table.previousPage}><ChevronLeft size={14} /> Trước</button>
                      <span>Trang {table.page} / {table.totalPages}</span>
                      <button type="button" className="btn-secondary" disabled={table.page === table.totalPages} onClick={table.nextPage}>Sau <ChevronRight size={14} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {table.selectedSample && !isLoading && (
        <LagFeatureDetailDrawer
          sample={table.selectedSample}
          index={table.selectedIndex}
          featureOrder={featureOrder}
          targetOrder={targetOrder}
          horizons={horizons}
          onClose={table.closeSample}
        />
      )}
    </section>
  )
}
