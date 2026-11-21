import { formatAthensRecordingDateTime, formatRecordingDateTime, formatTrafficFlow } from '../../scientist/utils/formatters'

const LABELS = {
  dataset_id: 'Dataset', dataset_name: 'Tên dataset', dataset_version_id: 'Phiên bản dataset',
  version_tag: 'Mã phiên bản', source: 'Nguồn dữ liệu', recording_date: 'Ngày ghi hình',
  total_records: 'Tổng bản ghi', session_count: 'Số phiên ghi hình',
  session_id: 'Phiên ghi hình', session_name: 'Phiên ghi hình',
  scheduled_start: 'Bắt đầu', scheduled_end: 'Kết thúc',
  timestamp: 'Thời gian', vehicle_count: 'Lưu lượng (xe/phút)',
  split_id: 'Mã Train/Test', status: 'Trạng thái', feature_generation_id: 'Mã tạo đặc trưng',
  total_sessions: 'Tổng phiên ghi hình', total_samples: 'Tổng số mẫu',
  train_sample_count: 'Số mẫu Train', test_sample_count: 'Số mẫu Test',
  samples_by_horizon: 'Số mẫu theo mốc dự báo',
  train_sessions: 'Phiên Train', test_sessions: 'Phiên Test',
  split_strategy: 'Cách chia dữ liệu', train_ratio_requested: 'Tỷ lệ Train yêu cầu',
  train_ratio_actual: 'Tỷ lệ Train thực tế', shuffle: 'Trộn dữ liệu',
  forecast_horizons: 'Các mốc dự báo',
  experiment_id: 'Mã thí nghiệm', experiment_name: 'Tên thí nghiệm', model: 'Mô hình',
  horizon: 'Mốc dự báo', input_timestamp: 'Thời gian gốc (Athens)',
  forecast_timestamp: 'Thời điểm dự báo (Athens)', actual_timestamp: 'Thời điểm thực tế (Athens)',
  actual_vehicle_count: 'Thực tế (xe/phút)', predicted_vehicle_count: 'Dự báo (xe/phút)',
  absolute_error: 'MAE', squared_error: 'RMSE',
  forecast_id: 'Mã lượt dự báo', created_at: 'Thời gian tạo', model_ids: 'Mô hình theo mốc',
  lag_features: 'Giá trị đầu vào', points: 'Các mốc quan sát',
  traffic_flow: 'Lưu lượng (xe/phút)', sample_count: 'Số mẫu',
  train: 'Train', test: 'Test', total: 'Tổng', train_target_mean: 'Trung bình mục tiêu Train',
  forecast_origin_time: 'Thời gian gốc',
  mae: 'MAE', rmse: 'RMSE', mse: 'MSE', mape: 'MAPE', r2: 'R²',
  n_estimators: 'Số cây', max_depth: 'Độ sâu tối đa', min_samples_split: 'Mẫu tối thiểu để tách',
  min_samples_leaf: 'Mẫu tối thiểu ở lá', max_features: 'Số đặc trưng xét',
  random_state: 'Giá trị khởi tạo ngẫu nhiên',
  RANDOM_FOREST: 'Random Forest', PERSISTENCE: 'Persistence',
  HISTORICAL_AVERAGE: 'Historical Average', random_forest: 'Random Forest',
  persistence: 'Persistence', historical_average: 'Historical Average',
}

const COLUMN_ORDER = {
  sessions: ['session_name', 'recording_date', 'scheduled_start', 'scheduled_end'],
  traffic_flow_chart: ['session_name', 'timestamp', 'vehicle_count'],
  prediction_rows: ['session_name', 'model', 'horizon', 'input_timestamp', 'forecast_timestamp', 'actual_vehicle_count', 'predicted_vehicle_count', 'absolute_error', 'squared_error'],
  forecast_results: ['session_name', 'horizon', 'forecast_timestamp', 'predicted_vehicle_count'],
  forecast_chart: ['session_name', 'horizon', 'forecast_timestamp', 'predicted_vehicle_count'],
  session_distribution: ['session_name', 'recording_date', 'sample_count'],
  train_test_counts: ['horizon', 'train', 'test', 'total'],
  points: ['timestamp', 'traffic_flow'],
  evaluation_metrics: ['model', 'horizon', 'sample_count', 'mae', 'rmse'],
}

