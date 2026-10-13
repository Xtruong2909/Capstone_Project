import { ArrowRight, PlayCircle, Clock, Cpu, BarChart2, CheckCircle2 } from 'lucide-react'
import DashboardMockup from './DashboardMockup'

export default function HeroSection({ onSignIn }) {
  return (
    <section className="hero" id="overview">
      <div className="container hero__inner">
        <div className="hero__copy">
          <div className="hero__badge-row">
            <span className="eyebrow">Data Analytics • Machine Learning</span>
          </div>

          <h1>
            UAV-Based Urban Traffic Analysis &amp;{' '}
            <span className="grad">Short-Term Flow Prediction</span>
          </h1>

          <p className="hero__lead">
            An applied platform extracting vehicle trajectories from drone data (pNEUMA),
            resampling microscopic flows into 1–5 minute time series, and forecasting
            immediate urban traffic volume using Random Forest and LSTM architectures.
          </p>

          <div className="hero__actions">
            <button id="hero-get-started" className="btn btn--primary btn--lg" onClick={onSignIn}>
              Access Platform <ArrowRight size={18} />
            </button>
            <a href="#workflow" className="btn btn--ghost btn--lg">
              <PlayCircle size={18} /> How the Pipeline Works
            </a>
          </div>

          {/* Quick Highlight Metrics based on project specs */}
          <div className="hero__highlights">
            <div className="hero__highlight-item">
              <span className="hero__highlight-icon"><Clock size={16} /></span>
              <div>
                <strong>1, 3 &amp; 5 Min</strong>
                <small>Forecasting Horizons</small>
              </div>
            </div>
            <div className="hero__highlight-item">
              <span className="hero__highlight-icon"><Cpu size={16} /></span>
              <div>
                <strong>Random Forest &amp; LSTM</strong>
                <small>Predictive Engine</small>
              </div>
            </div>
            <div className="hero__highlight-item">
              <span className="hero__highlight-icon"><BarChart2 size={16} /></span>
              <div>
                <strong>pNEUMA Benchmark</strong>
                <small>Athens UAV Trajectories</small>
              </div>
            </div>
            <div className="hero__highlight-item">
              <span className="hero__highlight-icon"><CheckCircle2 size={16} /></span>
              <div>
                <strong>MAE &amp; RMSE</strong>
                <small>No Lookahead Leakage</small>
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
