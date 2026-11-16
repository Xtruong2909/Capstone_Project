import { useState } from 'react'
import {
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Inbox,
  Save,
  Send,
  Share2,
} from 'lucide-react'
import { SHARE_SECTIONS, useShareManagement } from '../../../hooks/useShareManagement'

const RESOURCE_LABELS = {
  DATASET: 'Tập dữ liệu',
  TRAIN_TEST: 'Chia Train/Test',
  EXPERIMENT: 'Thí nghiệm',
  PREDICTION: 'Dự báo',
}

const SECTION_LABELS = {
  metadata: 'Thông tin tập dữ liệu',
  statistics: 'Thống kê',
  sessions: 'Các session',
  traffic_flow_chart: 'Biểu đồ lưu lượng',
  split_summary: 'Tổng quan chia tập',
  train_test_counts: 'Số lượng Train/Test',
  session_distribution: 'Phân bố session',
  split_configuration: 'Cấu hình chia tập',
  experiment_summary: 'Tổng quan thí nghiệm',
  hyperparameters: 'Siêu tham số',
  evaluation_metrics: 'Chỉ số đánh giá',
  baseline_comparison: 'So sánh mô hình cơ sở',
  prediction_rows: 'Các dòng dự đoán',
  horizon_comparison: 'So sánh mốc dự báo',
  forecast_summary: 'Tổng quan dự báo',
  model_information: 'Thông tin mô hình',
  lag_features: 'Đặc trưng trễ',
  forecast_results: 'Kết quả dự báo',
  forecast_chart: 'Biểu đồ dự báo',
}

const STATUS_LABELS = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã công bố',
  REVOKED: 'Đã thu hồi',
}

