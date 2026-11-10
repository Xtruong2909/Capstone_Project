import { useState } from 'react'
import {
  SplitSquareVertical,
  Play,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { formatNumber, formatRecordingTime as formatShortTime } from '../utils/formatters'

const PAGE_SIZE = 15

function formatFlow(val) {
  if (val == null || Number.isNaN(Number(val))) return '—'
  const num = Number(val)
  return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

/**
 * Step 2: UI component for POST /api/train-test-split/training (70/30 Chronological Split)
 */
export default function TrainTestSplitPanel({
  embedded = false,
  featureData,
  splitData,
  isSplitting,
  splitError,
  onRunSplit,
  onProceedToExperiment,
  onBackToFeatures,
}) {
  const [activeTab, setActiveTab] = useState('train')
  const [page, setPage] = useState(1)
  const [copiedId, setCopiedId] = useState(false)
  const [confirmResplit, setConfirmResplit] = useState(false)

  const totalSamples =
    splitData?.total_samples ??
    featureData?.sample_count ??
    featureData?.samples?.length ??
    0
  const previewTrainCount = splitData?.train_count ?? Math.floor(totalSamples * 0.7)
  const previewTestCount = splitData?.test_count ?? Math.max(0, totalSamples - previewTrainCount)
  const canSplit = (featureData?.samples?.length ?? 0) >= 2

  const featureOrder = splitData?.feature_order ||
    featureData?.feature_order || ['lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5']
  const targetOrder = splitData?.target_order ||
    featureData?.target_order || ['target_h1', 'target_h3', 'target_h5']

  const handleSplitClick = async () => {
    if (splitData?.split_id && !confirmResplit) {
      setConfirmResplit(true)
      return
    }
    setConfirmResplit(false)
    setPage(1)
    await onRunSplit?.()
  }

  const handleCopySplitId = async () => {
    if (!splitData?.split_id) return
    try {
      await navigator.clipboard.writeText(String(splitData.split_id))
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    } catch {
      // Ignore clipboard failure
    }
  }

  const handleTabSwitch = (tab) => {
    setActiveTab(tab)
    setPage(1)
  }

  // Build rows for the currently active tab (train or test)
  const partitionRows = (() => {
    if (!splitData) return []
    const isTrain = activeTab === 'train'
    const xs = (isTrain ? splitData.X_train : splitData.X_test) || []
    const ys = (isTrain ? splitData.y_train : splitData.y_test) || []
    const times = (isTrain ? splitData.train_times : splitData.test_times) || []
    const historyStarts =
      (isTrain ? splitData.train_history_start_times : splitData.test_history_start_times) || []
    const targetTimes =
      (isTrain ? splitData.train_target_times : splitData.test_target_times) || []

    return xs.map((xRow, i) => ({
      index: i + 1,
      history_start_time: historyStarts[i],
      time_bucket: times[i],
      x: xRow || [],
      y: ys[i] || [],
      target_times: targetTimes[i] || {},
    }))
  })()

  const totalPages = Math.max(1, Math.ceil(partitionRows.length / PAGE_SIZE))
  const pagedRows = partitionRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const hasOverlap =
    Boolean(splitData?.temporal_overlap_warning) ||
    splitData?.official_evaluation_eligible === false

  return (
    <section className={`admin-card${embedded ? ' sci-split-panel--embedded' : ''}`}>
      {!embedded && <div className="admin-card__header">
        <div className="admin-card__header-left">
          <div className="admin-card__icon-box admin-card__icon-box--purple">
            <SplitSquareVertical size={18} />
          </div>
          <div>
            <h2 className="admin-card__title">
              Chia dữ liệu Train / Test (70/30)
            </h2>
            <p className="admin-card__subtitle">
              Chia dữ liệu chuỗi thời gian theo tỷ lệ 70% Train / 30% Test (Chronological) không xáo trộn thứ tự quan sát.
            </p>
          </div>
        </div>

        <div className="sci-train-actions">
          {onBackToFeatures && (
            <button
              type="button"
              className="btn-secondary sci-train-btn"
              onClick={onBackToFeatures}
            >
              <ArrowLeft size={16} />
              <span>Quay lại Lag Features</span>
            </button>
          )}

          {splitData?.split_id && onProceedToExperiment && (
            <button
              type="button"
              className="btn-action sci-train-btn sci-btn-emerald"
              onClick={onProceedToExperiment}
            >
              <span>Tiếp tục tạo thí nghiệm</span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>}

      <div className="sci-card-body">
        {/* Compact Split Configuration & Visual 70/30 Ratio Box */}
        <div className="sci-split-config-box">
          <div className="sci-split-config-box__top">
            <div className="sci-split-config-box__metrics">
              <div className="sci-split-stat">
                <span className="sci-split-stat__label">Tổng số mẫu</span>
                <strong className="sci-split-stat__val">{formatNumber(totalSamples)} mẫu</strong>
              </div>
              <div className="sci-split-stat">
                <span className="sci-split-stat__label">Phương pháp</span>
                <strong className="sci-split-stat__val">Theo thời gian (Chronological)</strong>
              </div>
              {!embedded && <div className="sci-split-stat">
                <span className="sci-split-stat__label">Tỷ lệ phân chia</span>
                <strong className="sci-split-stat__val">Train 70% / Test 30%</strong>
              </div>}
            </div>

            <button
              type="button"
              className="btn-action btn-action--primary sci-train-btn"
              onClick={handleSplitClick}
              disabled={isSplitting || !canSplit}
            >
              {isSplitting ? (
                <Loader2 size={16} className="sci-spin" />
              ) : (
                <Play size={16} />
              )}
              <span>
                {isSplitting ? 'Đang chia dữ liệu 70/30...' : confirmResplit ? 'Xác nhận chia lại' : splitData?.split_id ? 'Chia lại dữ liệu 70/30' : 'Chia dữ liệu 70/30'}
              </span>
            </button>
          </div>
          {confirmResplit && <div className="sci-warning" role="alert">Chia lại sẽ tạo Split ID mới. Các thí nghiệm cũ vẫn gắn với Split ID trước đó và không thể so sánh trực tiếp với thí nghiệm mới. Nhấn “Xác nhận chia lại” để tiếp tục, hoặc <button type="button" className="sci-inline-link" onClick={() => setConfirmResplit(false)}>Hủy</button>.</div>}
          {!canSplit && !isSplitting && <p className="sci-workspace-help">Cần ít nhất 2 mẫu Lag Features từ mục trước để chia Train/Test. Tập đã lưu vẫn có thể xem bên dưới.</p>}

          {!embedded && <div className="sci-split-ratio-visual">
            <div className="sci-split-ratio-visual__labels">
              <span className="sci-split-ratio-visual__train">
                <strong>Train 70%</strong> · {formatNumber(previewTrainCount)} mẫu
              </span>
              <span className="sci-split-ratio-visual__test">
                <strong>Test 30%</strong> · {formatNumber(previewTestCount)} mẫu
              </span>
            </div>
            <div className="sci-split-ratio-bar">
              <div
                className="sci-split-ratio-bar__train"
                style={{ width: '70%' }}
                title={`Train 70%: ${previewTrainCount} mẫu`}
              />
              <div
                className="sci-split-ratio-bar__test"
                style={{ width: '30%' }}
                title={`Test 30%: ${previewTestCount} mẫu`}
              />
            </div>
          </div>}
        </div>

        {splitError && (
          <div className="sci-state sci-state--error">
            <p style={{ margin: 0, fontWeight: 700 }}>{splitError}</p>
          </div>
        )}

        {!splitData && !isSplitting && !splitError && (
          <div className="sci-state">
            <SplitSquareVertical size={34} style={{ marginBottom: '0.5rem', color: '#94a3b8' }} />
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>
              Sẵn sàng chia dữ liệu Train / Test 70/30
            </div>
            <div style={{ fontSize: '0.84rem' }}>
              Nhấn nút <strong>&ldquo;Chia dữ liệu 70/30&rdquo;</strong> ở trên để tách{' '}
              <strong>{formatNumber(totalSamples)} mẫu</strong> thành{' '}
              <strong>{formatNumber(previewTrainCount)} mẫu Train</strong> và{' '}
              <strong>{formatNumber(previewTestCount)} mẫu Test</strong>.
            </div>
          </div>
        )}

        {splitData && (
          <>
            {!embedded && <div className="sci-split-ref-bar">
              <div className="sci-split-ref-bar__id">
                <span className="sci-split-ref-bar__label">Mã tham chiếu Split ID:</span>
                <code className="sci-mono sci-split-code">{splitData.split_id}</code>
                <button
                  type="button"
                  className="sci-copy-btn"
                  onClick={handleCopySplitId}
                  title="Sao chép Split ID"
                >
                  {copiedId ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedId ? 'Đã sao chép' : 'Sao chép'}</span>
                </button>
                <span className="sci-split-ref-bar__auto-note">
                  (Tự động truyền sang bước tạo thí nghiệm)
                </span>
              </div>

              <div className="sci-split-ref-bar__status">
                {hasOverlap ? (
                  <span className="sci-eval-badge sci-eval-badge--exploratory">
                    <AlertTriangle size={14} />
                    <span>Chỉ dùng để đánh giá thử nghiệm</span>
                  </span>
                ) : (
                  <span className="sci-eval-badge sci-eval-badge--official">
                    <CheckCircle2 size={14} />
                    <span>Đủ điều kiện đánh giá chính thức</span>
                  </span>
                )}
              </div>
            </div>}

            {hasOverlap && (
              <div className="sci-warning">
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Chỉ dùng để đánh giá thử nghiệm.</strong>{' '}
                  Mốc mục tiêu của Train giao với cửa sổ lịch sử của Test. Vẫn có thể huấn luyện, xem MAE/RMSE và so sánh, nhưng kết quả không được xem là đánh giá chính thức.
                </div>
              </div>
            )}

            {/* Two Tabs: Train vs Test */}
            <div className="sci-split-tabs-bar">
              <div className="sci-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'train'}
                  className={activeTab === 'train' ? 'active' : ''}
                  onClick={() => handleTabSwitch('train')}
                >
                  Train — {formatNumber(splitData.train_count)} mẫu
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'test'}
                  className={activeTab === 'test' ? 'active' : ''}
                  onClick={() => handleTabSwitch('test')}
                >
                  Test — {formatNumber(splitData.test_count)} mẫu
                </button>
              </div>

              <span className="sci-split-tabs-bar__summary">
                Đang xem tập <strong>{activeTab === 'train' ? 'Train (70%)' : 'Test (30%)'}</strong>:{' '}
                thời gian quan sát, 5 đặc trưng trễ (lag_1..lag_5) và 3 nhãn mục tiêu (+1, +3, +5 phút).
              </span>
            </div>

            {/* Train / Test Table */}
            <div className="sci-table-wrap">
              <table className="sci-table">
                <thead>
                  <tr>
                    <th style={{ width: '48px', textAlign: 'center' }}>#</th>
                    <th>History Start (t-4)</th>
                    <th>Time Bucket (t)</th>
                    {featureOrder.map((f, i) => (
                      <th key={f} className="sci-th-x">
                        {f} ({i === 0 ? 't' : `t-${i}`})
                      </th>
                    ))}
                    {targetOrder.map((tKey, i) => {
                      const h = [1, 3, 5][i]
                      return (
                        <th key={tKey} className="sci-th-y">
                          {tKey} (+{h}m)
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={`${activeTab}-${row.index}-${row.time_bucket}`}>
                      <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 700 }}>
                        {row.index}
                      </td>
                      <td>{formatShortTime(row.history_start_time)}</td>
                      <td style={{ fontWeight: 700 }}>{formatShortTime(row.time_bucket)}</td>
                      {featureOrder.map((f, i) => (
                        <td key={f} className="sci-td-x">
                          {formatFlow(row.x[i])}
                        </td>
                      ))}
                      {targetOrder.map((tKey, i) => (
                        <td key={tKey} className="sci-td-y">
                          <strong>{formatFlow(row.y[i])}</strong>
                          {row.target_times?.[tKey] && (
                            <span className="sci-td-time">
                              {formatShortTime(row.target_times[tKey])}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination if needed */}
            {partitionRows.length > PAGE_SIZE && (
              <div className="sci-pager">
                <span>
                  Hiển thị mẫu{' '}
                  <strong>
                    {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, partitionRows.length)}
                  </strong>{' '}
                  trên <strong>{formatNumber(partitionRows.length)}</strong> mẫu ({activeTab.toUpperCase()})
                </span>
                <div className="sci-pager__controls">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={14} /> Trước
                  </button>
                  <span style={{ fontWeight: 600, padding: '0 0.4rem' }}>
                    Trang {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Sau <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Action Footer: Tiếp tục tạo thí nghiệm */}
            {onProceedToExperiment && !embedded && (
              <div className="sci-step-footer">
                <div className="sci-step-footer__hint">
                  <CheckCircle2 size={15} style={{ color: '#15803d' }} />
                  <span>
                    Đã lưu Split (<strong>{splitData.train_count} Train / {splitData.test_count} Test</strong>).
                    Nhấn tiếp tục để cấu hình tham số Random Forest và chạy thí nghiệm.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-action btn-action--primary sci-train-btn"
                  onClick={onProceedToExperiment}
                >
                  <span>Tiếp tục tạo thí nghiệm</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

