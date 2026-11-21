import { CheckCircle2, Loader2, SplitSquareVertical } from 'lucide-react'
import { formatNumber } from '../utils/formatters'
import TrainTestSplitPanel from './TrainTestSplitPanel'

export default function ExperimentSplitSection({
  sampleCount, featureData, splitData, isSplitting, isPreparingFeatures,
  featureError, splitError, splitOutdated,
  activeSplitContext, showDetails, onToggleDetails, onRunSplit, onProceedToExperiment,
  datasetKey,
}) {
  const hasSavedSplit = Boolean(splitData?.split_id)
  const shouldShowDetails = hasSavedSplit || showDetails
  const canSplit = sampleCount >= 2
  const status = splitOutdated ? 'Cần chia lại' : isSplitting || isPreparingFeatures ? 'Đang xử lý' : hasSavedSplit ? 'Đã chia 70/30' : 'Chưa chia dữ liệu'

  return (
    <section className="admin-card sci-experiment-split">
      <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--blue"><SplitSquareVertical size={18} /></div>
          <div>
            <h2 className="admin-card__title">Chia dữ liệu Train/Test 70/30</h2>
            <p className="admin-card__subtitle">Chia các mẫu Lag Features theo thứ tự thời gian trước khi chạy Random Forest.</p>
          </div>
        </div>
        <div className="sci-train-actions">
          <span className={`sci-prep-status sci-prep-status--${splitOutdated ? 'error' : isSplitting || isPreparingFeatures ? 'processing' : hasSavedSplit ? 'completed' : 'pending'}`}>
            {hasSavedSplit && !splitOutdated && <CheckCircle2 size={15} />}{status}
          </span>
          {!hasSavedSplit && <button type="button" className="btn-action btn-action--primary sci-train-btn" onClick={onToggleDetails} disabled={isSplitting || isPreparingFeatures}>
            {(isSplitting || isPreparingFeatures) && <Loader2 size={16} className="sci-spin" />}
            {isSplitting ? 'Đang chia 70/30...' : isPreparingFeatures ? 'Đang chuẩn bị Lag Features...' : 'Chia dữ liệu 70/30'}
          </button>}
        </div>
      </div>

      {(!hasSavedSplit || splitOutdated || (splitError && !shouldShowDetails)) && <div className="sci-card-body sci-experiment-split__summary">
        {splitOutdated && <div className="sci-warning" role="alert">Lag Features đã thay đổi. Hãy chia lại 70/30 trước khi chạy thí nghiệm mới.</div>}
        {!hasSavedSplit && activeSplitContext?.splitId && <div className="sci-notice">Thí nghiệm cũ vẫn dùng Split ID đã lưu. API hiện tại chưa hỗ trợ tải lại bảng Train/Test theo Split ID; hãy chia lại nếu cần xem bảng.</div>}
        {!hasSavedSplit && (canSplit ? (
          <p>Có <strong>{formatNumber(sampleCount)} mẫu Lag Features</strong> sẵn sàng để chia 70% Train và 30% Test.</p>
        ) : activeSplitContext?.splitId ? (
          <p>Bạn có thể dùng Split ID đã lưu để chạy thí nghiệm. Nhấn “Chia dữ liệu 70/30” nếu muốn tạo tập Train/Test mới.</p>
        ) : (
          <p>Nhấn “Chia dữ liệu 70/30” để hệ thống chuẩn bị Lag Features rồi chia tập Train/Test. Cần ít nhất 2 mẫu hợp lệ.</p>
        ))}
        {featureError && !hasSavedSplit && <div className="sci-warning" role="alert">Không thể chuẩn bị Lag Features: {featureError}</div>}
        {splitError && !shouldShowDetails && <div className="sci-warning" role="alert">{splitError}</div>}
      </div>}

      {shouldShowDetails && (
        <div className="sci-experiment-split__details">
          {isPreparingFeatures ? <div className="sci-state" role="status"><Loader2 size={18} className="sci-spin" /> Đang chuẩn bị Lag Features để chia dữ liệu...</div> : <TrainTestSplitPanel
            key={datasetKey}
            embedded
            featureData={featureData}
            splitData={splitData}
            isSplitting={isSplitting}
            splitError={splitError}
            onRunSplit={onRunSplit}
            onProceedToExperiment={onProceedToExperiment}
          />}
        </div>
      )}
    </section>
  )
}
