import React from 'react';
import { 
  X, 
  Plane, 
  BatteryCharging, 
  Signal, 
  MapPin, 
  Radio 
} from 'lucide-react';

const DRONE_FLEET = [
  {
    id: 'drone-01',
    name: 'AeroDrone Alpha (DJI Matrice 350 RTK)',
    location: 'Ngã tư Hàng Xanh, Bình Thạnh, TP.HCM',
    status: 'Đang Bay Tuần Tra (Active)',
    battery: '84%',
    batteryColor: 'var(--emerald-400)',
    signal: '98% (RTK Fixed)',
    altitude: '128 m AGL',
    flightTime: '28 min / 45 min',
    payload: 'Zenmuse H20T 4K Camera',
    speed: '1.2 m/s (Hovering)',
    temp: '32°C'
  },
  {
    id: 'drone-02',
    name: 'AeroDrone Beta (DJI Inspire 3 Cine)',
    location: 'Cầu Vượt Mai Dịch, Cầu Giấy, Hà Nội',
    status: 'Đang Bay Tuần Tra (Active)',
    battery: '91%',
    batteryColor: 'var(--emerald-400)',
    signal: '95% (O3 Pro)',
    altitude: '145 m AGL',
    flightTime: '15 min / 50 min',
    payload: 'X9-8K Air Gimbal',
    speed: '0.8 m/s (Stationary)',
    temp: '29°C'
  },
  {
    id: 'drone-03',
    name: 'AeroDrone Gamma (Autel EVO Max 4T)',
    location: 'Nút Giao Khu CNC FPT, Ngũ Hành Sơn, Đà Nẵng',
    status: 'Đang Bay Tuần Tra (Active)',
    battery: '78%',
    batteryColor: 'var(--emerald-400)',
    signal: '92% (Autel Skylink 3.0)',
    altitude: '110 m AGL',
    flightTime: '34 min / 42 min',
    payload: '8K 10x Optical Zoom + Thermal',
    speed: '2.4 m/s (Grid Patrol)',
    temp: '31°C'
  },
  {
    id: 'drone-04',
    name: 'AeroDrone Delta (DJI Matrice 300 RTK)',
    location: 'Trạm Sạc Tự Động FPT Software Hòa Lạc',
    status: 'Đang Nạp Năng Lượng (Docking Station)',
    battery: '45% (Đang Sạc Nhanh)',
    batteryColor: 'var(--amber-400)',
    signal: '100% (Gigabit Ethernet)',
    altitude: '0 m (On Dock)',
    flightTime: 'Sẵn sàng sau 12 phút',
    payload: 'Zenmuse H20N Starlight',
    speed: '0.0 m/s',
    temp: '26°C'
  }
];

export default function LiveTelemetryModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '840px' }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--emerald-400)'
            }}>
              <Radio size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>Hệ Thống Đội Bay UAV Toàn Tuyến (Fleet Telemetry)</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>4 Thiết Bị Trực Tuyến • Đồng bộ hóa RTK độ chính xác centimet</p>
            </div>
          </div>

          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body Fleet List */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {DRONE_FLEET.map((drone) => (
            <div 
              key={drone.id}
              style={{
                background: 'rgba(11, 17, 33, 0.85)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Plane size={18} className="text-cyan-400" />
                  <span style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>{drone.name}</span>
                </div>
                <span className="badge badge-emerald" style={{ fontSize: '11px' }}>
                  <span className="pulse-dot" style={{ width: '6px', height: '6px' }}></span>
                  {drone.status}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '14px' }}>
                <MapPin size={14} className="text-cyan-400" />
                <span>{drone.location}</span>
              </div>

              {/* Grid Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>PIN NĂNG LƯỢNG</div>
                  <div style={{ color: drone.batteryColor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <BatteryCharging size={13} /> {drone.battery}
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>TÍN HIỆU RTK / LINK</div>
                  <div style={{ color: 'var(--cyan-300)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Signal size={13} /> {drone.signal}
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>ĐỘ CAO BAY (AGL)</div>
                  <div style={{ color: '#fff', fontWeight: 700 }}>{drone.altitude}</div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>THỜI GIAN BAY</div>
                  <div style={{ color: 'var(--amber-400)', fontWeight: 700 }}>{drone.flightTime}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Đóng Cửa Sổ
          </button>
        </div>
      </div>
    </div>
  );
}
