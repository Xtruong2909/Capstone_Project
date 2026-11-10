import { ArrowRight } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import Logo from './Logo'

export function CtaSection({ onSignIn }) {
  const { t } = useLanguage()
  return (
    <section className="container cta-wrap">
      <div className="cta">
        <div>
          <h2>{t('Ready to analyze UAV traffic and forecast short-term flow?')}</h2>
          <p>
            {t('Experience high-resolution trajectory analytics, compare Random Forest against baseline persistence, and monitor 1, 3, and 5-minute traffic flows on an interactive dashboard.')}
          </p>
        </div>
        <button id="cta-sign-in" className="btn btn--white btn--lg" onClick={onSignIn}>
          {t('Launch Platform')} <ArrowRight size={18} />
        </button>
      </div>
    </section>
  )
}

export function HomeFooter() {
  const { t } = useLanguage()
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <Logo light />
        <div className="footer__center">
          <p className="footer__project">
            {t('UAV-Based Urban Traffic Analysis & Short-Term Traffic Flow Prediction')}
          </p>
          <small className="footer__meta">
            {t('Data Analytics • Machine Learning • FPT University Ho Chi Minh City')}
          </small>
        </div>
        <p className="footer__copy">
          © {new Date().getFullYear()} UAV Traffic Flow Platform
        </p>
      </div>
    </footer>
  )
}
