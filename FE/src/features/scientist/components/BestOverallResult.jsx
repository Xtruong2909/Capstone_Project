import { Eye, Rocket, Trophy } from 'lucide-react'

const metric = (value) => value == null ? '—' : Number(value).toFixed(2)

export default function BestOverallResult({ result, onViewExperiment, onUseForPrediction }) {
  const best = result?.best_overall
  const winner = result?.experiments?.find((item) => String(item.experiment_id) === String(best?.selected_experiment_id))
  if (!best || !winner) return null
  const experiments = new Map(result.experiments.map((item) => [String(item.experiment_id), item]))
  return <>
    <section className="sci-best-overall" aria-label="Best Overall">
      <div className="sci-best-overall__heading">
        <div><span className="sci-best-overall__eyebrow"><Trophy size={17} />BEST OVERALL · RANDOM FOREST</span><h3>{winner.experiment_name}</h3><p>RMSE trung bình thấp nhất trên cả 3 horizon +1, +3, +5 phút</p></div>
        <div className="sci-best-overall__score"><strong>{metric(best.average_rmse)}</strong><span>Average Test RMSE</span></div>
      </div>
      <div className="sci-best-overall__details">
        <span><strong>{winner.hyperparameters.n_estimators}</strong> cây · Độ sâu tối đa <strong>{winner.hyperparameters.max_depth ?? 'không giới hạn'}</strong></span>
        <span>Average Test MAE: <strong>{metric(best.average_mae)}</strong></span>
        <span>{best.ranking.length} thí nghiệm đã chọn · Cùng Split</span>
      </div>
      <div className="sci-best-overall__formula">Average RMSE = (RMSE +1 + RMSE +3 + RMSE +5) / 3. Khi bằng nhau: Average MAE → thời gian dự báo.</div>
      <div className="sci-best-overall__footer">
        <span>{best.selection_saved ? 'Đã lưu lựa chọn thí nghiệm và 3 mô hình theo horizon.' : ''}{best.excluded_experiment_ids?.length > 0 ? ` Bỏ qua ${best.excluded_experiment_ids.length} thí nghiệm thiếu kết quả hoặc mô hình hợp lệ.` : ''}</span>
        <div className="sci-train-actions">
          {onViewExperiment && <button type="button" className="btn-secondary sci-train-btn" onClick={() => onViewExperiment(winner.experiment_id)}><Eye size={15} />Chi tiết thí nghiệm</button>}
          {onUseForPrediction && Object.keys(best.selected_model_ids || {}).length === 3 && <button type="button" className="btn-action btn-action--primary sci-train-btn" onClick={() => onUseForPrediction(winner)}><Rocket size={15} />Dùng Best Overall để dự báo</button>}
        </div>
      </div>
    </section>
    <section className="admin-card">
      <div className="admin-card__header"><div><h2 className="admin-card__title">Bảng xếp hạng Best Overall</h2><p className="admin-card__subtitle">Xếp tăng dần theo RMSE trung bình của đủ 3 horizon.</p></div></div>
      <div className="sci-table-wrap"><table className="sci-table">
        <thead><tr>{['Hạng', 'Thí nghiệm', 'RMSE +1', 'RMSE +3', 'RMSE +5', 'Average Test RMSE', 'Average Test MAE', 'Dự báo (ms)'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{best.ranking.map((score, index) => {
          const experiment = experiments.get(String(score.experiment_id))
          return <tr key={score.experiment_id} className={index === 0 ? 'sci-best-overall-row' : ''}>
            <td>{index === 0 ? <span className="sci-compare-best-badge"><Trophy size={12} />1</span> : index + 1}</td>
            <td><strong>{score.experiment_name}</strong></td>
            {[1, 3, 5].map((horizon) => <td key={horizon}>{metric(experiment?.performance_by_model_and_horizon?.RANDOM_FOREST?.[horizon]?.rmse)}</td>)}
            <td><strong>{metric(score.average_rmse)}</strong></td><td>{metric(score.average_mae)}</td><td>{metric(score.prediction_time_ms)}</td>
          </tr>
        })}</tbody>
      </table></div>
    </section>
  </>
}
