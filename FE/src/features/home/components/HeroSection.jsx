import { ArrowRight, PlayCircle, Clock, Cpu, BarChart2, CheckCircle2 } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import DashboardMockup from './DashboardMockup'

export default function HeroSection({ onSignIn }) {
  const { t } = useLanguage()
  return (
    <section className="hero" id="overview">
      <div className="container hero__inner">
        <div className="hero__copy">
          <div className="hero__badge-row">
            <span className="eyebrow">{t('Data Analytics • Machine Learning')}</span>
          </div>

          <h1>
            {t('UAV-Based Urban Traffic Analysis &')} <span className="grad">{t('Short-Term Flow Prediction')}</span>
          </h1>

          <p className="hero__lead">
            {t('An applied platform extracting vehicle trajectories from drone data (pNEUMA), resampling microscopic flows into 1–5 minute time series, and forecasting immediate urban traffic volume using Random Forest and LSTM architectures.')}
          </p>

          <div className="hero__actions">
            <button id="hero-get-started" className="btn btn--primary btn--lg" onClick={onSignIn}>
              {t('Access Platform')} <ArrowRight size={18} />
            </button>
            <a href="#workflow" className="btn btn--ghost btn--lg">
              <PlayCircle size={18} /> {t('How the Pipeline Works')}
            </a>
          </div>

          {/* Quick Highlight Metrics based on project specs */}
          <div className="hero__highlights">
            <div className="hero__highlight-item">
              <span className="hero__highlight-icon"><Clock size={16} /></span>
              <div>
                <strong>{t('1, 3 & 5 Min')}</strong>
                <small>{t('Forecasting Horizons')}</small>
              </div>
            </div>
            <div className="hero__highlight-item">
              <span className="hero__highlight-icon"><Cpu size={16} /></span>
              <div>
                <strong>{t('Random Forest & LSTM')}</strong>
                <small>{t('Predictive Engine')}</small>
              </div>
            </div>
            <div className="hero__highlight-item">
              <span className="hero__highlight-icon"><BarChart2 size={16} /></span>
              <div>
                <strong>{t('pNEUMA Benchmark')}</strong>
                <small>{t('Athens UAV Trajectories')}</small>
              </div>
            </div>
            <div className="hero__highlight-item">
              <span className="hero__highlight-icon"><CheckCircle2 size={16} /></span>
              <div>
                <strong>{t('MAE & RMSE')}</strong>
                <small>{t('No Lookahead Leakage')}</small>
              </div>
            </div>
          </div>
        </div>

        <div className="hero__visual">
          <DashboardMockup />
        </div>
      </div>
    </section>
  )
}
