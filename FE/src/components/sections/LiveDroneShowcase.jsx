import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  BatteryCharging, 
  Eye, 
  Flame, 
  AlertTriangle, 
  Play, 
  Pause, 
  Car, 
  Bike, 
  Bus 
} from 'lucide-react';

const INTERSECTIONS = [
  {
    id: 'hang-xanh',
    name: 'Ngã tư Hàng Xanh (TP. Hồ Chí Minh)',
    code: 'UAV-SGN-01',
    altitude: '128m',
    battery: '84%',
    wind: '3.4 m/s (Đông Nam)',
    totalVehicles: 184,
    motorbikes: 142,
    cars: 34,
    buses: 5,
    trucks: 3,
    avgSpeed: '18.5 km/h',
    congestionLevel: 'Mức 3 - Dòng chảy chậm',
    alertText: 'Xung đột dòng xe rẽ trái Điện Biên Phủ -> Xô Viết Nghệ Tĩnh.'
  },
  {
    id: 'mai-dich',
    name: 'Cầu Vượt Mai Dịch (Hà Nội)',
    code: 'UAV-HAN-02',
    altitude: '145m',
    battery: '91%',
    wind: '2.1 m/s (Đông Bắc)',
    totalVehicles: 215,
    motorbikes: 158,
    cars: 46,
    buses: 7,
    trucks: 4,
    avgSpeed: '22.0 km/h',
    congestionLevel: 'Mức 2 - Lưu thông ổn định',
    alertText: 'Đường gom Phạm Văn Đồng nhập làn Vành đai 3 an toàn.'
  },
  {
    id: 'fpt-danang',
    name: 'Nút Giao Khu CNC FPT (Đà Nẵng)',
    code: 'UAV-DAD-03',
    altitude: '110m',
    battery: '78%',
    wind: '4.8 m/s (Gió biển)',
    totalVehicles: 92,
    motorbikes: 68,
    cars: 20,
    buses: 3,
    trucks: 1,
    avgSpeed: '38.4 km/h',
    congestionLevel: 'Mức 1 - Rất thông thoáng',
    alertText: 'Dòng xe lưu thông nhịp nhàng, chu kỳ đèn 45s tối ưu.'
  }
];

