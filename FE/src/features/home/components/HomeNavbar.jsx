import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, X, LogIn } from 'lucide-react'
import Logo from './Logo'
import { NAV_LINKS } from '../homeContent'
import './HomeNavbar.css'

export default function HomeNavbar({ onSignIn }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Đóng menu mobile khi chuyển route
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  const handleSignIn = () => {
    setOpen(false)
    if (onSignIn) {
      onSignIn()
    } else {
      navigate('/login')
    }
  }

  const handleNavClick = (e, href) => {
    setOpen(false)
    if (location.pathname !== '/') {
      e.preventDefault()
      navigate('/' + href)
      setTimeout(() => {
        const id = href.replace('#', '')
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' })
        }
      }, 100)
    }
  }

  // Khi ở trang khác ngoài trang chủ (như /login, /forgot-password), navbar luôn hiển thị nền solid và border rõ ràng
  const isSolid = scrolled || location.pathname !== '/'

  return (
    <header className={`navbar ${isSolid ? 'navbar--scrolled' : ''}`}>
      <div className="container navbar__inner">
        <Logo />
        <nav className={`navbar__links ${open ? 'is-open' : ''}`} aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={location.pathname === '/' ? l.href : `/${l.href}`}
              onClick={(e) => handleNavClick(e, l.href)}
            >
              {l.label}
            </a>
          ))}
          <button className="btn btn--primary navbar__cta-mobile" onClick={handleSignIn}>
            Sign in
          </button>
        </nav>
        <button id="nav-sign-in" className="btn btn--primary navbar__cta" onClick={handleSignIn}>
          <LogIn size={16} /> Sign in
        </button>
        <button
          className="navbar__toggle"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>
  )
}

