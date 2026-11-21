import { SlidersHorizontal } from 'lucide-react'

export default function PredictionExperimentConfiguration({ experiment }) {
  const hyperparameters = experiment.hyperparameters || {}
  const values = [
    ['Số cây (n_estimators)', hyperparameters.n_estimators ?? '—'],
    ['Độ sâu tối đa (max_depth)', hyperparameters.max_depth === null ? 'Không giới hạn' : hyperparameters.max_depth ?? '—'],
    ['Chia nhánh tối thiểu (min_samples_split)', hyperparameters.min_samples_split ?? '—'],
    ['Mẫu nút lá tối thiểu (min_samples_leaf)', hyperparameters.min_samples_leaf ?? '—'],
    ['Số đặc trưng mỗi lần chia (max_features)', hyperparameters.max_features == null ? 'Mặc định' : String(hyperparameters.max_features)],
    ['Hạt giống (random_state)', hyperparameters.random_state ?? '—'],
    ['Lấy mẫu bootstrap', typeof hyperparameters.bootstrap === 'boolean' ? hyperparameters.bootstrap ? 'Bật' : 'Tắt' : '—'],
  ]

  return <section className="sci-prediction-experiment-config" aria-label={`Cấu hình thí nghiệm ${experiment.experiment_name}`}>
    <div className="sci-prediction-experiment-config__heading">
      <SlidersHorizontal size={17} />
      <div><h3>Cấu hình Random Forest</h3><p>{experiment.experiment_name}</p></div>
    </div>
    <div className="sci-rf-summary-grid">
      {values.map(([label, value]) => <div className="sci-rf-summary-cell" key={label}>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>)}
    </div>
  </section>
}
