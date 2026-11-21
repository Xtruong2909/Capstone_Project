import { Link } from 'react-router-dom'
import { ChevronRight, Database, FolderOpen, Layers, MapPin, Radio, Sparkles } from 'lucide-react'
import { useApprovedGroups } from '../../../hooks/useScientistData'

const WORKFLOW = [
  ['Chọn batch', 'Mở batch đã được Admin cấp quyền.'],
  ['Chọn dataset và session', 'Xem các phiên ghi hình trong dataset đã được duyệt.'],
  ['Xem trước dữ liệu', 'Nhấn vào session để kiểm tra cột và dữ liệu.'],
  ['Huấn luyện và dự báo', 'Tạo đặc trưng, chia dữ liệu và chạy mô hình.'],
]

function StatCard({ tone, icon: Icon, label, value, detail }) {
  return <div className={`stat-card stat-card--${tone}`}><Icon size={96} className="stat-card__watermark" />
    <div className="stat-card__top"><div className="stat-card__info"><div className="stat-card__eyebrow">{label}</div>
      <h3>{value}</h3><p>{detail}</p></div><div className={`stat-card__icon stat-card__icon--${tone}`}><Icon size={22} /></div></div>
  </div>
}

export default function ScientistOverviewPage() {
  const { groups, isLoading, error } = useApprovedGroups()
  const approvedDatasets = groups.reduce((total, group) => total + group.approved_datasets, 0)
  const sources = new Set(groups.map((group) => group.source).filter(Boolean)).size
  const drones = new Set(groups.map((group) => group.drone_id).filter(Boolean)).size

  return <div className="sci-page">
    {error && <div className="sci-state sci-state--error" role="alert">{error}</div>}
    <div className="stats-grid">
      <StatCard tone="blue" icon={FolderOpen} label="Batch đã duyệt" value={isLoading ? '…' : groups.length} detail="Có quyền truy cập" />
      <StatCard tone="purple" icon={Database} label="Datasets" value={isLoading ? '…' : approvedDatasets} detail="Đã được phê duyệt" />
      <StatCard tone="green" icon={Radio} label="Nguồn dữ liệu" value={isLoading ? '…' : sources} detail="Nguồn ghi hình" />
      <StatCard tone="amber" icon={MapPin} label="Drone" value={isLoading ? '…' : drones} detail="Thiết bị trong các batch" />
    </div>

    <div className="sci-split">
      <section className="admin-card"><div className="admin-card__header"><div>
        <h2 className="admin-card__title">Các batch đã được phê duyệt</h2>
        <p className="admin-card__subtitle">Chọn batch để xem dataset, sau đó chọn session để xem trước.</p>
      </div><Link to="/scientist/datasets" className="btn-secondary">Xem tất cả</Link></div>
        {isLoading && <div className="sci-overview-list">{[1, 2, 3].map((value) => <div key={value} className="sci-skeleton" style={{ height: 75 }} />)}</div>}
        {!isLoading && !error && groups.length === 0 && <div className="sci-state">Bạn chưa được cấp quyền truy cập batch nào.</div>}
        {!isLoading && !error && groups.length > 0 && <div className="sci-overview-list">
          {groups.slice(0, 6).map((group) => <Link key={group.group_id} className="sci-overview-row" to={`/scientist/datasets/groups/${group.group_id}`}>
            <span className="sci-overview-row__left"><span className="sci-overview-row__avatar"><Layers size={20} /></span>
              <span className="sci-overview-row__info"><span className="sci-overview-row__title-line">
                <span className="sci-overview-row__name">{group.group_name || `Batch ${group.group_id.slice(0, 8)}`}</span>
                <span className="sci-pill sci-pill--approved">{group.approved_datasets} dataset</span></span>
                <span className="sci-overview-row__meta">{group.source} · {group.drone_id || 'Drone chưa xác định'}</span>
              </span></span><span className="sci-action-chip sci-action-chip--primary">Xem datasets <ChevronRight size={15} /></span>
          </Link>)}
        </div>}
      </section>
      <section className="admin-card"><div className="admin-card__header"><div>
        <h2 className="admin-card__title"><Sparkles size={17} style={{ color: '#1668e3', verticalAlign: 'middle' }} /> Data Science Workflow</h2>
        <p className="admin-card__subtitle">Các bước từ batch đến dự báo</p>
      </div></div><div style={{ padding: '1rem 1.25rem 1.25rem' }}><ol className="sci-flow">
        {WORKFLOW.map(([title, detail], index) => <li key={title}><span className="sci-flow__num">{index + 1}</span>
          <div><b>{title}</b><p style={{ margin: 0, fontSize: '.8rem', color: '#64748b' }}>{detail}</p></div></li>)}
      </ol></div></section>
    </div>
  </div>
}
