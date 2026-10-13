import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Shield,
  Database,
  Clock,
  ScrollText,
  Server,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import apiClient from '../../../services/apiClient'

export default function AdminOverview() {
  const [stats, setStats] = useState(null)
  const [dbStatus, setDbStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [statsData, dbHealth] = await Promise.all([
        adminService.getStats(),
        apiClient.get('/health/db').catch(() => ({ data: { status: 'disconnected' } })),
      ])
      setStats(statsData)
      setDbStatus(dbHealth.data)
    } catch (err) {
      setError('Không thể tải dữ liệu thống kê từ hệ thống.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  if (isLoading) {
    return (
      <div className="empty-state">
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem', color: '#60a5fa' }} />
        <p>Đang tải dữ liệu tổng quan hệ thống...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty-state">
        <AlertCircle size={28} style={{ margin: '0 auto 1rem', color: '#f87171' }} />
        <p>{error}</p>
        <button
          type="button"
          className="btn-action btn-action--primary"
          style={{ marginTop: '1rem' }}
          onClick={fetchData}
        >
          Thử lại
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* KPI Stats Grid - 100% Real DB counts */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--blue">
            <Users size={24} />
          </div>
          <div className="stat-card__info">
            <h3>{stats?.total_users ?? 0}</h3>
            <p>Người dùng hệ thống</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--purple">
            <Shield size={24} />
          </div>
          <div className="stat-card__info">
            <h3>{stats?.total_roles ?? 0}</h3>
            <p>Vai trò chuẩn hóa</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--green">
            <Database size={24} />
          </div>
          <div className="stat-card__info">
            <h3>{stats?.total_datasets ?? 0}</h3>
            <p>Bộ dữ liệu UAV</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--amber">
            <Clock size={24} />
          </div>
          <div className="stat-card__info">
            <h3>{stats?.pending_approvals ?? 0}</h3>
            <p>Chờ phê duyệt</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon stat-card__icon--rose">
            <ScrollText size={24} />
          </div>
          <div className="stat-card__info">
            <h3>{stats?.total_audit_logs ?? 0}</h3>
            <p>Nhật ký kiểm toán</p>
          </div>
        </div>
      </div>

      {/* System Infrastructure Health Card */}
      <div className="admin-card">
        <div className="admin-card__header">
          <h3 className="admin-card__title">Trạng thái hạ tầng hệ thống</h3>
          <button
            type="button"
            className="btn-action btn-action--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={fetchData}
          >
            <RefreshCw size={14} />
            <span>Làm mới</span>
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <div style={{ background: '#f8fafc', padding: '1.1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
              <Server size={20} color="#2563eb" />
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>PostgreSQL 16 + PostGIS 3.4</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`badge ${dbStatus?.status === 'connected' ? 'badge--active' : 'badge--inactive'}`}>
                {dbStatus?.status === 'connected' ? 'Đã kết nối' : 'Mất kết nối'}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Container: capstone_postgres</span>
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '1.1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
              <Server size={20} color="#16a34a" />
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>FastAPI Backend Service</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge--active">Đang hoạt động</span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Port: 8000 (v1/api)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Navigation Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div className="admin-card__header">
            <h3 className="admin-card__title">Quản lý tài khoản & phân quyền</h3>
          </div>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem' }}>
              Xem danh sách người dùng, kích hoạt hoặc vô hiệu hóa tài khoản và quản lý vai trò.
            </p>
            <Link to="/admin/users" className="btn-action btn-action--primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
              Đến trang quản lý người dùng →
            </Link>
          </div>
        </div>

        <div className="admin-card" style={{ marginBottom: 0 }}>
          <div className="admin-card__header">
            <h3 className="admin-card__title">Phê duyệt Dataset từ Data Engineer</h3>
          </div>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem' }}>
              Kiểm tra các phiên bản dataset pNEUMA / UAV mới được làm sạch trước khi cho phép Data Scientist sử dụng.
            </p>
            <Link to="/admin/datasets" className="btn-action btn-action--primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
              Xem danh sách phê duyệt →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
