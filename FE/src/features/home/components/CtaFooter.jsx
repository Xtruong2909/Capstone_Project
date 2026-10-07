import { ArrowRight } from 'lucide-react'
import Logo from './Logo'

export function CtaSection({ onSignIn }) {
  return (
    <section className="container cta-wrap">
      <div className="cta">
        <div>
          <h2>Ready to forecast your city's traffic?</h2>
          <p>Sign in to access your role-based dashboard and start your first experiment.</p>
        </div>
        <button id="cta-sign-in" className="btn btn--white btn--lg" onClick={onSignIn}>
          Sign in <ArrowRight size={18} />
        </button>
      </div>
    </section>
  )
}

export function HomeFooter() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <Logo light />
        <p>Capstone Project FA26SE155 · FPT University Ho Chi Minh City</p>
        <p>© {new Date().getFullYear()} Traffic Forecasting System</p>
      </div>
    </footer>
  )
}
