import { useNavigate } from 'react-router-dom'
import { LogOut, Shield, Database, TrendingUp, BarChart3, UserCheck } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

export default function RoleDashboardPage({ roleTitle, roleCode, description }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const getRoleIcon = () => {
    switch (roleCode) {
      case 'data_engineer': return <Database size={32} color="#60a5fa" />
      case 'data_scientist': return <TrendingUp size={32} color="#c084fc" />
      case 'business_user': return <BarChart3 size={32} color="#4ade80" />
      default: return <UserCheck size={32} color="#fbbf24" />
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b1120', color: '#f8fafc', padding: '2rem' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '48px', height: '48px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {getRoleIcon()}
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 700 }}>{roleTitle}</h1>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Không gian làm việc chuyên biệt</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1rem',
              background: 'transparent',
              border: '1px solid #334155',
              color: '#f87171',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            <LogOut size={16} />
            <span>Đăng xuất</span>
          </button>
        </header>

        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', marginTop: 0, marginBottom: '0.75rem', color: '#f8fafc' }}>
            Xin chào, {user?.full_name || 'Người dùng'}!
          </h2>
          <p style={{ color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
            {description}
          </p>
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#0f172a', borderRadius: '8px', border: '1px solid #334155', display: 'inline-block' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Tài khoản đang đăng nhập: </span>
            <strong style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>{user?.email}</strong>
            <span style={{ margin: '0 0.5rem', color: '#475569' }}>•</span>
            <span style={{ fontSize: '0.8rem', color: '#60a5fa' }}>Vai trò: {roleCode}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
