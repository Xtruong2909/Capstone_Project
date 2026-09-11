import React from 'react';
import { 
  Video, 
  Target, 
  BrainCircuit, 
  Activity, 
  AlertOctagon, 
  Box 
} from 'lucide-react';

const FEATURES = [
  {
    icon: <Video size={24} />,
    title: 'Xử Lý Video Drone 4K & Khử Rung Tự Động',
    desc: 'Hỗ trợ nạp trực tiếp luồng video 4K 60fps từ các dòng flycam phổ biến. Tự động bù trừ chuyển động rung lắc và nắn chỉnh phối cảnh (Bird’s Eye View) để trích xuất tọa độ di chuyển chuẩn xác.',
  },
  {
    icon: <Target size={24} />,
    title: 'Nhận Diện Đa Lớp & Theo Vết Quỹ Đạo Phương Tiện',
    desc: 'Sử dụng mô hình thị giác máy tính YOLOv11 kết hợp ByteTrack bám vết hàng ngàn xe máy, ô tô, xe buýt ngay cả trong điều kiện mật độ giao thông dày đặc và phức tạp.',
  },
  {
    icon: <BrainCircuit size={24} />,
    title: 'Dự Báo Ùn Tắc Sớm 15–60 Phút (ST-GNN)',
    desc: 'Ứng dụng mạng nơ-ron đồ thị không-thời gian để mô hình hóa sự lan truyền xung đột giao thông giữa các nút giao liên kết, đưa ra cảnh báo nguy cơ ùn ứ trước từ 15 đến 60 phút.',
  },
  {
    icon: <Activity size={24} />,
    title: 'Bản Đồ Nhiệt Mật Độ & Phân Tích Lưu Lượng Vi Mô',
    desc: 'Trực quan hóa bản đồ nhiệt (Density Heatmap), biểu đồ phân bố vận tốc, khoảng cách an toàn, tính toán ma trận gốc - đích (O-D Matrix) phục vụ quy hoạch giao thông thông minh.',
  },
  {
    icon: <AlertOctagon size={24} />,
    title: 'Cảnh Báo Sự Cố & Điểm Nghẽn Tức Thời',
    desc: 'Phát hiện tức thì các hiện tượng phương tiện dừng đỗ trái phép, xe gặp sự cố, xung đột rẽ nhánh và tắc nghẽn cục bộ để tự động gửi thông báo đến người điều hành.',
  },
  {
    icon: <Box size={24} />,
    title: 'Khuyến Nghị Tối Ưu Hóa Chu Kỳ Đèn Tín Hiệu',
    desc: 'Dựa trên lưu lượng dòng xe dự báo, hệ thống tự động tính toán và đưa ra đề xuất kéo dài hoặc rút ngắn thời gian pha đèn xanh thích ứng theo thời gian thực.',
  }
];

export default function CoreFeatures() {
  return (
    <section id="features" className="features-section">
      <div className="container">
        {/* Section Header */}
        <div className="section-header">
          <span className="section-tag">Core Capabilities</span>
          <h2 className="section-title">Các Tính Năng & Giải Pháp Nổi Bật</h2>
          <p className="section-desc">
            AeroTraffic AI cung cấp bộ công cụ thông minh toàn diện giúp số hóa và tối ưu hóa quản lý giao thông đô thị bằng công nghệ Drone và Trí tuệ Nhân tạo.
          </p>
        </div>

        {/* Grid */}
        <div className="features-grid">
          {FEATURES.map((item, index) => (
            <div key={index} className="feature-card">
              <div className="feature-icon-wrapper">
                {item.icon}
              </div>

              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
