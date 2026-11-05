import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  Table2,
} from 'lucide-react'
import { useAggregationExplorer } from '../../../hooks/useTrafficForecast'
import LineChart from './LineChart'
import { formatDate, formatNumber } from '../utils/formatters'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DEFAULT_ROI = 'MAIN_ROI'

/**
 * Charts (GET .../chart-data) + aggregated table (GET .../preview).
 * Uses 1-minute MAIN_ROI data by default; callers can override these parameters.
 * `refreshKey` changes force a reload (e.g. after an aggregation job finishes).
 */
export default function AggregationExplorer({
  datasetId,
  versionId,
  aggregationInterval = 60,
  roiIdentifier = DEFAULT_ROI,
  refreshKey = 0,
  showCharts = true,
  title = 'Traffic Time-Series Charts',
  subtitle = 'Vehicle Count, Average Speed, and Estimated Traffic Flow across time buckets.',
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const { chart, preview, isLoading, error, reload } = useAggregationExplorer(datasetId, {
    aggregationInterval,
    roiIdentifier,
    page,
    pageSize,
    refreshKey,
  })

  const totalPages = preview ? Math.max(1, Math.ceil(preview.total_count / pageSize)) : 1
  const units = chart?.calculation_metadata?.units || {}

  return (
    <>
      {/* Card 1: 3 Time-Series Charts */}
      {showCharts && (
      <section className="admin-card">
        <div className="admin-card__header">
          <div className="admin-card__header-left">
            <div className="admin-card__icon-box admin-card__icon-box--amber">
              <TrendingUp size={18} />
            </div>
            <div>
              <h2 className="admin-card__title">{title}</h2>
              <p className="admin-card__subtitle">{subtitle}</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={reload}
              disabled={isLoading}
              title="Reload chart and table data"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        <div className="sci-card-body">
          {error ? (
            <div className="sci-state sci-state--error">
              <p style={{ margin: 0, fontWeight: 700 }}>{error}</p>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.84rem' }}>
                If the data has not been aggregated yet, run it on the{' '}
                <Link to={`/scientist/datasets/${datasetId}/versions/${versionId}/train`}>
                  Training page
                </Link>
                .
              </p>
            </div>
          ) : isLoading && !chart ? (
            <div className="sci-chart-grid">
              {[1, 2, 3].map((n) => (
                <div key={n} className="sci-skeleton" style={{ height: 220 }} />
              ))}
            </div>
          ) : (
            <div className="sci-chart-grid">
              <LineChart
                title="Vehicle Count"
                unit={units.vehicle_count || 'vehicles / interval'}
                labels={chart?.time_labels}
                values={chart?.vehicle_count}
                color="#1668e3"
              />
              <LineChart
                title="Average Speed"
                unit={units.average_speed || 'km/h'}
                labels={chart?.time_labels}
                values={chart?.average_speed}
                color="#16a34a"
              />
              <LineChart
                title="Estimated Traffic Flow"
                unit={units.traffic_flow || 'vehicles / min'}
                labels={chart?.time_labels}
                values={chart?.traffic_flow}
                color="#ea580c"
              />
            </div>
          )}
        </div>
      </section>
      )}

      {/* Card 2: Aggregated Data Table */}
      {(!error || !showCharts) && (
        <section className="admin-card">
          <div className="admin-card__header">
            <div className="admin-card__header-left">
              <div className="admin-card__icon-box admin-card__icon-box--green">
                <Table2 size={18} />
              </div>
              <div>
                <h2 className="admin-card__title">Aggregated Traffic Records</h2>
                <p className="admin-card__subtitle">
                  Paginated time-bucket metrics computed from trajectory points
                </p>
              </div>
            </div>

            {preview && (
              <span className="badge badge--engineer">
                {formatNumber(preview.total_count)} bucket{preview.total_count === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div className="sci-card-body">
            {error ? (
              <div className="sci-state sci-state--error" role="alert">
                <p>{error}</p>
                <button type="button" className="btn-secondary" onClick={reload}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            ) : isLoading ? (
              <div className="sci-state" role="status">Loading aggregated traffic records...</div>
            ) : preview && preview.items.length === 0 ? (
              <div className="sci-state">No aggregated rows found for the selected filters.</div>
            ) : (
              <div className="sci-table-wrap">
                <table className="sci-table">
                  <thead>
                    <tr>
                      <th style={{ width: '48px', textAlign: 'center' }}>#</th>
                      <th>Time Bucket</th>
                      <th>Vehicle Count</th>
                      <th>Average Speed (km/h)</th>
                      <th>Traffic Flow (veh/min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview?.items || []).map((row, idx) => (
                      <tr key={row.id}>
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>
                          {(page - 1) * pageSize + idx + 1}
                        </td>
                        <td>{formatDate(row.time_bucket)}</td>
                        <td style={{ fontWeight: 700 }}>{formatNumber(row.vehicle_count)}</td>
                        <td>{row.mean_speed != null ? row.mean_speed.toFixed(2) : '—'}</td>
                        <td style={{ fontWeight: 700, color: '#ea580c' }}>
                          {row.traffic_flow != null ? row.traffic_flow.toFixed(2) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {preview && (
              <div className="sci-pager">
                <span>
                  Showing{' '}
                  <strong>
                    {preview.total_count === 0 ? 0 : formatNumber((page - 1) * pageSize + 1)}–
                    {formatNumber((page - 1) * pageSize + preview.items.length)}
                  </strong>{' '}
                  of <strong>{formatNumber(preview.total_count)}</strong> time buckets
                </span>
                <div className="sci-pager__controls">
                  <select
                    className="sci-dataset-select"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s} rows / page
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <span style={{ fontWeight: 600, padding: '0 0.35rem' }}>
                    Page {preview.page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!preview.has_more || isLoading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  )
}
