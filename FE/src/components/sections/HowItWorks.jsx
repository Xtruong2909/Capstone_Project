import React from 'react';
import { 
  UploadCloud, 
  Cpu, 
  TrendingUp 
} from 'lucide-react';

const STEPS = [
  {
    step: '1',
    icon: <UploadCloud size={24} className="text-cyan-600" />,
    title: '1. Kết Nối Hoặc Tải Lên Video Drone',
    desc: 'Nạp luồng video trực tiếp RTSP từ flycam bay tuần tra hoặc tải lên các tệp video 4K quay cảnh nút giao thông cần phân tích.'
  },
  {
    step: '2',
    icon: <Cpu size={24} className="text-emerald-600" />,
    title: '2. Hệ Thống AI Xử Lý & Bám Vết',
    desc: 'Thuật toán YOLOv11 + ByteTrack tự động nhận diện phương tiện, khử rung lắc và trích xuất véc-tơ vận tốc cùng bản đồ nhiệt mật độ.'
  },
  {
    step: '3',
    icon: <TrendingUp size={24} className="text-blue-600" />,
    title: '3. Nhận Dự Báo Ùn Tắc & Khuyến Nghị',
    desc: 'Mô hình ST-GNN phân tích và dự báo nguy cơ tắc nghẽn trong 15–60 phút tới, đưa ra khuyến nghị điều chỉnh chu kỳ đèn tín hiệu tối ưu.'
  }
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: '80px 0', background: '#ffffff', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <span className="section-tag">Easy Workflow</span>
          <h2 className="section-title">Quy Trình Hoạt Động Đơn Giản</h2>
          <p className="section-desc">
            Chỉ với 3 bước dễ dàng để bắt đầu giám sát và dự báo dòng chảy giao thông với độ chính xác cao.
          </p>
        </div>

        {/* Steps */}
        <div className="how-it-works-grid">
          {STEPS.map((item, idx) => (
            <div key={idx} className="step-card">
              <div className="step-badge">{item.step}</div>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#f8fafc',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto'
              }}>
                {item.icon}
              </div>
              <h4>{item.title}</h4>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
