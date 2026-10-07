import { ArrowRight, PlayCircle } from 'lucide-react'
import DashboardMockup from './DashboardMockup'

export default function HeroSection({ onSignIn }) {
  return (
    <section className="hero" id="top">
      <div className="container hero__inner">
        <div className="hero__copy">
          <span className="eyebrow">Urban Traffic Analytics Platform</span>
          <h1>
            Analyze urban traffic and <span className="grad">forecast congestion</span> in minutes
          </h1>
          <p className="hero__lead">
            A unified web platform to manage traffic datasets, uncover spatial-temporal patterns,
            and predict short-term congestion with ARIMA and Prophet.
          </p>
          <div className="hero__actions">
            <button id="hero-get-started" className="btn btn--primary btn--lg" onClick={onSignIn}>
              Get started <ArrowRight size={18} />
            </button>
            <a href="#workflow" className="btn btn--ghost btn--lg">
              <PlayCircle size={18} /> See how it works
            </a>
          </div>
        </div>
        <div className="hero__visual">
          <DashboardMockup />
        </div>
      </div>
    </section>
  )
}