export default function ScientistSharesPage() {
  const {
    shares, sharesLoading, sharesError, resources, resourcesLoading, resourcesError,
    busy, actionError, create, changeStatus,
  } = useShareManagement()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [resourceKey, setResourceKey] = useState('')
  const [splitId, setSplitId] = useState('')
  const [sections, setSections] = useState([])

  const selected = resourceKey === 'TRAIN_TEST:manual'
    ? { type: 'TRAIN_TEST', id: splitId.trim(), label: 'Train/Test Split' }
    : resources.find((resource) => `${resource.type}:${resource.id}` === resourceKey)
  const validResource = selected && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selected.id)
  const canCreate = Boolean(title.trim() && validResource && sections.length && !busy)

  const handleCreate = async (event, status) => {
    event.preventDefault()
    if (!canCreate) return
    const saved = await create({
      title: title.trim(),
      description: description.trim() || null,
      status,
      items: [{ resource_type: selected.type, resource_id: selected.id, visible_sections: sections }],
    })
    if (saved) {
      setTitle('')
      setDescription('')
      setResourceKey('')
      setSplitId('')
      setSections([])
    }
  }

  return <div className="sci-page sci-shares-page">
    <header className="sci-shares-hero">
      <span className="sci-shares-hero__icon"><Share2 size={25} /></span>
      <div className="sci-shares-hero__text">
        <span className="sci-shares-eyebrow">KẾT QUẢ DATA SCIENCE</span>
        <h1>Chia sẻ kết quả</h1>
        <p>Chọn dữ liệu cần chia sẻ và quyết định nội dung Business User được xem.</p>
      </div>
      <span className="sci-shares-hero__count"><strong>{shares.length}</strong> chia sẻ của tôi</span>
    </header>

    <div className="sci-shares-layout">
      <section className="sci-shares-card sci-shares-create" aria-labelledby="sci-shares-create-title">
        <div className="sci-shares-card__heading">
          <span className="sci-shares-card__icon"><FileText size={19} /></span>
          <div>
            <h2 id="sci-shares-create-title">Tạo chia sẻ mới</h2>
            <p>Điền thông tin và chọn những phần được phép hiển thị.</p>
          </div>
        </div>

        {resourcesLoading && <p className="sci-shares-notice">Đang tải tài nguyên…</p>}
        {resourcesError && <p role="alert" className="sci-shares-notice sci-shares-notice--error">{resourcesError}</p>}

        <form className="sci-shares-form" onSubmit={(event) => handleCreate(event, 'PUBLISHED')}>
          <div className="sci-shares-form__grid">
            <label className="sci-shares-field" htmlFor="share-title">
              <span>Tiêu đề <em>*</em></span>
              <input id="share-title" required maxLength={255} value={title}
                onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Kết quả phân tích Batch 01" />
            </label>
            <label className="sci-shares-field" htmlFor="share-resource">
              <span>Tài nguyên <em>*</em></span>
              <select id="share-resource" required value={resourceKey}
                onChange={(event) => { setResourceKey(event.target.value); setSections([]) }}>
                <option value="">Chọn tài nguyên để chia sẻ</option>
                {Object.entries(RESOURCE_LABELS).map(([type, label]) => <optgroup key={type} label={label}>
                  {type === 'TRAIN_TEST' && <option value="TRAIN_TEST:manual">Nhập Split ID thủ công</option>}
                  {resources.filter((resource) => resource.type === type).map((resource) =>
                    <option key={`${resource.type}:${resource.id}`} value={`${resource.type}:${resource.id}`}>
                      {resource.label}
                    </option>)}
                </optgroup>)}
              </select>
            </label>
            {resourceKey === 'TRAIN_TEST:manual' && <label className="sci-shares-field sci-shares-field--wide" htmlFor="share-split-id">
              <span>Split ID <em>*</em></span>
              <input id="share-split-id" value={splitId} onChange={(event) => setSplitId(event.target.value)}
                placeholder="UUID của bản chia Train/Test đã hoàn thành" />
            </label>}
            <label className="sci-shares-field sci-shares-field--wide" htmlFor="share-description">
              <span>Mô tả <small>Không bắt buộc</small></span>
              <textarea id="share-description" rows={3} value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ghi ngắn gọn bối cảnh hoặc điểm nổi bật của kết quả…" />
            </label>
          </div>

          <fieldset className="sci-shares-sections">
            <legend><ClipboardList size={17} /> Nội dung được phép xem <em>*</em></legend>
            {selected ? <div className="sci-shares-sections__grid">
              {(SHARE_SECTIONS[selected.type] || []).map((section) =>
                <label key={section} className={`sci-shares-section ${sections.includes(section) ? 'sci-shares-section--checked' : ''}`}>
                  <input type="checkbox" checked={sections.includes(section)}
                    onChange={(event) => setSections((current) => event.target.checked
                      ? [...current, section] : current.filter((value) => value !== section))} />
                  <span>{SECTION_LABELS[section] || section.replaceAll('_', ' ')}</span>
                </label>)}
            </div> : <p className="sci-shares-sections__empty">Chọn tài nguyên ở trên để chọn nội dung chia sẻ.</p>}
          </fieldset>

          {actionError && <p role="alert" className="sci-shares-notice sci-shares-notice--error">{actionError}</p>}
          <div className="sci-shares-form__actions">
            <span>Bạn có thể lưu nháp trước khi công bố.</span>
            <div>
              <button type="button" className="sci-shares-button sci-shares-button--secondary" disabled={!canCreate}
                onClick={(event) => handleCreate(event, 'DRAFT')}><Save size={16} /> Lưu nháp</button>
              <button type="submit" className="sci-shares-button sci-shares-button--primary" disabled={!canCreate}>
                <Send size={16} /> {busy ? 'Đang xử lý…' : 'Công bố chia sẻ'}
              </button>
            </div>
          </div>
        </form>
      </section>

      <aside className="sci-shares-card sci-shares-preview" aria-label="Tóm tắt chia sẻ">
        <div className="sci-shares-card__heading">
          <span className="sci-shares-card__icon sci-shares-card__icon--soft"><Eye size={19} /></span>
          <div><h2>Tóm tắt chia sẻ</h2><p>Kiểm tra nội dung trước khi công bố.</p></div>
        </div>
        <div className="sci-shares-preview__body">
          <div className="sci-shares-preview__item">
            <span>Tiêu đề</span><strong>{title.trim() || 'Chưa nhập tiêu đề'}</strong>
          </div>
          <div className="sci-shares-preview__item">
            <span>Tài nguyên</span><strong>{selected ? `${RESOURCE_LABELS[selected.type]} · ${selected.label}` : 'Chưa chọn tài nguyên'}</strong>
          </div>
          <div className="sci-shares-preview__item">
            <span>Quyền xem</span><strong>{sections.length ? `${sections.length} nội dung đã chọn` : 'Chưa chọn nội dung'}</strong>
          </div>
        </div>
        <p className="sci-shares-preview__note"><CheckCircle2 size={16} /> Business User chỉ xem được những phần bạn chọn.</p>
      </aside>
    </div>

    <section className="sci-shares-card sci-shares-list" aria-labelledby="sci-shares-list-title">
      <div className="sci-shares-card__heading">
        <span className="sci-shares-card__icon"><Share2 size={19} /></span>
        <div><h2 id="sci-shares-list-title">Chia sẻ của tôi</h2><p>Quản lý bản nháp và kết quả đã công bố.</p></div>
        {!sharesLoading && !sharesError && <span className="sci-shares-list__count">{shares.length} chia sẻ</span>}
      </div>
      {sharesLoading ? <div className="sci-shares-state">Đang tải danh sách chia sẻ…</div>
        : sharesError ? <div className="sci-shares-notice sci-shares-notice--error" role="alert">{sharesError}</div>
          : shares.length === 0 ? <div className="sci-shares-empty">
            <span><Inbox size={27} /></span>
            <h3>Chưa có chia sẻ nào</h3>
            <p>Chọn tài nguyên và nội dung ở trên để tạo chia sẻ đầu tiên.</p>
          </div> : <div className="sci-shares-items">
            {shares.map((share) => <article key={share.share_id} className="sci-shares-item">
              <span className="sci-shares-item__icon"><FileText size={20} /></span>
              <div className="sci-shares-item__content">
                <h3>{share.title}</h3>
                <p>{(share.resource_types || []).map((type) => RESOURCE_LABELS[type] || type).join(' · ')}
                  <span aria-hidden="true"> · </span>{new Date(share.created_at).toLocaleString('vi-VN')}</p>
              </div>
              <span className={`sci-shares-status sci-shares-status--${share.status.toLowerCase()}`}>
                {STATUS_LABELS[share.status] || share.status}
              </span>
              {share.status === 'DRAFT' && <button type="button" className="sci-shares-button sci-shares-button--secondary"
                disabled={busy} onClick={() => changeStatus(share.share_id, 'PUBLISHED')}>Công bố</button>}
              {share.status === 'PUBLISHED' && <button type="button" className="sci-shares-button sci-shares-button--secondary"
                disabled={busy} onClick={() => changeStatus(share.share_id, 'REVOKED')}>Thu hồi</button>}
            </article>)}
          </div>}
    </section>
  </div>
}
