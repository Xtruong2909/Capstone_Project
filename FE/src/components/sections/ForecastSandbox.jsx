import React, { useState } from 'react';
import { 
  Clock, 
  CloudRain, 
  Sun, 
  AlertCircle, 
  Check, 
  Flame 
} from 'lucide-react';

const TIME_HORIZONS = [
  { id: '15min', label: '+15 Phút', icon: <Clock size={15} /> },
  { id: '30min', label: '+30 Phút', icon: <Clock size={15} /> },
  { id: '45min', label: '+45 Phút', icon: <Clock size={15} /> },
  { id: '60min', label: '+60 Phút', icon: <Clock size={15} /> }
];

const SCENARIOS = [
  { id: 'normal', label: 'Bình Thường (Giờ Thấp Điểm)', icon: <Sun size={15} /> },
  { id: 'rush_hour', label: 'Cao Điểm Chiều (Tan Tầm)', icon: <Flame size={15} /> },
  { id: 'rain', label: 'Thời Tiết Mưa To', icon: <CloudRain size={15} /> },
  { id: 'incident', label: 'Mô Phỏng Có Va Chạm Làn 2', icon: <AlertCircle size={15} /> }
];

const PREDICTIONS = {
  '15min': {
    normal: { risk: 18, speed: '34.2 km/h', queue: '25m', volume: '1,240 xe/h', signalAdvice: 'Duy trì chu kỳ đèn hiện tại (60s)', level: 'Mức 1 - Thông Thoáng', levelBg: '#ecfdf5', levelColor: '#065f46' },
    rush_hour: { risk: 68, speed: '16.5 km/h', queue: '120m', volume: '3,800 xe/h', signalAdvice: 'Tăng pha đèn xanh hướng chính thêm 15s', level: 'Mức 3 - Dòng Chảy Chậm', levelBg: '#fffbeb', levelColor: '#92400e' },
    rain: { risk: 54, speed: '21.0 km/h', queue: '85m', volume: '2,900 xe/h', signalAdvice: 'Tăng khoảng cách đệm an toàn giữa các pha 4s', level: 'Mức 2 - Nguy Cơ Tắc TB', levelBg: '#eff6ff', levelColor: '#1e40af' },
    incident: { risk: 85, speed: '9.8 km/h', queue: '210m', volume: '4,100 xe/h', signalAdvice: 'Kích hoạt biển báo phân luồng từ xa qua đường gom', level: 'Mức 4 - Ùn Tắc Nghiêm Trọng', levelBg: '#fff1f2', levelColor: '#9f1239' }
  },
  '30min': {
    normal: { risk: 22, speed: '32.8 km/h', queue: '35m', volume: '1,380 xe/h', signalAdvice: 'Không cần can thiệp', level: 'Mức 1 - Thông Thoáng', levelBg: '#ecfdf5', levelColor: '#065f46' },
    rush_hour: { risk: 84, speed: '11.2 km/h', queue: '190m', volume: '4,450 xe/h', signalAdvice: 'Ưu tiên xả luồng hướng rẽ trái Điện Biên Phủ', level: 'Mức 4 - Ùn Tắc Nghiêm Trọng', levelBg: '#fff1f2', levelColor: '#9f1239' },
    rain: { risk: 72, speed: '14.5 km/h', queue: '140m', volume: '3,350 xe/h', signalAdvice: 'Giảm chu kỳ đèn tổng thể để giải tỏa xung đột', level: 'Mức 3 - Dòng Chảy Chậm', levelBg: '#fffbeb', levelColor: '#92400e' },
    incident: { risk: 94, speed: '5.4 km/h', queue: '380m', volume: '4,900 xe/h', signalAdvice: 'Cảnh báo CSGT can thiệp trực tiếp điều tiết', level: 'Mức 4 - Tắc Nghẽn Cực Độ', levelBg: '#fff1f2', levelColor: '#9f1239' }
  },
  '45min': {
    normal: { risk: 28, speed: '30.1 km/h', queue: '45m', volume: '1,500 xe/h', signalAdvice: 'Chu kỳ bình thường', level: 'Mức 1 - Thông Thoáng', levelBg: '#ecfdf5', levelColor: '#065f46' },
    rush_hour: { risk: 91, speed: '8.4 km/h', queue: '260m', volume: '4,800 xe/h', signalAdvice: 'Điều chỉnh làn rẽ linh hoạt (Dynamic Lane)', level: 'Mức 4 - Tắc Nghẽn Kéo Dài', levelBg: '#fff1f2', levelColor: '#9f1239' },
    rain: { risk: 80, speed: '12.0 km/h', queue: '180m', volume: '3,600 xe/h', signalAdvice: 'Điều hướng phương tiện qua các trục đường vành đai', level: 'Mức 3 - Dòng Chảy Chậm', levelBg: '#fffbeb', levelColor: '#92400e' },
    incident: { risk: 88, speed: '7.2 km/h', queue: '310m', volume: '4,650 xe/h', signalAdvice: 'Cứu hộ hoàn tất giải phóng làn xe bị sự cố', level: 'Mức 4 - Đang Giải Tỏa Dần', levelBg: '#fff1f2', levelColor: '#9f1239' }
  },
  '60min': {
    normal: { risk: 25, speed: '33.0 km/h', queue: '30m', volume: '1,320 xe/h', signalAdvice: 'Trạng thái ổn định', level: 'Mức 1 - Thông Thoáng', levelBg: '#ecfdf5', levelColor: '#065f46' },
    rush_hour: { risk: 48, speed: '24.5 km/h', queue: '75m', volume: '2,600 xe/h', signalAdvice: 'Dòng xe bắt đầu hạ nhiệt sau giờ cao điểm', level: 'Mức 2 - Bắt Đầu Lưu Thông Tốt', levelBg: '#eff6ff', levelColor: '#1e40af' },
    rain: { risk: 62, speed: '18.0 km/h', queue: '110m', volume: '3,000 xe/h', signalAdvice: 'Duy trì chế độ đèn thời tiết xấu', level: 'Mức 3 - Lưu Lượng Trung Bình', levelBg: '#fffbeb', levelColor: '#92400e' },
    incident: { risk: 40, speed: '26.8 km/h', queue: '60m', volume: '2,400 xe/h', signalAdvice: 'Khôi phục chu kỳ đèn tự động chuẩn', level: 'Mức 2 - Bình Thường Hóa', levelBg: '#ecfdf5', levelColor: '#065f46' }
  }
};

