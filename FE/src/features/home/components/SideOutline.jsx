import { useEffect, useState } from 'react'
import { NAV_LINKS } from '../homeContent'
import './SideOutline.css'

// Google Docs-style outline on the left: click an item to scroll to that section.
export default function SideOutline() {
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    const ids = NAV_LINKS.map((l) => l.href.replace('#', ''))
    const onScroll = () => {
      const offset = window.innerHeight * 0.35
      let current = ''
      ids.forEach((id) => {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= offset) current = id
      })
      setActiveId(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleClick = (e, href) => {
    e.preventDefault()
    const el = document.getElementById(href.replace('#', ''))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className="side-outline" aria-label="Page outline">
      <ul>
        {NAV_LINKS.map((l) => {
          const id = l.href.replace('#', '')
          return (
            <li key={l.href}>
              <a
                href={l.href}
                className={activeId === id ? 'is-active' : ''}
                onClick={(e) => handleClick(e, l.href)}
              >
                {l.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
