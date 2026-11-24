import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, Building2, ChevronLeft, ChevronRight, Database,
  Eye, FileSpreadsheet, FlaskConical, LogOut, Search, Share2, TrendingUp,
} from 'lucide-react'

import { useAuth } from '../../../hooks/useAuth'
import { useSharedResults, useSharedResultDetail, useSharedItemRows } from '../../../hooks/useSharedResults'
import LanguageSwitcher from '../../../components/LanguageSwitcher'
import ScientistProfileModal from '../../scientist/components/ScientistProfileModal'
import SharedResultDataSection from '../components/SharedResultDataSection'
import BusinessDatasetDetail from '../components/BusinessDatasetDetail'
import BusinessResourceList from '../components/BusinessResourceList'
import { useBusinessResourceNavigation } from '../../../hooks/useBusinessResourceNavigation'
import { sharedResourceName } from '../utils/sharedResourceNames'
import '../../admin/AdminLayout.css'
import '../../scientist/ScientistPages.css'
import './BusinessSharedResultsPage.css'
import '../../../components/WorkspaceSidebar.css'

const PAGED_SECTIONS = new Set(['sessions', 'traffic_flow_chart', 'prediction_rows', 'forecast_results', 'forecast_chart'])
const RESOURCE_TYPES = ['DATASET', 'EXPERIMENT', 'PREDICTION']

const RESOURCE_TYPE_LABELS = {
  DATASET: 'Tập dữ liệu',
  TRAIN_TEST: 'Train / Test',
  EXPERIMENT: 'Thí nghiệm',
  PREDICTION: 'Dự báo',
}

const RESOURCE_TYPE_ICONS = {
  DATASET: FileSpreadsheet,
  TRAIN_TEST: BarChart3,
  EXPERIMENT: FlaskConical,
  PREDICTION: TrendingUp,
}

const SECTION_LABELS = {
  metadata: 'Thông tin dataset', statistics: 'Thống kê', sessions: 'Phiên ghi hình',
  traffic_flow_chart: 'Lưu lượng theo thời gian', split_summary: 'Thông tin Train/Test',
  train_test_counts: 'Số mẫu Train/Test', session_distribution: 'Phân bổ phiên ghi hình',
  split_configuration: 'Cấu hình chia dữ liệu', experiment_summary: 'Thông tin thí nghiệm',
  hyperparameters: 'Siêu tham số', evaluation_metrics: 'Chỉ số đánh giá',
  baseline_comparison: 'So sánh mô hình', horizon_comparison: 'So sánh mốc dự báo',
  prediction_rows: 'Dự báo trên tập Test', forecast_summary: 'Thông tin dự báo',
  model_information: 'Mô hình sử dụng', lag_features: 'Đặc trưng trễ',
  forecast_results: 'Kết quả dự báo', forecast_chart: 'Dữ liệu biểu đồ dự báo',
}

function sectionLabel(section) {
  return SECTION_LABELS[section] || RESOURCE_TYPE_LABELS[section] || section.replaceAll('_', ' ')
}

function ResourceHeading({ resource }) {
  const type = resource.resource_type
  const Icon = RESOURCE_TYPE_ICONS[type] || Share2
  const label = RESOURCE_TYPE_LABELS[type] || type
  const name = sharedResourceName(resource)
  return (
    <h3 className="biz-resource__title">
      <Icon size={16} aria-hidden="true" />
      <span>{name.startsWith(label) ? name : `${label} · ${name}`}</span>
    </h3>
  )
}

