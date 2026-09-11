import React, { useState } from 'react';
import { 
  Database, 
  BarChart3, 
  Sparkles, 
  Award
} from 'lucide-react';

const DATASETS = [
  {
    name: 'FPT-UAVTraffic (Đồ Án Thu Thập)',
    source: 'Flycam 4K tại TP.HCM & Hà Nội & Đà Nẵng',
    frames: '125,000+',
    vehicles: '1,450,000+ BBoxes',
    weather: 'Nắng, Mưa, Hoàng hôn, Giờ cao điểm',
    highlight: true,
    focus: 'Giao thông hỗn hợp đặc thù VN (75% xe máy)'
  },
  {
    name: 'VisDrone-2021',
    source: 'Drone video Trung Quốc',
    frames: '288,000',
    vehicles: '2,600,000 BBoxes',
    weather: 'Đa dạng 14 thành phố',
    highlight: false,
    focus: 'Ô tô chiếm đa số, ít xe máy lấn làn'
  },
  {
    name: 'UAVDT Dataset',
    source: 'Góc nhìn xiên flycam',
    frames: '80,000',
    vehicles: '840,000 BBoxes',
    weather: 'Ngày & Đêm',
    highlight: false,
    focus: 'Chủ yếu xe ô tô đường cao tốc'
  },
  {
    name: 'Drone-Vehicle Dataset',
    source: 'Ảnh RGB & Hồng ngoại flycam',
    frames: '56,800',
    vehicles: '953,000 BBoxes',
    weather: 'Ngày, Chiều tối',
    highlight: false,
    focus: 'Phân loại xe ban đêm'
  }
];

const MODEL_BENCHMARKS = [
  {
    model: 'AeroTraffic AI (YOLOv11x + RepNCSPELAN + ByteTrack)',
    mAP50: '94.8%',
    mAP5095: '78.2%',
    fps: '62.4 FPS',
    mota: '88.6%',
    latency: '16.0 ms',
    highlight: true
  },
  {
    model: 'YOLOv8x + ByteTrack',
    mAP50: '91.2%',
    mAP5095: '73.5%',
    fps: '48.1 FPS',
    mota: '83.2%',
    latency: '20.8 ms',
    highlight: false
  },
  {
    model: 'YOLOv10x + DeepSORT',
    mAP50: '92.6%',
    mAP5095: '75.1%',
    fps: '41.3 FPS',
    mota: '81.9%',
    latency: '24.2 ms',
    highlight: false
  },
  {
    model: 'Faster R-CNN (ResNet50) + DeepSORT',
    mAP50: '82.4%',
    mAP5095: '61.8%',
    fps: '14.5 FPS',
    mota: '69.4%',
    latency: '68.9 ms',
    highlight: false
  }
];

export default function DatasetBenchmark() {
  const [activeTab, setActiveTab] = useState('benchmarks'); // 'benchmarks' or 'datasets'

  return (
    <section id="dataset" style={{ padding: '80px 0', background: 'rgba(5, 8, 15, 0.6)' }}>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <span className="section-tag">Scientific Evaluation & Benchmarks</span>
          <h2 className="section-title">Dữ Liệu Thực Nghiệm & Kết Quả Đánh Giá Mô Hình</h2>
          <p className="section-desc">
            So sánh toàn diện bộ dữ liệu thu thập thực tế tại Việt Nam với các benchmark quốc tế và bảng hiệu năng thị giác máy tính trên GPU chuyên dụng.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '32px' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'benchmarks' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('benchmarks')}
          >
            <BarChart3 size={16} />
            <span>Hiệu Năng Mô Hình AI (Model Benchmark)</span>
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'datasets' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('datasets')}
          >
            <Database size={16} />
            <span>Bộ Dữ Liệu UAV (Datasets Comparison)</span>
          </button>
        </div>

        {/* Benchmark Table */}
        {activeTab === 'benchmarks' && (
          <div className="benchmark-table-wrapper">
            <table className="benchmark-table">
              <thead>
                <tr>
                  <th>MÔ HÌNH KIỂM THỬ</th>
                  <th>mAP @ 0.5</th>
                  <th>mAP @ 0.5:0.95</th>
                  <th>TỐC ĐỘ (FPS)</th>
                  <th>MOTA (TRACKING)</th>
                  <th>INFERENCE LATENCY</th>
                </tr>
              </thead>
              <tbody>
                {MODEL_BENCHMARKS.map((row, idx) => (
                  <tr key={idx} className={row.highlight ? 'highlight-row' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {row.highlight && <Sparkles size={16} className="text-cyan-400" />}
                        <span>{row.model}</span>
                        {row.highlight && (
                          <span className="badge badge-cyan" style={{ fontSize: '10px' }}>
                            Ours (SOTA)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="mono">{row.mAP50}</td>
                    <td className="mono">{row.mAP5095}</td>
                    <td className="mono" style={{ color: row.highlight ? 'var(--emerald-400)' : 'inherit' }}>{row.fps}</td>
                    <td className="mono">{row.mota}</td>
                    <td className="mono">{row.latency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Datasets Table */}
        {activeTab === 'datasets' && (
          <div className="benchmark-table-wrapper">
            <table className="benchmark-table">
              <thead>
                <tr>
                  <th>DATASET TÊN</th>
                  <th>NGUỒN THU THẬP</th>
                  <th>TỔNG KHUNG HÌNH</th>
                  <th>BBOXES PHƯƠNG TIỆN</th>
                  <th>ĐẶC ĐIỂM & ĐỐI TƯỢNG TRỌNG TÂM</th>
                </tr>
              </thead>
              <tbody>
                {DATASETS.map((row, idx) => (
                  <tr key={idx} className={row.highlight ? 'highlight-row' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {row.highlight && <Award size={16} className="text-cyan-400" />}
                        <span>{row.name}</span>
                        {row.highlight && (
                          <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                            Capstone
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{row.source}</td>
                    <td className="mono">{row.frames}</td>
                    <td className="mono" style={{ color: row.highlight ? 'var(--cyan-400)' : 'inherit' }}>{row.vehicles}</td>
                    <td>{row.focus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
