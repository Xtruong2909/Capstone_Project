import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './components/MainLayout'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './features/home/HomePage'
import LoginPage from './features/auth/LoginPage'
import ForgotPasswordPage from './features/auth/ForgotPasswordPage'

// Admin features
import AdminLayout from './features/admin/AdminLayout'
import AdminOverview from './features/admin/pages/AdminOverview'
import AdminUsersPage from './features/admin/pages/AdminUsersPage'
import AdminDatasetsPage from './features/admin/pages/AdminDatasetsPage'
import AdminAvailableDatasetsPage from './features/admin/pages/AdminAvailableDatasetsPage'
import AdminAuditLogsPage from './features/admin/pages/AdminAuditLogsPage'

// Data Engineer features
import EngineerLayout from './features/engineer/EngineerLayout'
import EngineerOverviewPage from './features/engineer/pages/EngineerOverviewPage'
import EngineerCatalogPage from './features/engineer/pages/EngineerCatalogPage'
import EngineerUploadPage from './features/engineer/pages/EngineerUploadPage'
import EngineerPreviewPage from './features/engineer/pages/EngineerPreviewPage'
import EngineerPipelineStudioPage from './features/engineer/pages/EngineerPipelineStudioPage'

// Other role workspaces
import RoleDashboardPage from './features/roles/RoleDashboardPage'

export default function App() {
  return (
    <Routes>
      {/* Public Pages */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      {/* Admin Portal (Protected: only 'admin' role) */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminOverview />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="datasets" element={<AdminDatasetsPage />} />
          <Route path="datasets-available" element={<AdminAvailableDatasetsPage />} />
          <Route path="audit-logs" element={<AdminAuditLogsPage />} />
        </Route>
      </Route>

      {/* Data Engineer Workspace (Protected: only 'data_engineer' role) */}
      <Route element={<ProtectedRoute allowedRoles={['data_engineer']} />}>
        <Route path="/engineer" element={<EngineerLayout />}>
          <Route index element={<EngineerOverviewPage />} />
          <Route path="datasets" element={<EngineerCatalogPage />} />
          <Route path="upload" element={<EngineerUploadPage />} />
          <Route path="preview" element={<EngineerPreviewPage />} />
          <Route path="pipeline-studio" element={<EngineerPipelineStudioPage />} />
        </Route>
      </Route>

      {/* Data Scientist Workspace */}
      <Route element={<ProtectedRoute allowedRoles={['data_scientist']} />}>
        <Route
          path="/scientist"
          element={
            <RoleDashboardPage
              roleTitle="Data Scientist Workspace"
              roleCode="data_scientist"
              description="Không gian dành cho Nhà khoa học dữ liệu: Khai thác dataset đã được phê duyệt, tạo chuỗi thời gian 1m/5m, cấu hình & huấn luyện mô hình dự báo Random Forest / LSTM và đánh giá sai số MAE, RMSE."
            />
          }
        />
      </Route>

      {/* Business User Portal */}
      <Route element={<ProtectedRoute allowedRoles={['business_user']} />}>
        <Route
          path="/business"
          element={
            <RoleDashboardPage
              roleTitle="Business User Portal"
              roleCode="business_user"
              description="Cổng thông tin dành cho Người dùng nghiệp vụ: Theo dõi Dashboard lưu lượng, vận tốc, mật độ giao thông, so sánh kết quả thực tế với dự báo và xuất báo cáo PDF / Excel."
            />
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