const ATHENS_TIMES = new Set(['input_timestamp', 'forecast_timestamp', 'actual_timestamp'])
const RECORDING_TIMES = new Set(['timestamp', 'scheduled_start', 'scheduled_end', 'forecast_origin_time'])
const TRAFFIC_FIELDS = new Set(['vehicle_count', 'traffic_flow', 'actual_vehicle_count', 'predicted_vehicle_count'])
const METRIC_FIELDS = new Set(['mae', 'rmse', 'mse', 'mape', 'absolute_error', 'squared_error'])
const COUNT_FIELDS = new Set(['total_records', 'session_count', 'total_sessions', 'total_samples', 'train_sample_count', 'test_sample_count', 'sample_count', 'train', 'test', 'total'])
const FORECAST_SECTIONS = new Set(['forecast_results', 'forecast_chart'])

function label(key) {
  if (LABELS[key]) return LABELS[key]
  if (/^h?\d+$/.test(key)) return `+${key.replace(/^h/, '')} phút`
  if (/^(traffic_flow_)?lag_\d+$/.test(key)) return `Lưu lượng trễ ${key.match(/\d+$/)[0]} phút`
  return key.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function number(value, digits = 0) {
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value))
}

function valueText(value, key = '') {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  if (key === 'session_id' || key === 'dataset_id' || key === 'dataset_version_id' || key === 'split_id' || key === 'experiment_id' || key === 'forecast_id' || key === 'feature_generation_id' || key === 'model_id') return String(value).slice(0, 8)
  if (key === 'recording_date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${day}/${month}/${year}`
  }
  if (ATHENS_TIMES.has(key)) return formatAthensRecordingDateTime(value)
  if (RECORDING_TIMES.has(key)) return formatRecordingDateTime(value)
  if (key === 'created_at') return new Date(value).toLocaleString('vi-VN')
  if (key === 'horizon') return `+${String(value).replace(/^h/, '')} phút`
  if (key === 'status') return ({ COMPLETED: 'Hoàn thành', PARTIAL: 'Hoàn thành một phần', FAILED: 'Thất bại', PENDING: 'Đang chờ', RUNNING: 'Đang chạy' })[value] || value
  if (key === 'split_strategy') return ({ DAY_BASED: 'Theo ngày', SESSION_BASED: 'Theo phiên ghi hình' })[value] || value
  if (key === 'model') return LABELS[value] || value
  if (key === 'train_ratio_actual' || key === 'train_ratio_requested') return `${number(Number(value) * 100, 1)}%`
  if (TRAFFIC_FIELDS.has(key)) return formatTrafficFlow(value)
  if (/^(traffic_flow_)?lag_\d+$/.test(key)) return formatTrafficFlow(value)
  // Each prediction row contains one observation, so its RMSE is sqrt(SE).
  if (key === 'squared_error') return number(Math.sqrt(Number(value)), 2)
  if (METRIC_FIELDS.has(key)) return number(value, 2)
  if (COUNT_FIELDS.has(key)) return number(value)
  if (typeof value === 'number') return Number.isInteger(value) ? number(value) : number(value, 2)
  return LABELS[value] || String(value)
}

