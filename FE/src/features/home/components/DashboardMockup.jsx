import {
  Home,
  Database,
  BarChart3,
  Settings,
  HelpCircle,
  Car,
  Gauge,
  Users,
  Activity,
  TrendingUp,
  Cpu,
  Target,
} from 'lucide-react'

// Metrics aligned with De_tai_Phan_tich_giao_thong_UAV.docx (Section 1 & 4)
const KPIS = [
  {
    icon: Activity,
    color: 'blue',
    label: 'Observed Flow (08:04)',
    value: '52 veh/min',
    delta: '+3.8% vs prev min',
    sub: 'Microscopic UAV count',
  },
  {
    icon: Target,
    color: 'orange',
    label: 'Forecasted Flow (t+1)',
    value: '50 veh/min',
    delta: 'Residual: -2.0 veh/min',
    sub: 'Random Forest Model',
  },
  {
    icon: Gauge,
    color: 'purple',
    label: 'Average Speed',
    value: '38.4 km/h',
    delta: 'Flow speed index',
    sub: 'Tracked vehicles',
  },
  {
    icon: Users,
    color: 'green',
    label: 'Estimated Density',
    value: '46.8 veh/km',
    delta: 'Normal flow level',
    sub: 'Spatial segment density',
  },
]

// 1-minute time series points (08:00 to 08:09) matching document example at 08:04
const ACTUAL_FLOW = [44, 46, 48, 50, 52, 53, 55, 51, 49, 47]
const PREDICTED_FLOW = [43, 45, 47, 51, 50, 52, 54, 52, 48, 46]
const BASELINE_FLOW = [42, 44, 45, 47, 48, 50, 51, 49, 47, 45]

function toPath(pts, w, h, minVal, maxVal) {
  const step = w / (pts.length - 1)
  const range = maxVal - minVal
  return pts
    .map((p, i) => {
      const normY = h - ((p - minVal) / range) * (h - 16) - 8
      return `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${normY.toFixed(1)}`
    })
    .join(' ')
}

