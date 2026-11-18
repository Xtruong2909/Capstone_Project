import { useState } from 'react'
import { Check, ChevronLeft, X } from 'lucide-react'
import { useShareSelection } from '../../../hooks/useShareSelection'

function toggleId(setter, id) {
  setter((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

export default function ShareSelectionModal({ onClose, onChanged }) {
  const { batches, loading, busy, error, share } = useShareSelection()
  const [groupId, setGroupId] = useState('')
  const [experimentIds, setExperimentIds] = useState(new Set())
  const [predictionIds, setPredictionIds] = useState(new Set())
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(false)
  const batch = batches.find((item) => item.group_id === groupId)
  const visibleBatches = batches.filter((item) => item.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))

  const chooseBatch = (id) => {
    setGroupId(id)
    setExperimentIds(new Set())
    setPredictionIds(new Set())
  }

  const submit = async () => {
    if (!batch) return
    const succeeded = await share({
      group_id: batch.group_id,
      experiment_ids: [...experimentIds],
      prediction_ids: [...predictionIds],
    })
    if (succeeded) {
      onChanged()
      onClose()
    } else setConfirming(false)
  }

  return <div className="share-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="share-modal share-modal--selection" role="dialog" aria-modal="true" aria-labelledby="share-selection-title">
      <header className="share-modal__head">
        <div><h2 id="share-selection-title">Chia sẻ kết quả</h2><p>Chọn batch để chia sẻ toàn bộ session, rồi chọn thí nghiệm và dự đoán cần chia sẻ.</p></div>
        <button type="button" className="share-icon-button" aria-label="Đóng" disabled={busy} onClick={onClose}><X size={20} /></button>
      </header>
      {error && <p className="share-error" role="alert">{error}</p>}
      {confirming && batch ? <div className="share-confirm">
        <h3>Xác nhận chia sẻ {batch.name}?</h3>
        <p>Người dùng nghiệp vụ sẽ xem được toàn bộ {batch.session_count} session trong {batch.dataset_count} dataset đã duyệt của batch này.</p>
        <p>Bạn đã chọn {experimentIds.size} thí nghiệm và {predictionIds.size} dự đoán.</p>
      </div> : <div className="share-selection-body">
        <div className="share-selection-step"><strong>1. Chọn batch</strong><span>Toàn bộ session trong batch sẽ được chia sẻ.</span></div>
        <input className="share-selection-search" type="search" aria-label="Tìm batch" placeholder="Tìm batch…" value={search} onChange={(event) => setSearch(event.target.value)} />
        {loading ? <p className="share-state">Đang tải batch…</p>
          : !visibleBatches.length ? <p className="share-state">Không có batch đã duyệt phù hợp.</p>
            : <div className="share-selection-batches">{visibleBatches.map((item) => <label key={item.group_id} className="share-resource-option">
              <input type="radio" name="share-batch" checked={groupId === item.group_id} onChange={() => chooseBatch(item.group_id)} />
              <span><strong>{item.name}</strong><small>{item.dataset_count} dataset · {item.session_count} session</small></span>
              {item.shared_dataset_count > 0 && <em>{item.is_shared ? 'Đã chia sẻ session' : `Đã chia sẻ ${item.shared_dataset_count}/${item.dataset_count} dataset`}</em>}
            </label>)}</div>}
        {batch && <>
          <div className="share-selection-step"><strong>2. Chọn thí nghiệm</strong><span>Chỉ thí nghiệm được đánh dấu mới được chia sẻ.</span></div>
          {!batch.experiments.length && <p className="share-selection-empty">Batch này chưa có thí nghiệm hoàn thành.</p>}
          {batch.experiments.map((experiment) => <div key={experiment.resource_id} className="share-selection-experiment">
            <label className={`share-resource-option${experiment.is_shared ? ' is-shared' : ''}`}>
              <input type="checkbox" checked={experimentIds.has(experiment.resource_id)} disabled={experiment.is_shared} onChange={() => toggleId(setExperimentIds, experiment.resource_id)} />
              <span><strong>{experiment.name}</strong></span>
              {experiment.is_shared && <em>Đã chia sẻ</em>}
            </label>
            {experiment.predictions.length > 0 && <div className="share-selection-predictions"><strong>3. Dự đoán của {experiment.name}</strong>
              {experiment.predictions.map((prediction) => <label key={prediction.resource_id} className={`share-resource-option${prediction.is_shared ? ' is-shared' : ''}`}>
                <input type="checkbox" checked={predictionIds.has(prediction.resource_id)} disabled={prediction.is_shared} onChange={() => toggleId(setPredictionIds, prediction.resource_id)} />
                <span><strong>{prediction.name}</strong></span>
                {prediction.is_shared && <em>Đã chia sẻ</em>}
              </label>)}
            </div>}
          </div>)}
        </>}
      </div>}
      <footer className="share-modal__foot"><span>{batch ? `${batch.session_count} session · ${experimentIds.size} thí nghiệm · ${predictionIds.size} dự đoán` : 'Chưa chọn batch'}</span><div>
        <button type="button" className="share-button share-button--light" disabled={busy} onClick={() => confirming ? setConfirming(false) : onClose()}>{confirming ? <><ChevronLeft size={16} /> Quay lại</> : 'Hủy'}</button>
        <button type="button" className="share-button share-button--primary" disabled={!batch || busy || (batch.is_shared && !experimentIds.size && !predictionIds.size)} onClick={() => confirming ? submit() : setConfirming(true)}>{busy ? 'Đang chia sẻ…' : confirming ? <><Check size={16} /> Xác nhận chia sẻ</> : 'Tiếp tục'}</button>
      </div></footer>
    </section>
  </div>
}
