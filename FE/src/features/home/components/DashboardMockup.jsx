import {
  Home, Database, BarChart3, Settings, HelpCircle, Car, Gauge, Users, ArrowLeftRight, TrendingUp,
} from 'lucide-react'

const KPIS = [
  { icon: Car, color: 'blue', label: 'Vehicle Count', value: '12,843', delta: '12.5%' },
  { icon: Gauge, color: 'purple', label: 'Avg. Speed', value: '42.7 km/h', delta: '5.2%' },
  { icon: Users, color: 'green', label: 'Traffic Density', value: '68.3 veh/km', delta: '6.7%' },
  { icon: ArrowLeftRight, color: 'blue', label: 'Traffic Flow', value: '548 veh/h', delta: '6.1%' },
]

const PEAKS = [
  { t: '07:45 – 08:15', d: '156.8', s: '28.4', lvl: 'High' },
  { t: '08:30 – 09:00', d: '118.3', s: '36.7', lvl: 'Medium' },
  { t: '11:00 – 11:30', d: '106.4', s: '45.1', lvl: 'Medium' },
]

const SERIES = [
  { color: '#7c3aed', pts: [38, 40, 36, 44, 52, 48, 56, 50, 54, 46] },
  { color: '#12a05a', pts: [26, 28, 24, 30, 34, 30, 38, 32, 30, 28] },
  { color: '#f59e0b', pts: [18, 20, 19, 22, 24, 20, 22, 20, 21, 19] },
  { color: '#1668e3', pts: [12, 14, 10, 15, 18, 12, 16, 14, 13, 12] },
]

function toPath(pts, w, h, max) {
  const step = w / (pts.length - 1)
  return pts.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`).join(' ')
}

export default function DashboardMockup() {
  return (
    <div className="mock" role="img" aria-label="Preview of the Traffic Analytics Dashboard">
      <aside className="mock__side">
        <div className="mock__side-item"><Home size={14} /> Dashboard</div>
        <div className="mock__side-item"><Database size={14} /> Dataset Access</div>
        <div className="mock__side-item is-parent"><BarChart3 size={14} /> Traffic Analytics</div>
        <div className="mock__side-sub is-active">Analytics Dashboard</div>
        <div className="mock__side-sub">Forecast Results</div>
        <div className="mock__side-sub">Reporting</div>
        <div className="mock__side-foot">
          <div className="mock__side-item"><Settings size={14} /> Settings</div>
          <div className="mock__side-item"><HelpCircle size={14} /> Help</div>
        </div>
      </aside>

      <div className="mock__main">
        <div className="mock__crumb">Home › Business Analytics › Traffic Analytics Dashboard</div>
        <div className="mock__title">Traffic Analytics Dashboard</div>

        <div className="mock__kpis">
          {KPIS.map(({ icon: Icon, color, label, value, delta }) => (
            <div className="mock__kpi" key={label}>
              <span className={`icon-chip icon-chip--${color}`}><Icon size={16} /></span>
              <div>
                <small>{label}</small>
                <strong>{value}</strong>
                <em><TrendingUp size={10} /> {delta}</em>
              </div>
            </div>
          ))}
        </div>

        <div className="mock__row">
          <div className="mock__panel mock__panel--chart">
            <div className="mock__panel-head">
              <b>Traffic Trends</b>
              <span className="mock__tabs"><i className="on">1H</i><i>6H</i><i>12H</i><i>24H</i></span>
            </div>
            <svg viewBox="0 0 320 110" preserveAspectRatio="none" className="mock__chart">
              {[0, 1, 2, 3].map((g) => (
                <line key={g} x1="0" x2="320" y1={g * 36 + 2} y2={g * 36 + 2} stroke="#e4ecf6" />
              ))}
              {SERIES.map((s) => (
                <path key={s.color} d={toPath(s.pts, 320, 106, 60)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </svg>
          </div>

          <div className="mock__panel mock__panel--map">
            <div className="mock__panel-head"><b>Traffic Density Map</b></div>
            <div className="mock__heat">
              <span style={{ left: '30%', top: '45%', width: 54, height: 54 }} />
              <span style={{ left: '55%', top: '30%', width: 64, height: 64 }} />
              <span style={{ left: '65%', top: '58%', width: 46, height: 46 }} />
              <span style={{ left: '18%', top: '25%', width: 34, height: 34 }} />
            </div>
          </div>
        </div>

        <div className="mock__panel">
          <div className="mock__panel-head"><b>Peak Traffic Periods</b></div>
          <table className="mock__table">
            <thead><tr><th>Time period</th><th>Density</th><th>Speed</th><th>Status</th></tr></thead>
            <tbody>
              {PEAKS.map((p) => (
                <tr key={p.t}>
                  <td>{p.t}</td><td>{p.d}</td><td>{p.s}</td>
                  <td><span className={`pill pill--${p.lvl === 'High' ? 'red' : 'orange'}`}>{p.lvl}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