export default function LiveDroneShowcase() {
  const [selectedLocation, setSelectedLocation] = useState(INTERSECTIONS[0]);
  const [activeLayer, setActiveLayer] = useState('all'); // 'all', 'boxes', 'heatmap', 'vectors'
  const [isPlaying, setIsPlaying] = useState(true);
  const [fps, setFps] = useState(58);
  const [detectedCount, setDetectedCount] = useState(selectedLocation.totalVehicles);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setDetectedCount(prev => Math.max(20, prev + Math.floor(Math.random() * 5) - 2));
      setFps(Math.floor(57 + Math.random() * 4));
    }, 2000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleSelect = (item) => {
    setSelectedLocation(item);
    setDetectedCount(item.totalVehicles);
  };

  return (
    <section id="live-demo" style={{ padding: '80px 0' }}>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <span className="section-tag">Interactive Live HUD</span>
          <h2 className="section-title">Trải Nghiệm Trực Quan Hệ Thống Giám Sát UAV</h2>
          <p className="section-desc">
            Xem thử giao diện nhận diện phương tiện, đo đếm lưu lượng và bản đồ nhiệt từ camera Flycam theo thời gian thực.
          </p>
        </div>

        {/* HUD Box */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border-medium)',
          borderRadius: '20px',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden'
        }}>
          {/* Top Bar */}
          <div style={{
            background: '#f8fafc',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-emerald">
                <Radio size={13} /> {selectedLocation.code} • LIVE 4K
              </span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedLocation.name}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-blue">YOLOv11x + ByteTrack ({fps} FPS)</span>
              <span className="badge badge-amber">Vận tốc TB: {selectedLocation.avgSpeed}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr' }}>
            {/* Sidebar Controls */}
            <div style={{ background: '#f8fafc', borderRight: '1px solid var(--border-subtle)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  CHỌN ĐIỂM GIÁM SÁT
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                  {INTERSECTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        textAlign: 'left',
                        background: selectedLocation.id === item.id ? 'var(--brand-light)' : '#ffffff',
                        border: selectedLocation.id === item.id ? '1.5px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
                        color: selectedLocation.id === item.id ? 'var(--brand-primary)' : 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {item.name.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drone Specs */}
              <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
                  THÔNG SỐ FLYCAM
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>ĐỘ CAO:</span>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedLocation.altitude}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>PIN:</span>
                    <div style={{ fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <BatteryCharging size={13} /> {selectedLocation.battery}
                    </div>
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>PHÂN LOẠI XE</span>
                  <span className="mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-primary)' }}>{detectedCount} tổng</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0369a1' }}><Bike size={13} /> Xe Máy</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{selectedLocation.motorbikes}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669' }}><Car size={13} /> Ô Tô Con</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{selectedLocation.cars}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#d97706' }}><Bus size={13} /> Xe Buýt</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{selectedLocation.buses}</span>
                  </div>
                </div>
              </div>

              {/* Alert */}
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#92400e', fontSize: '12px', fontWeight: 700 }}>
                  <AlertTriangle size={14} /> {selectedLocation.congestionLevel}
                </div>
                <p style={{ fontSize: '11px', color: '#78350f', marginTop: '4px', lineHeight: 1.4 }}>
                  {selectedLocation.alertText}
                </p>
              </div>
            </div>

            {/* Main Viewport */}
            <div style={{ position: 'relative', background: '#f1f5f9', minHeight: '440px', overflow: 'hidden' }}>
              <div className="simulated-intersection" style={{ position: 'absolute', inset: 0 }}>
                <div className="road-h">
                  <div className="road-line-h"></div>
                </div>
                <div className="road-v">
                  <div className="road-line-v"></div>
                </div>
              </div>

              {/* Heatmap Layer */}
              {(activeLayer === 'all' || activeLayer === 'heatmap') && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.25) 0%, rgba(245, 158, 11, 0.2) 30%, transparent 60%)',
                  pointerEvents: 'none'
                }}></div>
              )}

              {/* Vehicles */}
              {(activeLayer === 'all' || activeLayer === 'boxes') && (
                <>
                  <div className="ai-box-light ai-box-moto" style={{ top: '34%', left: '30%' }}>#104 Moto (24 km/h)</div>
                  <div className="ai-box-light ai-box-moto" style={{ top: '38%', left: '36%' }}>#109 Moto (22 km/h)</div>
                  <div className="ai-box-light ai-box-moto" style={{ top: '42%', left: '26%' }}>#115 Moto (19 km/h)</div>
                  <div className="ai-box-light ai-box-moto" style={{ top: '56%', left: '62%' }}>#122 Moto (28 km/h)</div>

                  <div className="ai-box-light ai-box-car" style={{ top: '46%', left: '20%' }}>#88 Car (Sedan)</div>
                  <div className="ai-box-light ai-box-car" style={{ top: '52%', left: '72%' }}>#92 Car (SUV)</div>
                  <div className="ai-box-light ai-box-car" style={{ top: '22%', left: '52%' }}>#95 Car</div>

                  <div className="ai-box-light ai-box-bus" style={{ top: '48%', left: '38%' }}>#45 VinBus Electric (14 km/h)</div>
                </>
              )}

              {/* Bottom Control Bar */}
              <div style={{
                position: 'absolute',
                bottom: '16px',
                left: '20px',
                right: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#ffffff',
                border: '1px solid var(--border-medium)',
                borderRadius: '12px',
                padding: '8px 14px',
                boxShadow: 'var(--shadow-md)'
              }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setActiveLayer('all')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: activeLayer === 'all' ? 'var(--brand-primary)' : '#f1f5f9',
                      color: activeLayer === 'all' ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Tất Cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLayer('boxes')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: activeLayer === 'boxes' ? 'var(--brand-primary)' : '#f1f5f9',
                      color: activeLayer === 'boxes' ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Eye size={12} /> Bounding Box
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLayer('heatmap')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: activeLayer === 'heatmap' ? 'var(--brand-primary)' : '#f1f5f9',
                      color: activeLayer === 'heatmap' ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Flame size={12} /> Bản Đồ Nhiệt
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{ padding: '6px 14px', fontSize: '12px' }}
                >
                  {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                  <span>{isPlaying ? 'Tạm Dừng' : 'Tiếp Tục'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