function DataValue({ value, field = '', depth = 0 }) {
  if (value == null) return <span className="biz-muted">—</span>
  if (Array.isArray(value)) {
    if (!value.length) return <span className="biz-muted">Chưa có dữ liệu.</span>
    if (field === 'forecast_horizons') return <div className="biz-value-list">{value.map((horizon) => <span className="biz-value-chip" key={horizon}>+{horizon} phút</span>)}</div>
    if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) return <DataTable rows={value} section={field} depth={depth + 1} />
    return <div className="biz-value-list">{value.map((item, index) => <span className="biz-value-chip" key={index}>{valueText(item, field)}</span>)}</div>
  }
  if (typeof value === 'object') {
    if (!Object.keys(value).length) return <span className="biz-muted">Chưa có dữ liệu.</span>
    if (depth > 5) return <span className="biz-muted">Dữ liệu quá nhiều cấp.</span>
    return <div className="biz-nested-facts">{Object.entries(value).map(([key, item]) => (
      <div className="biz-nested-facts__item" key={key}>
        <span className="biz-nested-facts__label">{label(key)}</span>
        <DataValue value={item} field={key} depth={depth + 1} />
      </div>
    ))}</div>
  }
  return <span title={typeof value === 'string' && value.length > 24 ? value : undefined}>{valueText(value, field)}</span>
}

function timestampParts(value, field) {
  if (!value || !(ATHENS_TIMES.has(field) || RECORDING_TIMES.has(field))) return null
  const [date, time] = valueText(value, field).split(/,\s*/)
  return time ? { date, time } : null
}

function TableValue({ value, field, depth, dateContext }) {
  const parts = dateContext && timestampParts(value, field)
  if (parts && parts.date === dateContext) return <span title={valueText(value, field)}>{parts.time}</span>
  return <DataValue value={value} field={field} depth={depth} />
}

