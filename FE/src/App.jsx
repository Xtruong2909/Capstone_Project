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

// Data Scientist features
import ScientistLayout from './features/scientist/ScientistLayout'
import ScientistOverviewPage from './features/scientist/pages/ScientistOverviewPage'
import ScientistApprovedDatasetsPage from './features/scientist/pages/ScientistApprovedDatasetsPage'
import ScientistDatasetSessionsPage from './features/scientist/pages/ScientistDatasetSessionsPage'
import ScientistDatasetPreviewPage from './features/scientist/pages/ScientistDatasetPreviewPage'
import ScientistTrainingPage from './features/scientist/pages/ScientistTrainingPage'
import ScientistAggregationChartsPage from './features/scientist/pages/ScientistAggregationChartsPage'
import ScientistPredictionPage from './features/scientist/pages/ScientistPredictionPage'
import ScientistForecastDetailPage from './features/scientist/pages/ScientistForecastDetailPage'
import ScientistExperimentsPage from './features/scientist/pages/ScientistExperimentsPage'
import ScientistExperimentComparisonPage from './features/scientist/pages/ScientistExperimentComparisonPage'
import ScientistExperimentSetupPage from './features/scientist/pages/ScientistExperimentSetupPage'
import ScientistSharesPage from './features/scientist/pages/ScientistSharesPage'
import BusinessSharedResultsPage from './features/business/pages/BusinessSharedResultsPage'

// Other role workspaces

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
        <Route path="/scientist" element={<ScientistLayout />}>
          <Route index element={<ScientistOverviewPage />} />
          <Route path="datasets" element={<ScientistApprovedDatasetsPage />} />
          <Route path="datasets/groups/:groupId" element={<ScientistApprovedDatasetsPage />} />
          <Route path="datasets/groups/:groupId/train" element={<ScientistTrainingPage />} />
          <Route path="datasets/groups/:groupId/train/aggregation-charts" element={<ScientistAggregationChartsPage />} />
          <Route path="datasets/groups/:groupId/predict" element={<ScientistPredictionPage />}>
            <Route path="forecasts/:forecastId" element={<ScientistForecastDetailPage />} />
          </Route>
          <Route path="forecasts/:forecastId" element={<ScientistForecastDetailPage />} />
          <Route path="experiments" element={<ScientistExperimentsPage />} />
          <Route path="experiments/groups/:groupId" element={<ScientistExperimentsPage />} />
          <Route path="experiments/groups/:groupId/new" element={<ScientistExperimentSetupPage />} />
          <Route path="experiments/groups/:groupId/compare" element={<ScientistExperimentComparisonPage />} />
          <Route path="experiments/groups/:groupId/:experimentId" element={<ScientistExperimentsPage />} />
          <Route path="experiments/:datasetId" element={<ScientistExperimentsPage />} />
          <Route path="experiments/:datasetId/:experimentId" element={<ScientistExperimentsPage />} />
          <Route path="shares" element={<ScientistSharesPage />} />
          <Route path="preview" element={<Navigate to="/scientist/datasets" replace />} />
          <Route path="datasets/:datasetId/versions/:versionId" element={<ScientistDatasetSessionsPage />} />
          <Route path="datasets/:datasetId/versions/:versionId/sessions/:sessionId/preview" element={<ScientistDatasetPreviewPage />} />
          <Route path="datasets/:datasetId/versions/:versionId/train" element={<ScientistTrainingPage />} />
          <Route path="datasets/:datasetId/versions/:versionId/predict" element={<ScientistPredictionPage />}>
            <Route path="forecasts/:forecastId" element={<ScientistForecastDetailPage />} />
          </Route>
        </Route>
      </Route>

      {/* Business User Portal */}
      <Route element={<ProtectedRoute allowedRoles={['business_user']} />}>
        <Route path="/business" element={<BusinessSharedResultsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