function SharedSection({ shareId, itemId, section, value }) {
  const [page, setPage] = useState(1)
  const isPaged = PAGED_SECTIONS.has(section)
  const { result, loading, error } = useSharedItemRows(
    isPaged ? shareId : null, itemId, isPaged ? section : null, page,
  )
  const shownValue = isPaged ? result?.data : value
  return (
    <div className="biz-section">
      <div className="biz-section__header">
        <h4 className="biz-section__title">{sectionLabel(section)}</h4>
      </div>
      {section === 'forecast_chart' && Array.isArray(value?.historical) && (
        <>
          <h5 className="biz-section__subtitle">Dữ liệu quan sát</h5>
          <SharedResultDataSection section="historical" value={value.historical} />
        </>
      )}
      {loading
        ? <div className="biz-loading"><div className="sci-spinner" />Đang tải dữ liệu…</div>
        : error
          ? <p role="alert" className="biz-error">{error}</p>
          : <SharedResultDataSection section={section} value={shownValue}
            groupBySession={['traffic_flow_chart', 'prediction_rows', 'forecast_results', 'forecast_chart'].includes(section)} />}
      {isPaged && result && (
        <div className="biz-pager">
          <span className="biz-pager__info">{result.total_records} bản ghi · Trang {page}</span>
          <div className="biz-pager__controls">
            <button type="button" className="biz-pager__btn" disabled={page === 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={15} /> Trước
            </button>
            <button type="button" className="biz-pager__btn" disabled={page * result.page_size >= result.total_records} onClick={() => setPage(page + 1)}>
              Sau <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function BusinessSharedResultsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [resourceType, setResourceType] = useState('DATASET')
  const [page, setPage] = useState(1)
  const [shareId, setShareId] = useState('')
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const { data, total_records: total, loading, error } = useSharedResults({ search, resourceType, page })
  const visibleShares = data.filter((share) => share.available_sections.includes(resourceType))
  const isDatasetReview = resourceType === 'DATASET'
  const selectedShareId = visibleShares.some((share) => share.share_id === shareId)
    ? shareId : ''
  const { detail, loading: detailLoading, error: detailError } = useSharedResultDetail(selectedShareId)
  const { resources, selectedResource, selectResource } = useBusinessResourceNavigation(detail, resourceType)
  const showDatasetDetail = selectedResource?.resource_type === 'DATASET'
  const ActiveResourceIcon = RESOURCE_TYPE_ICONS[resourceType]
  const pageTitle = `${RESOURCE_TYPE_LABELS[resourceType]} được chia sẻ`

  const handleResourceChange = (type) => {
    if (type === resourceType) return
    selectResource(null)
    setResourceType(type)
    setPage(1)
    setShareId('')
    setSearch('')
    setSearchInput('')
  }

  const displayName = user?.full_name?.replace(/\s*\(business\s+user\)\s*$/i, '').trim() || 'Business User'

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="admin-shell biz-portal" data-resource-type={resourceType}>
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar workspace-sidebar">
        <div className="admin-sidebar__header">
          <div className="admin-sidebar__brand">
            <div className="admin-sidebar__logo-badge biz-logo-badge">
              <Building2 size={20} />
            </div>
            <div className="admin-sidebar__brand-text">
              <h2>Urban Traffic</h2>
              <span className="biz-brand-sub">Business Portal</span>
            </div>
          </div>
        </div>

        <nav className="admin-sidebar__nav" aria-label="Tài nguyên được chia sẻ">
          {RESOURCE_TYPES.map((type) => {
            const Icon = RESOURCE_TYPE_ICONS[type]
            return <button key={type} type="button"
              className={`admin-nav-item biz-nav-item${resourceType === type ? ' active' : ''}`}
              title={RESOURCE_TYPE_LABELS[type]}
              aria-label={RESOURCE_TYPE_LABELS[type]}
              aria-current={resourceType === type ? 'page' : undefined}
              onClick={() => handleResourceChange(type)}>
              <Icon size={19} style={{ flexShrink: 0 }} aria-hidden="true" />
              <span>{RESOURCE_TYPE_LABELS[type]}</span>
            </button>
          })}
        </nav>

        <div className="admin-sidebar__footer">
          <div className="workspace-sidebar__role">
            <span className="sci-role-label">Vai trò</span>
            <span className="sci-role-badge biz-role-badge">
              <span className="workspace-sidebar__role-short" aria-hidden="true">BU</span>
              <span className="workspace-sidebar__role-full">Người dùng nghiệp vụ</span>
            </span>
          </div>
          <button type="button" className="admin-user-profile biz-profile-trigger" onClick={() => setIsProfileModalOpen(true)} title="Xem hồ sơ và bảo mật tài khoản">
            <div className="admin-avatar biz-avatar">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="admin-user-info">
              <span className="admin-user-name">{displayName}</span>
              <span className="admin-user-email">{user?.email || ''}</span>
            </div>
          </button>
          <button type="button" className="admin-logout-btn" onClick={handleLogout} title="Đăng xuất">
            <LogOut size={16} style={{ flexShrink: 0 }} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__title">
            <h1>{pageTitle}</h1>
          </div>
          <div className="admin-header__actions">
            <LanguageSwitcher />
          </div>
        </header>

        <main className="admin-content">
          <div className="sci-page">

            <section className="biz-hero">
              <div className="biz-hero__icon"><ActiveResourceIcon size={24} /></div>
              <div>
                <span>KHÔNG GIAN NGHIỆP VỤ</span>
                <h2>{pageTitle}</h2>
                <p>Khám phá dữ liệu, thí nghiệm và dự báo đã được chia sẻ với bạn.</p>
              </div>
              <strong className="biz-hero__count">{total} kết quả</strong>
            </section>

            {/* Search & Filter bar */}
            {!selectedShareId && <div className="admin-card biz-toolbar-card">
              <form
                className="biz-toolbar"
                onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()) }}
              >
                <div className="sci-search biz-search">
                  <Search size={15} />
                  <input
                    aria-label="Tìm kết quả"
                    placeholder="Tìm theo tiêu đề…"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                </div>
                <div className="biz-toolbar__right">
                  <button type="submit" className="sci-action-chip sci-action-chip--primary">
                    <Search size={14} /> Tìm
                  </button>
                </div>
              </form>
            </div>}

            {/* Two-column layout */}
            <div className="biz-layout biz-layout--dataset">
              {/* Left sidebar: list */}
              {!selectedShareId && <aside className="biz-list admin-card biz-list--dataset">
                <div className="biz-list__header">
                  <span className="biz-list__title">Danh sách chia sẻ</span>
                  <span className="biz-list__count">{total} kết quả</span>
                </div>

                <div className="biz-list__body">
                  {loading && (
                    <div className="biz-loading"><div className="sci-spinner" />Đang tải…</div>
                  )}
                  {!loading && error && (
                    <p role="alert" className="biz-error" style={{ padding: '1rem' }}>{error}</p>
                  )}
                  {!loading && !error && visibleShares.length === 0 && (
                    <div className="sci-state">
                      <Share2 size={28} style={{ margin: '0 auto 0.6rem', display: 'block', color: '#94a3b8' }} />
                      <strong>Chưa có kết quả nào</strong>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem' }}>Chưa có kết quả nào được công bố.</p>
                    </div>
                  )}
                  {!loading && !error && visibleShares.map((share) => (
                    <button
                      type="button"
                      key={share.share_id}
                      className="biz-list__item biz-list__item--dataset"
                      onClick={() => { selectResource(null); setShareId(share.share_id) }}
                    >
                      {isDatasetReview ? <>
                        <span className="biz-dataset-list__icon"><Database size={21} /></span>
                        <span className="biz-dataset-list__info">
                          <strong className="biz-list__item-title">{share.title}</strong>
                          <small className="biz-list__item-date">Chia sẻ {share.published_at ? new Date(share.published_at).toLocaleString('vi-VN') : ''}</small>
                        </span>
                        <span className="biz-dataset-list__action">Xem chi tiết <ChevronRight size={16} /></span>
                      </> : <>
                        <div className="biz-list__item-top"><strong className="biz-list__item-title">{share.title}</strong></div>
                        <span className="biz-list__item-sections">{share.available_sections.map(sectionLabel).join(' · ')}</span>
                        <small className="biz-list__item-date">{share.published_at ? new Date(share.published_at).toLocaleString('vi-VN') : ''}</small>
                      </>}
                    </button>
                  ))}
                </div>

                <div className="biz-pager biz-pager--list">
                  <button type="button" className="biz-pager__btn" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft size={15} /> Trước
                  </button>
                  <span className="biz-pager__info">Trang {page}</span>
                  <button type="button" className="biz-pager__btn" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>
                    Sau <ChevronRight size={15} />
                  </button>
                </div>
              </aside>}

              {/* Right: detail panel */}
              {selectedShareId && <article className={`biz-detail admin-card${showDatasetDetail && detail?.share_id === selectedShareId && !detailLoading && !detailError ? ' biz-detail--dataset' : ''}`} style={{ minWidth: 0, padding: 0 }}>
                {(detailLoading || detailError) && <div className="biz-detail__heading"><button type="button" className="sci-back" onClick={() => { selectResource(null); setShareId('') }}><ArrowLeft size={16} /> Danh sách chia sẻ</button></div>}
                {!selectedShareId ? (
                  <div className="sci-state" style={{ margin: '3rem 1rem' }}>
                    <Eye size={32} style={{ margin: '0 auto 0.75rem', display: 'block', color: '#94a3b8' }} />
                    <strong>Chọn một kết quả để xem</strong>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>Chọn từ danh sách bên trái để xem chi tiết.</p>
                  </div>
                ) : detailLoading ? (
                  <div className="biz-loading" style={{ padding: '3rem' }}><div className="sci-spinner" />Đang tải chi tiết…</div>
                ) : detailError ? (
                  <p role="alert" className="biz-error" style={{ padding: '1.5rem' }}>{detailError}</p>
                ) : detail?.share_id === selectedShareId && (
                  <div className="biz-detail__inner">
                    <div className="biz-detail__heading">
                      <button type="button" className="sci-back biz-dataset-back" onClick={() => {
                        if (selectedResource) selectResource(null)
                        else setShareId('')
                      }}><ArrowLeft size={16} /> {selectedResource ? `Danh sách ${RESOURCE_TYPE_LABELS[resourceType].toLowerCase()}` : 'Danh sách chia sẻ'}</button>
                      <h2 className="biz-detail__title">{detail.title}</h2>
                    </div>
                    <div className="biz-detail__body">
                      {!selectedResource && <BusinessResourceList resources={resources} label={RESOURCE_TYPE_LABELS[resourceType]} onSelect={selectResource} />}
                      {(selectedResource ? [selectedResource] : []).map((resource) => (
                        resource.resource_type === 'DATASET' ? <BusinessDatasetDetail
                          key={resource.item_id}
                          resource={resource}
                          renderSection={(section) => <SharedSection
                            key={`${resource.item_id}:${section}`}
                            shareId={detail.share_id}
                            itemId={resource.item_id}
                            section={section}
                            value={resource.data?.[section]}
                          />}
                        /> :
                        <div key={resource.item_id} className={`biz-resource${resource.resource_type === 'DATASET' ? ' biz-resource--dataset' : ''}`}>
                          {(resource.resource_type !== 'DATASET' || detail.resources.filter((item) => item.resource_type === resourceType).length > 1) && <div className="biz-resource__header">
                            <ResourceHeading resource={resource} />
                          </div>}
                          {(resource.resource_type === 'EXPERIMENT'
                            ? resource.visible_sections.filter((s) => s === 'prediction_rows')
                            : resource.visible_sections.filter((section) => !['model_information', 'forecast_results'].includes(section))
                          ).map((section) => (
                            <SharedSection
                              key={`${resource.item_id}:${section}`}
                              shareId={detail.share_id}
                              itemId={resource.item_id}
                              section={section}
                              value={resource.data?.[section]}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>}
            </div>

          </div>
        </main>
      </div>
      <ScientistProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} roleLabel="Người dùng nghiệp vụ" />
    </div>
  )
}
