import { useEffect, useState } from 'react'
import { Menu, X, LogIn } from 'lucide-react'
import Logo from './Logo'
import { NAV_LINKS } from '../homeContent'

export default function HomeNavbar({ onSignIn }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="container navbar__inner">
        <Logo />
        <nav className={`navbar__links ${open ? 'is-open' : ''}`} aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
          ))}
          <button className="btn btn--primary navbar__cta-mobile" onClick={onSignIn}>Sign in</button>
        </nav>
        <button id="nav-sign-in" className="btn btn--primary navbar__cta" onClick={onSignIn}>
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