function DataTable({ rows, section = '', depth = 0, hiddenFields = [], dateContext }) {
  if (!rows.length) return <p className="biz-empty-text">Chưa có dữ liệu.</p>
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const hasNames = keys.includes('session_name') && rows.some((row) => row.session_name)
  const visibleKeys = keys.filter((key) => !(key === 'session_id' && hasNames)
    && !hiddenFields.includes(key)
    && !(key === 'actual_vehicle_count' && FORECAST_SECTIONS.has(section)))
  const ordered = COLUMN_ORDER[section]
    ? [...COLUMN_ORDER[section].filter((key) => visibleKeys.includes(key)), ...visibleKeys.filter((key) => !COLUMN_ORDER[section].includes(key))]
    : visibleKeys
  return <div className="sci-table-wrap biz-data-table-wrap"><table className="sci-table biz-data-table">
    <thead><tr>{ordered.map((key) => <th key={key} data-field={key}>{label(key)}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.session_id || row.timestamp || 'row'}-${index}`}>{ordered.map((key) => (
      <td key={key} data-field={key} title={key === 'session_name' ? row.session_id : undefined}>
        <TableValue value={row[key]} field={key} depth={depth + 1} dateContext={dateContext} />
      </td>
    ))}</tr>)}</tbody>
  </table></div>
}

function SessionDataTables({ rows, section }) {
  if (!rows.length) return <p className="biz-empty-text">Chưa có dữ liệu.</p>
  const groups = new Map()
  for (const row of rows) {
    const id = row.session_id || row.session_name || 'unknown'
    const timeField = ['input_timestamp', 'timestamp', 'forecast_timestamp'].find((field) => row[field])
    const date = timestampParts(row[timeField], timeField)?.date
    const key = JSON.stringify([id, date])
    if (!groups.has(key)) groups.set(key, {
      sessionId: id, date, isAthens: ATHENS_TIMES.has(timeField),
      name: row.session_name || row.session_id || 'Chưa xác định session', rows: [],
    })
    groups.get(key).rows.push(row)
  }
  return <div className="biz-session-traffic">{[...groups].map(([id, group]) => (
    <section className="biz-session-traffic__group" key={id} aria-label={`Session ${group.name}`}>
      <header className="biz-session-traffic__heading">
        <div>
          <span>Thông tin phiên ghi hình</span>
          <h5 title={group.sessionId}>{group.name}</h5>
          {group.date && <p className="biz-session-traffic__date">Ngày: <strong>{group.date}</strong>{group.isAthens ? ' · Giờ Athens' : ''}</p>}
        </div>
        <small>{group.rows.length} bản ghi trên trang này</small>
      </header>
      <DataTable rows={group.rows} section={section} hiddenFields={['session_id', 'session_name', 'actual_timestamp']} dateContext={group.date} />
    </section>
  ))}</div>
}

function SessionDistribution({ value }) {
  return <div className="biz-session-groups">
    {['train_sessions', 'test_sessions'].map((key) => <div key={key} className="biz-session-group">
      <div className="biz-session-group__heading"><strong>{label(key)}</strong><span>{value?.[key]?.length || 0} phiên</span></div>
      <DataValue value={value?.[key] || []} field="session_distribution" />
    </div>)}
  </div>
}

function SampleCounts({ value }) {
  const counts = Object.entries(value?.samples_by_horizon || {}).map(([key, count]) => ({ horizon: key.replace(/^h/, ''), ...count }))
  return <div className="biz-counts">
    <div className="biz-counts__summary">
      <div><span>Số mẫu Train</span><strong>{valueText(value?.train_sample_count, 'train_sample_count')}</strong></div>
      <div><span>Số mẫu Test</span><strong>{valueText(value?.test_sample_count, 'test_sample_count')}</strong></div>
    </div>
    <h5 className="biz-section__subtitle">Số mẫu theo mốc dự báo</h5>
    <DataTable rows={counts} section="train_test_counts" />
  </div>
}

function SessionSnapshots({ rows, field }) {
  if (!rows?.length) return <p className="biz-empty-text">Chưa có dữ liệu.</p>
  return <div className="biz-session-groups">{rows.map((row, index) => <div className="biz-session-group" key={row.session_id || index}>
    <div className="biz-session-group__heading"><strong title={row.session_id}>{row.session_name || `Phiên ${index + 1}`}</strong></div>
    <DataValue value={row[field]} field={field} />
  </div>)}</div>
}

function EvaluationMetrics({ section, value }) {
  const rows = []
  if (section === 'horizon_comparison') {
    for (const [horizon, models] of Object.entries(value || {})) {
      for (const [model, metrics] of Object.entries(models || {})) {
        rows.push({ model, horizon, ...metrics })
      }
    }
  } else {
    for (const [model, horizons] of Object.entries(value || {})) {
      for (const [horizon, metrics] of Object.entries(horizons || {})) {
        rows.push({ model, horizon, ...metrics })
      }
    }
  }
  rows.sort((a, b) => Number(String(a.horizon).replace(/^h/, '')) - Number(String(b.horizon).replace(/^h/, '')) || a.model.localeCompare(b.model))
  return <DataTable rows={rows} section="evaluation_metrics" />
}

export default function SharedResultDataSection({ section, value, groupBySession = false }) {
  if (section === 'train_test_counts') return <SampleCounts value={value} />
  if (section === 'session_distribution') return <SessionDistribution value={value} />
  if (section === 'lag_features') return <SessionSnapshots rows={value} field="lag_features" />
  if (section === 'historical') return <SessionSnapshots rows={value} field="points" />
  if (['evaluation_metrics', 'baseline_comparison', 'horizon_comparison'].includes(section)) return <EvaluationMetrics section={section} value={value} />
  const rows = Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : null
  if (rows && groupBySession) return <SessionDataTables rows={rows} section={section} />
  if (rows) return <DataTable rows={rows} section={section} />
  if (value && typeof value === 'object') {
    return <dl className="biz-facts">{Object.entries(value).map(([key, entry]) => <div key={key} className="biz-facts__item">
      <dt>{label(key)}</dt><dd><DataValue value={entry} field={key} /></dd>
    </div>)}</dl>
  }
  return <p className="biz-value-text">{valueText(value)}</p>
}
