import React from 'react';
import { 
  Plane, 
  Crop, 
  Cpu, 
  Network, 
  Share2, 
  CheckCircle2 
} from 'lucide-react';

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Thu Thập Luồng Video Từ Đội Bay Drone (UAV Flight)',
    desc: 'Flycam tuần tra tại độ cao tiêu chuẩn 100m – 150m, quay video 4K 60FPS ghi lại toàn cảnh nút giao hoặc tuyến đường huyết mạch. Tích hợp giao thức truyền phát video trực tiếp RTSP/WebRTC về máy chủ phân tích.',
    tech: ['DJI Matrice / Autel EVO', 'RTSP / RTMP Stream', 'GPS & IMU Telemetry'],
    icon: <Plane size={24} className="text-cyan-400" />
  },
  {
    step: '02',
    title: 'Tiền Xử Lý Hình Ảnh & Khử Rung Camera (Homography)',
    desc: 'Áp dụng thuật toán Optical Flow và SIFT/ORB feature matching để bù trừ rung lắc do gió. Thực hiện hiệu chỉnh phối cảnh (Perspective Transformation) để chuyển ảnh từ góc nghiêng sang ảnh mặt đất chuẩn xác.',
    tech: ['SIFT Feature Matching', 'Homography Matrix', 'Ground Plane Projection'],
    icon: <Crop size={24} className="text-emerald-400" />
  },
  {
    step: '03',
    title: 'Phát Hiện & Bám Vết Quỹ Đạo (YOLOv11 + ByteTrack)',
    desc: 'Mô hình YOLOv11 Aerial Object Detector nhận diện 5 lớp phương tiện chính (Xe máy, Xe con, Xe buýt, Xe tải, Người đi bộ). Thuật toán ByteTrack gán định danh duy nhất (Track ID) và theo dõi tọa độ di chuyển qua từng khung hình.',
    tech: ['YOLOv11x Aerial Weights', 'ByteTrack Algorithm', 'Kalman Filter Smoothing'],
    icon: <Cpu size={24} className="text-blue-400" />
  },
  {
    step: '04',
    title: 'Mô Hình Hóa Đồ Thị Không-Thời Gian (ST-GNN Congestion)',
    desc: 'Xây dựng đồ thị động với các nút là các làn đường / nhánh rẽ giao cắt và cạnh là mối liên kết không gian. Mạng ST-GNN (Spatio-Temporal Graph Neural Network) dự báo vận tốc và chỉ số nghẽn tại từng nhánh sau 15–60 phút.',
    tech: ['PyTorch Geometric', 'ST-GCN / ASTGCN Architecture', 'Spatial-Temporal Attention'],
    icon: <Network size={24} className="text-amber-400" />
  },
  {
    step: '05',
    title: 'Phân Phối Cảnh Báo & Tích Hợp Trung Tâm Điều Hành',
    desc: 'Xuất dữ liệu dự báo qua RESTful API / WebSocket tới màn hình điều hành giao thông thành phố thông minh (Smart City TMC), hệ thống biển báo điện tử VMS và ứng dụng điều hướng giao thông công cộng.',
    tech: ['FastAPI Backend', 'WebSocket Pub/Sub', 'RESTful API Integration'],
    icon: <Share2 size={24} className="text-rose-400" />
  }
];

export default function AiPipeline() {
  return (
    <section id="pipeline" style={{ padding: '80px 0', background: 'rgba(5, 8, 15, 0.6)' }}>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <span className="section-tag">System Architecture & Workflow</span>
          <h2 className="section-title">Quy Trình Xử Lý & Kiến Trúc AI Pipeline</h2>
          <p className="section-desc">
            Quy trình khép kín 5 bước từ lúc Drone cất cánh ghi nhận dữ liệu cho đến khi tạo ra cảnh báo và dự báo lưu lượng dòng xe chính xác theo thời gian thực.
          </p>
        </div>

        {/* Steps List */}
        <div className="pipeline-container">
          {PIPELINE_STEPS.map((item, idx) => (
            <div key={idx} className="pipeline-step-card">
              <div className="step-number">{item.step}</div>

              <div className="step-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  {item.icon}
                  <h4>{item.title}</h4>
                </div>
                <p>{item.desc}</p>
              </div>

              <div className="step-tech-box">
                <div style={{ color: 'var(--cyan-400)', fontWeight: 600, marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase' }}>
                  Công Nghệ Áp Dụng
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {item.tech.map((t, tIdx) => (
                    <div key={tIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                      <CheckCircle2 size={12} className="text-emerald-400" />
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
