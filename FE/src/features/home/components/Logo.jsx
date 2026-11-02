import { Link } from 'react-router-dom'

export default function Logo({ light = false }) {
  return (
    <Link
      to="/"
      onClick={(e) => {
        // Behave like F5: full page reload at the home page
        e.preventDefault()
        window.location.href = '/'
      }}
      className={`logo ${light ? 'logo--light' : ''}`} aria-label="Traffic Forecasting System home">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <rect x="3" y="15" width="6" height="12" rx="1.5" fill="#2b7bf0" />
        <rect x="12" y="9" width="6" height="18" rx="1.5" fill="#1668e3" />
        <rect x="21" y="3" width="6" height="24" rx="1.5" fill="#5aa0ff" />
      </svg>
      <span>Urban Traffic Analytics</span>
    </Link>
  )
}

