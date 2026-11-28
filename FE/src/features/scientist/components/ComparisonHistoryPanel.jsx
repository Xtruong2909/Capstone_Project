import { Eye, History, RefreshCw } from 'lucide-react'

export default function ComparisonHistoryPanel({ rows, loading, error, disabled, onReload, onOpen }) {
  return <section className="admin-card" style={{ marginTop: '1.25rem' }} aria-label="Lịch sử so sánh">
    <div className="admin-card__header"><div>
      <h2 className="admin-card__title"><History size={20} /> Lịch sử so sánh</h2>
    </div><button type="button" className="btn-secondary" disabled={disabled || loading} onClick={onReload}><RefreshCw size={15} /> Làm mới</button></div>
    {loading && <div className="sci-state" role="status">Đang tải lịch sử…</div>}
    {error && <div className="sci-state sci-state--error" role="alert">{error}</div>}
    {!loading && !error && !rows.length && <div className="sci-state">Chưa có lịch sử. Kết quả sẽ được lưu khi bạn so sánh hoặc xem Best Overall.</div>}
    {!loading && rows.length > 0 && <div className="sci-table-wrap"><table className="sci-table"><thead><tr>
      <th>Thời gian</th><th>Kiểu xem</th><th>Thí nghiệm đã chọn</th><th>RMSE TB thấp nhất</th><th>Thao tác</th>
    </tr></thead><tbody>{rows.map(row => {
      const best = row.result.best_overall?.ranking?.[0]
      return <tr key={row.id}>
        <td>{new Date(row.created_at).toLocaleString('vi-VN')}</td>
        <td>{row.mode === 'overall' ? 'Best Overall' : 'So sánh'}</td>
        <td>{row.result.experiments.map(item => item.experiment_name).join(', ')}</td>
        <td>{best ? `${best.experiment_name} · ${best.average_rmse.toFixed(2)}` : '—'}</td>
        <td><button type="button" className="sci-action-chip sci-action-chip--primary" disabled={disabled} onClick={() => onOpen(row.id)}><Eye size={15} /> Xem lại</button></td>
      </tr>
    })}</tbody></table></div>}
  </section>
}
