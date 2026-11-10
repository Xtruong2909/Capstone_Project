import { Cpu, GitBranch, ShieldCheck } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import { MODELS } from '../homeContent'

export default function ModelsSection() {
  const { t } = useLanguage()
  return (
    <section className="section section--tint" id="models">
      <div className="container">
        {/* Section Header */}
        <div className="section__head">
          <span className="eyebrow">{t('Methodology & Machine Learning')}</span>
          <h2>{t('Multi-Model Traffic Flow Prediction Engine')}</h2>
          <p>
            {t('Benchmarking baseline persistence against non-linear Random Forest ensembles and sequential LSTM networks across 1, 3, and 5-minute time horizons.')}
          </p>
        </div>

        {/* Models Grid */}
        <div className="models-grid">
          {MODELS.map((m) => (
            <article className={`card model-card model-card--${m.id}`} key={m.id}>
              <div className="model-card__header">
                <div className="model-card__role-tag">
                  <span className={`pill pill--${m.complexityColor}`}>{t(m.role)}</span>
                  <span className="model-card__complexity">{t('Complexity:')} {t(m.complexity)}</span>
                </div>
                <h3>{t(m.name)}</h3>
              </div>

              <p className="model-card__desc">{t(m.desc)}</p>

              <div className="model-card__features">
                <small className="model-card__feature-title">{t('Input Feature Set:')}</small>
                <p className="model-card__feature-text">{t(m.inputs)}</p>
              </div>

              <div className="model-card__footer">
                <span className="model-card__badge">
                  <ShieldCheck size={14} /> {t('Chronological Split')}
                </span>
                <span className="model-card__metric-hint">
                  {t('Metric: MAE & RMSE')}
                </span>
              </div>
            </article>
          ))}
        </div>

        {/* Input Features & Validation Protocol Banner */}
        <div className="card validation-protocol-banner">
          <div className="validation-protocol-banner__col">
            <div className="protocol-icon-wrap">
              <GitBranch size={22} />
            </div>
            <div>
              <h4>{t('Chronological Train/Test Protocol')}</h4>
              <p>
                {t('Strictly splits trajectory data along chronological time slices rather than random shuffling, guaranteeing zero future data leakage when evaluating short-term flow forecasts.')}
              </p>
            </div>
          </div>
          <div className="validation-protocol-banner__col">
            <div className="protocol-icon-wrap protocol-icon-wrap--purple">
              <Cpu size={22} />
            </div>
            <div>
              <h4>{t('Lagged Multi-Feature Vectors')}</h4>
              <p>
                {t('Features combine 5-minute past traffic flows (t-1 to t-5), mean corridor velocity, active vehicle count, and minute-level temporal trends.')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
