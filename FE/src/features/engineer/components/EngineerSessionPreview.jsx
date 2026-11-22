import { useLayoutEffect, useRef } from 'react'
import {
  Table2,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useEngineerPreview } from '../../../hooks/useEngineerPreview'
import { formatBytes } from '../utils/engineerHelpers'

const TYPE_LABELS = {
  integer: 'Số nguyên', float: 'Số thực', string: 'Văn bản', boolean: 'Luận lý',
  date: 'Ngày', datetime: 'Ngày giờ', array: 'Danh sách', object: 'Đối tượng',
  unknown: 'Chưa xác định',
}

export default function EngineerSessionPreview({ groupId, datasetId, sessionId }) {
  const { previewRepresentation,
    previewPageSize, setPreviewPageSize, setPreviewPage,
    previewData, isPreviewLoading, isPreviewRefreshing, previewError, columnOffset, previousColumns, nextColumns,
    reload } = useEngineerPreview({ groupId, datasetId, sessionId })
  const pendingScrollPosition = useRef(null)
  useLayoutEffect(() => {
    if (pendingScrollPosition.current == null) return
    window.scrollTo({ top: pendingScrollPosition.current, left: window.scrollX, behavior: 'instant' })
    pendingScrollPosition.current = null
  }, [previewData?.pagination?.page])
  const changePage = (page) => {
    pendingScrollPosition.current = window.scrollY
    setPreviewPage(page)
  }

  return (
    <section className="adm-panel eng-preview">
      <div className="adm-panel__header">
        <div className="adm-panel__title-group">
          <div className="adm-panel__icon adm-tone--purple">
            <Table2 size={18} />
          </div>
          <div>
            <h2 className="adm-panel__title">Lược đồ và xem trước dữ liệu</h2>
          </div>
        </div>

        <button
          type="button"
          className="adm-btn adm-btn--ghost adm-btn--sm"
          disabled={!sessionId || isPreviewLoading || isPreviewRefreshing}
          onClick={() => reload()}
          aria-label="Làm mới dữ liệu xem trước"
        >
          <RefreshCw size={14} className={isPreviewLoading || isPreviewRefreshing ? 'animate-spin' : ''} />
          <span>Làm mới</span>
        </button>
      </div>

      <div className="adm-panel__body">
        {/* Toolbar */}
        <div className="eng-preview__toolbar eng-preview__toolbar--session">
          <select
            className="adm-select"
            aria-label="Số dòng mỗi trang"
            value={previewPageSize}
            disabled={isPreviewRefreshing}
            onChange={(e) => {
              setPreviewPageSize(Number(e.target.value))
              setPreviewPage(1)
            }}
          >
            <option value={10}>10 dòng / trang</option>
            <option value={20}>20 dòng / trang</option>
            <option value={50}>50 dòng / trang</option>
          </select>
        </div>

        {!sessionId ? (
          <div className="adm-empty">
            <div className="adm-empty__icon">
              <Table2 size={24} />
            </div>
            <div className="adm-empty__title">Chưa chọn tập dữ liệu</div>
            <p className="adm-empty__desc">
              Chọn tập dữ liệu ở phía trên để xem cấu trúc và các bản ghi.
            </p>
          </div>
        ) : isPreviewLoading ? (
          <div style={{ display: 'grid', gap: '0.75rem', padding: '0.5rem 0' }}>
            <div className="eng-kv-grid">
              {[1, 2].map((i) => (
                <div key={i} className="eng-skeleton" style={{ height: '64px' }} />
              ))}
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="eng-skeleton" style={{ height: '38px' }} />
            ))}
          </div>
        ) : previewError && !previewData ? (
          <div className="eng-alert eng-alert--error">
            <div className="eng-alert__content">
              <AlertCircle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{previewError}</span>
            </div>
            <div className="eng-alert__actions">
              <button
                type="button"
                className="adm-btn adm-btn--ghost adm-btn--sm"
                onClick={() => reload()}
              >
                Thử lại
              </button>
            </div>
          </div>
        ) : previewData ? (
          <>
            {previewError && <div className="eng-alert eng-alert--error" role="alert">
              <span>{previewError}</span>
              <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={reload}>Thử lại</button>
            </div>}
            {/* Metadata KPI Grid */}
            <div className="eng-kv-grid eng-preview__metadata">
              <div className="eng-kv-item">
                <span className="eng-kv-item__label">Tệp dữ liệu</span>
                <span
                  className="eng-kv-item__value eng-preview__filename"
                  title={`${previewData.original_filename} (${formatBytes(previewData.file_size)})`}
                >
                  {previewData.original_filename}
                </span>
                <span className="eng-preview__hint">{formatBytes(previewData.file_size)}</span>
              </div>
              <div className="eng-kv-item">
                <span className="eng-kv-item__label">Số cột dữ liệu</span>
                <span className="eng-kv-item__value">
                  {previewData.total_columns ?? previewData.columns?.length ?? 0} cột
                </span>
                {previewData.has_more_columns && <span className="eng-preview__hint">Đang xem {previewData.columns?.length || 0} cột</span>}
              </div>
            </div>

            {/* Paginated Data Table (column types integrated into header) */}
            {(previewData.representation || previewRepresentation) === 'raw' && (columnOffset > 0 || previewData.has_more_columns) && (
              <div className="eng-preview__columns">
                <span>Cột {columnOffset + 1}–{columnOffset + (previewData.columns?.length || 0)} / {previewData.total_columns}</span>
                <div className="eng-preview__column-actions">
                  <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" disabled={columnOffset === 0}
                    onClick={previousColumns}>Cột trước</button>
                  <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" disabled={!previewData.has_more_columns}
                    onClick={nextColumns}>Cột tiếp</button>
                </div>
              </div>
            )}
            <div className="adm-table-wrap" aria-busy={Boolean(isPreviewRefreshing)}>
              <table className="adm-table eng-preview__table" aria-label="Các bản ghi xem trước">
                <thead>
                  <tr>
                    <th style={{ width: '56px', textAlign: 'center' }} scope="col">STT</th>
                    {previewData.columns?.map((col) => (
                      <th key={col.name} title={col.name} scope="col">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span className="eng-preview__column-name">{col.name}</span>
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 600,
                              color: '#64748b',
                              textTransform: 'none',
                              letterSpacing: 0,
                            }}
                          >
                            {TYPE_LABELS[col.type] || col.type}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!previewData.rows?.length && (
                    <tr><td colSpan={(previewData.columns?.length || 0) + 1} className="eng-preview__empty">Không có bản ghi để hiển thị.</td></tr>
                  )}
                  {previewData.rows?.map((row, rowIdx) => {
                    const rowNumber =
                      (previewData.pagination.page - 1) * previewData.pagination.page_size +
                      rowIdx +
                      1

                    return (
                      <tr key={rowIdx}>
                        <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                          {rowNumber}
                        </td>
                        {previewData.columns?.map((col) => {
                          const cellVal = row[col.name]
                          const isNumeric = col.type === 'float' || col.type === 'integer'
                          return (
                            <td
                              key={col.name}
                              title={cellVal != null ? String(cellVal) : ''}
                              style={{
                                maxWidth: '240px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontFamily: isNumeric ? 'ui-monospace, monospace' : 'inherit',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {cellVal == null || cellVal === '' ? (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              ) : (
                                String(cellVal)
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {previewData.pagination && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '1rem',
                  paddingTop: '0.85rem',
                  borderTop: '1px solid #f1f5f9',
                  fontSize: '0.82rem',
                  color: '#64748b',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <span>
                  Trang <strong style={{ color: '#0f172a' }}>{previewData.pagination.page}</strong> · Hiển thị{' '}
                  {previewData.pagination.returned_rows} dòng
                  {previewData.pagination.total_rows != null
                    ? ` / ${previewData.pagination.total_rows.toLocaleString('vi-VN')} bản ghi`
                    : ''}
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                    disabled={isPreviewRefreshing || previewData.pagination.page <= 1}
                    aria-label="Trang trước"
                    onClick={() => changePage(Math.max(1, previewData.pagination.page - 1))}
                  >
                    <ChevronLeft size={15} />
                    <span>Trước</span>
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                    disabled={isPreviewRefreshing || !previewData.pagination.has_more}
                    aria-label="Trang tiếp theo"
                    onClick={() => changePage(previewData.pagination.page + 1)}
                  >
                    <span>Tiếp</span>
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  )
}