export default function DashboardMockup() {
  return (
    <div className="mock" role="img" aria-label="Preview of the UAV Traffic Flow Analytics Dashboard">
      <aside className="mock__side">
        <div className="mock__side-item">
          <Home size={14} /> Overview
        </div>
        <div className="mock__side-item">
          <Database size={14} /> pNEUMA Dataset
        </div>
        <div className="mock__side-item is-parent">
          <BarChart3 size={14} /> Traffic Analytics
        </div>
        <div className="mock__side-sub is-active">1–5 Min Forecasting</div>
        <div className="mock__side-sub">Model Comparison</div>
        <div className="mock__side-sub">Error Benchmarks</div>
        <div className="mock__side-foot">
          <div className="mock__side-item">
            <Settings size={14} /> Settings
          </div>
          <div className="mock__side-item">
            <HelpCircle size={14} /> Research Docs
          </div>
        </div>
      </aside>

      <div className="mock__main">
        <div className="mock__crumb">
          pNEUMA Athens Drone Session › 1-Minute Aggregation › Random Forest Prediction
        </div>
        <div className="mock__title">
          UAV Short-Term Traffic Flow Prediction Dashboard
        </div>

        {/* 4 Primary Indicators */}
        <div className="mock__kpis">
          {KPIS.map(({ icon: Icon, color, label, value, delta, sub }) => (
            <div className="mock__kpi" key={label}>
              <span className={`icon-chip icon-chip--${color}`}>
                <Icon size={16} />
              </span>
              <div>
                <small>{label}</small>
                <strong>{value}</strong>
                <em>{delta}</em>
              </div>
            </div>
          ))}
        </div>

        {/* Chart row with 1, 3, 5 min horizon tabs */}
        <div className="mock__row">
          <div className="mock__panel mock__panel--chart">
            <div className="mock__panel-head">
              <div>
                <b>Traffic Flow Comparison (veh/min)</b>
                <span className="mock__subhead">Actual (08:04: 52 veh/min) vs. Forecast (50 veh/min)</span>
              </div>
              <div className="mock__tabs">
                <i className="on">1 Min Horizon</i>
                <i>3 Min</i>
                <i>5 Min</i>
              </div>
            </div>

            <svg viewBox="0 0 340 110" preserveAspectRatio="none" className="mock__chart">
              {/* Grid lines */}
              {[0, 1, 2, 3].map((g) => (
                <line
                  key={g}
                  x1="0"
                  x2="340"
                  y1={g * 28 + 8}
                  y2={g * 28 + 8}
                  stroke="#e4ecf6"
                  strokeDasharray="2,2"
                />
              ))}

              {/* Baseline Historical Avg (Dotted Green) */}
              <path
                d={toPath(BASELINE_FLOW, 340, 100, 40, 60)}
                fill="none"
                stroke="#12a05a"
                strokeWidth="1.6"
                strokeDasharray="4,3"
              />

              {/* Random Forest Predicted (Amber) */}
              <path
                d={toPath(PREDICTED_FLOW, 340, 100, 40, 60)}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Observed Actual Flow (Royal Blue) */}
              <path
                d={toPath(ACTUAL_FLOW, 340, 100, 40, 60)}
                fill="none"
                stroke="#1668e3"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Highlight circle at 08:04 (index 4) */}
              <circle cx={4 * (340 / 9)} cy={100 - ((52 - 40) / 20) * 84 - 8} r="4" fill="#1668e3" stroke="#fff" strokeWidth="2" />
              <circle cx={4 * (340 / 9)} cy={100 - ((50 - 40) / 20) * 84 - 8} r="4" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
            </svg>

            <div className="mock__legend">
              <span><i style={{ background: '#1668e3' }}></i> Observed Flow</span>
              <span><i style={{ background: '#f59e0b' }}></i> Random Forest (t+1)</span>
              <span><i style={{ background: '#12a05a' }}></i> Persistence Baseline</span>
            </div>
          </div>

          <div className="mock__panel mock__panel--bench">
            <div className="mock__panel-head">
              <b>Model Error Benchmarks</b>
            </div>
            <div className="mock__metrics-list">
              <div className="mock__metric-card">
                <span>Random Forest (Core ML)</span>
                <div>
                  <strong>MAE: 2.15 veh/min</strong>
                  <small>RMSE: 2.84 veh/min</small>
                </div>
              </div>
              <div className="mock__metric-card is-baseline">
                <span>Historical Average (Baseline)</span>
                <div>
                  <strong>MAE: 4.62 veh/min</strong>
                  <small>RMSE: 5.71 veh/min</small>
                </div>
              </div>
              <div className="mock__metric-card is-lstm">
                <span>LSTM Neural Network (Extension)</span>
                <div>
                  <strong>MAE: 2.08 veh/min</strong>
                  <small>RMSE: 2.76 veh/min</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Temporal Flow Table */}
        <div className="mock__panel">
          <div className="mock__panel-head">
            <b>Recent 1-Minute Chronological Ingestion &amp; Forecast Validation</b>
          </div>
          <table className="mock__table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Observed Flow</th>
                <th>Predicted (t+1)</th>
                <th>Avg Speed</th>
                <th>Density</th>
                <th>Evaluation Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>08:04:00 (Doc Example)</td>
                <td><strong>52 veh/min</strong></td>
                <td>50 veh/min</td>
                <td>38.4 km/h</td>
                <td>46.8 veh/km</td>
                <td><span className="pill pill--green">Δ -2 veh/min (Valid)</span></td>
              </tr>
              <tr>
                <td>08:03:00</td>
                <td>50 veh/min</td>
                <td>51 veh/min</td>
                <td>39.1 km/h</td>
                <td>44.5 veh/km</td>
                <td><span className="pill pill--green">Δ +1 veh/min</span></td>
              </tr>
              <tr>
                <td>08:02:00</td>
                <td>48 veh/min</td>
                <td>47 veh/min</td>
                <td>40.2 km/h</td>
                <td>42.1 veh/km</td>
                <td><span className="pill pill--green">Δ -1 veh/min</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