export default function ForecastSandbox() {
  const [horizon, setHorizon] = useState('30min');
  const [scenario, setScenario] = useState('rush_hour');

  const current = PREDICTIONS[horizon][scenario];

  return (
    <section id="forecast" style={{ padding: '80px 0', background: '#ffffff', borderTop: '1px solid var(--border-subtle)' }}>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <span className="section-tag">AI Forecasting Demo</span>
          <h2 className="section-title">Mô Phỏng Dự Báo Tắc Nghẽn Ngắn Hạn</h2>
          <p className="section-desc">
            Chọn mốc thời gian và điều kiện thực tế để xem mạng nơ-ron không-thời gian (ST-GNN) dự báo lưu lượng và gợi ý phương án điều phối giao thông.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          padding: '36px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '36px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase' }}>
                1. Khoảng Thời Gian Dự Báo Tương Lai
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {TIME_HORIZONS.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setHorizon(item.id)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: horizon === item.id ? '1.5px solid var(--brand-primary)' : '1px solid var(--border-medium)',
                      background: horizon === item.id ? 'var(--brand-light)' : '#ffffff',
                      color: horizon === item.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {item.icon} {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase' }}>
                2. Kịch Bản / Điều Kiện Ngoại Cảnh
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {SCENARIOS.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setScenario(item.id)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: scenario === item.id ? '1.5px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
                      background: scenario === item.id ? '#ffffff' : '#ffffff',
                      color: scenario === item.id ? 'var(--brand-primary)' : 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: scenario === item.id ? 'var(--shadow-md)' : 'none'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {item.icon} {item.label}
                    </span>
                    {scenario === item.id && <Check size={16} className="text-cyan-600" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Display */}
          <div style={{
            background: '#ffffff',
            border: '1px solid var(--border-medium)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  KẾT QUẢ DỰ BÁO AI
                </span>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: current.levelBg,
                  color: current.levelColor
                }}>
                  {current.level}
                </span>
              </div>

              {/* Progress Meter */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Chỉ Số Ùn Tắc Dự Báo (Jam Index):</span>
                  <span className="mono" style={{ fontSize: '18px', fontWeight: 800, color: current.levelColor }}>
                    {current.risk}%
                  </span>
                </div>
                <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${current.risk}%`,
                    height: '100%',
                    borderRadius: '5px',
                    background: current.risk > 70 ? '#ef4444' : current.risk > 40 ? '#f59e0b' : '#10b981',
                    transition: 'width 0.4s ease'
                  }}></div>
                </div>
              </div>

              {/* 3 Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>VẬN TỐC TB</div>
                  <div className="mono" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {current.speed}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>HÀNG CHỜ</div>
                  <div className="mono" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {current.queue}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>LƯU LƯỢNG</div>
                  <div className="mono" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {current.volume}
                  </div>
                </div>
              </div>
            </div>

            {/* Advice Box */}
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '10px',
              padding: '14px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#15803d', marginBottom: '2px' }}>
                💡 Đề Xuất Điều Phối Đèn Tín Hiệu:
              </div>
              <p style={{ fontSize: '13px', color: '#166534', lineHeight: 1.45 }}>
                {current.signalAdvice}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
