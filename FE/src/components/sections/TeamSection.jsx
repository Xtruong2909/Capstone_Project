import React from 'react';
import { 
  GraduationCap, 
  FileText, 
  GitBranch 
} from 'lucide-react';

const TEAM_MEMBERS = [
  {
    initials: 'T',
    name: 'Nguyễn Văn Trường',
    role: 'AI / Computer Vision & ST-GNN Lead',
    sub: 'FPT University • K16 CNTT',
    focus: 'Huấn luyện YOLOv11 Aerial, tối ưu hóa thuật toán ByteTrack & triển khai Graph Neural Network (ST-GCN).'
  },
  {
    initials: 'D',
    name: 'Thành viên Nghiên Cứu 2',
    role: 'UAV Ingestion & Homography Lead',
    sub: 'FPT University • K16 CNTT',
    focus: 'Xử lý luồng video Drone RTSP, căn chỉnh tọa độ mặt đất Bird’s Eye View & trích xuất ma trận O-D.'
  },
  {
    initials: 'H',
    name: 'Thành viên Nghiên Cứu 3',
    role: 'Backend & Traffic Simulation Lead',
    sub: 'FPT University • K16 CNTT',
    focus: 'Mô phỏng SUMO Digital Twin, xây dựng FastAPI microservices & phân phối cảnh báo tắc nghẽn.'
  },
  {
    initials: 'GV',
    name: 'TS. Giảng Viên Hướng Dẫn',
    role: 'Supervisor & Scientific Advisor',
    sub: 'FPT University AI Department',
    focus: 'Định hướng phương pháp luận khoa học, thẩm định độ tin cậy của mô hình ST-GNN và kết quả thực nghiệm.'
  }
];

export default function TeamSection() {
  return (
    <section id="team" style={{ padding: '80px 0' }}>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <span className="section-tag">Capstone Project & Academic Research</span>
          <h2 className="section-title">Đồ Án Tốt Nghiệp & Đội Ngũ Nghiên Cứu</h2>
          <p className="section-desc">
            Dự án được thực hiện bởi nhóm sinh viên chuyên ngành Trí tuệ Nhân tạo & Kỹ thuật Phần mềm - Đại học FPT dưới sự hướng dẫn của các giảng viên bộ môn.
          </p>
        </div>

        {/* Project Overview Card */}
        <div className="glass-card" style={{ padding: '32px', marginBottom: '40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <GraduationCap size={22} className="text-cyan-400" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--cyan-400)', fontWeight: 700 }}>
                  FPT UNIVERSITY CAPSTONE THESIS 2026
                </span>
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px', color: '#fff' }}>
                Urban Traffic Pattern Analysis and Short-Term Congestion Forecasting Using Drone-Collected Traffic Data
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
                Đề tài tập trung vào việc giải quyết bài toán ùn tắc giao thông đặc thù tại các siêu đô thị Việt Nam (với mật độ xe máy chiếm đa số) thông qua việc sử dụng máy bay không người lái (Drone/UAV) làm trạm thu phát thông minh di động, kết hợp các mô hình thị giác máy tính và mạng đồ thị không-thời gian hiện đại.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <a href="#pipeline" className="btn btn-secondary" style={{ fontSize: '13px', padding: '8px 16px' }}>
                  <FileText size={15} className="text-cyan-400" />
                  <span>Đọc Tóm Tắt Nghiên Cứu (Abstract)</span>
                </a>
                <a href="https://github.com" target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: '13px', padding: '8px 16px' }}>
                  <GitBranch size={15} />
                  <span>Mã Nguồn GitHub</span>
                </a>
              </div>
            </div>

            {/* Quick Stats on Thesis */}
            <div style={{ background: 'rgba(11, 16, 30, 0.8)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>CƠ SỞ ĐÀO TẠO</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginTop: '2px' }}>Đại Học FPT (FPT University)</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>HỘI ĐỒNG BẢO VỆ</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--cyan-300)', marginTop: '2px' }}>Khoa Công Nghệ Thông Tin & AI</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>MÔ HÌNH HỌC SÂU</div>
                <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--emerald-400)', marginTop: '2px' }}>
                  YOLOv11x • ByteTrack • ASTGCN • PyTorch
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Team Members Grid */}
        <div className="team-grid">
          {TEAM_MEMBERS.map((m, idx) => (
            <div key={idx} className="team-card">
              <div className="team-avatar">{m.initials}</div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>{m.name}</h4>
              <div style={{ fontSize: '12px', color: 'var(--cyan-400)', fontWeight: 600, marginBottom: '2px' }}>{m.role}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '12px' }}>{m.sub}</div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {m.focus}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
