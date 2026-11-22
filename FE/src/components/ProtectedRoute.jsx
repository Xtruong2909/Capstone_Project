import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { PASSWORD_CHANGE_PATH } from '../services/authSession'

export default function ProtectedRoute({ allowedRoles = [] }) {
  const { isAuthenticated, role, isLoading, mustChangePassword, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0f172a', color: '#94a3b8' }}>
        <p>Đang tải thông tin xác thực...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (mustChangePassword) return <Navigate to={PASSWORD_CHANGE_PATH} replace />

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    const roleRoutes = {
      admin: '/admin',
      data_engineer: '/engineer',
      data_scientist: '/scientist',
      business_user: '/business',
    }
    const targetRoute = roleRoutes[role] || '/'
    return <Navigate to={targetRoute} replace />
  }

  return <Outlet key={user?.id} />
}
