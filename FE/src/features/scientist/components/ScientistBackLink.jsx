import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ScientistBackLink({ children, to }) {
  return <Link className="sci-back" to={to}>
    <span className="sci-back__icon" aria-hidden="true"><ArrowLeft size={16} /></span>
    <span>{children}</span>
  </Link>
}
