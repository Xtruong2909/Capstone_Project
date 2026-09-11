import React, { useState } from 'react';
import { 
  X, 
  UploadCloud, 
  FileVideo, 
  CheckCircle2, 
  Loader2 
} from 'lucide-react';

export default function VideoUploadModal({ isOpen, onClose }) {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);

  if (!isOpen) return null;

  const handleSimulatedUpload = (sampleName) => {
    setFile({ name: sampleName || 'DJI_0042_HangXanh_Intersection_4K.mp4', size: '248.5 MB' });
    setIsProcessing(true);
    setProgress(10);
    setStage('Đang tải lên luồng video 4K & trích xuất metadata flycam...');

    setTimeout(() => {
      setProgress(35);
      setStage('Đang khử rung lắc Homography & chuẩn hóa góc nhìn Bird’s Eye View...');
    }, 1200);

    setTimeout(() => {
      setProgress(68);
      setStage('Đang chạy suy luận YOLOv11x Aerial Detector & ByteTrack ID...');
    }, 2400);

    setTimeout(() => {
      setProgress(90);
      setStage('Đang xây dựng đồ thị Spatio-Temporal Graph & dự báo tắc nghẽn...');
    }, 3600);

    setTimeout(() => {
      setProgress(100);
      setIsProcessing(false);
      setAnalysisResult({
        totalFrames: 3600,
        totalTracked: 842,
        vehicleBreakdown: { motorbikes: 648, cars: 162, buses: 20, trucks: 12 },
        avgSpeed: '19.4 km/h',
        congestionProbability: '74.2%',
        jamLevel: 'Mức 3 (Dòng Chảy Chậm)',
        recommendedAction: 'Kéo dài pha đèn xanh hướng thẳng thêm 12 giây trong 25 phút tới.'
      });
    }, 4500);
  };

  const handleReset = () => {
    setFile(null);
    setIsProcessing(false);
    setProgress(0);
    setStage('');
    setAnalysisResult(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
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
              background: 'rgba(6, 182, 212, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--cyan-400)'
            }}>
              <UploadCloud size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>Tải Lên Video Drone & Chạy Phân Tích AI</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hỗ trợ định dạng .MP4, .MOV, .AVI (Tối đa 4K 60FPS)</p>
            </div>
          </div>

          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px' }}>
          {!file && !analysisResult && (
            <div>
              {/* Dropzone */}
              <div 
                style={{
                  border: '2px dashed var(--border-glow-cyan)',
                  borderRadius: '14px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  background: 'rgba(6, 182, 212, 0.03)',
                  cursor: 'pointer',
                  marginBottom: '20px',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => handleSimulatedUpload('DJI_Flight_Sample_HangXanh.mp4')}
              >
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: 'rgba(6, 182, 212, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--cyan-400)',
                  margin: '0 auto 16px auto'
                }}>
                  <UploadCloud size={30} />
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>
                  Kéo thả video flycam vào đây hoặc bấm để chọn tệp
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Hệ thống tự động kích hoạt Homography Stabilization & YOLOv11 Tracking
                </p>
              </div>

              {/* Sample Demos */}
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: '10px' }}>
                  HOẶC CHỌN MẪU DỮ LIỆU FLYCAM CÓ SẴN (PRESET SAMPLES)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleSimulatedUpload('Sample_01_HangXanh_PeakHour_4K.mp4')}
                    style={{ justifyContent: 'space-between', padding: '12px 16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileVideo size={18} className="text-cyan-400" />
                      <span style={{ textAlign: 'left' }}>
                        <strong>Mẫu 01:</strong> Ngã tư Hàng Xanh (Giờ cao điểm chiều) • 4K 60FPS
                      </span>
                    </div>
                    <span className="badge badge-cyan">Chạy Ngay</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleSimulatedUpload('Sample_02_MaiDich_Flyover_Rain.mp4')}
                    style={{ justifyContent: 'space-between', padding: '12px 16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileVideo size={18} className="text-emerald-400" />
                      <span style={{ textAlign: 'left' }}>
                        <strong>Mẫu 02:</strong> Cầu vượt Mai Dịch (Thời tiết mưa nhẹ) • 4K 60FPS
                      </span>
                    </div>
                    <span className="badge badge-emerald">Chạy Ngay</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Processing State */}
          {isProcessing && (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <Loader2 size={48} className="text-cyan-400 animate-spin" style={{ margin: '0 auto 20px auto' }} />
              <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
                Đang Thực Thi Pipeline Trí Tuệ Nhân Tạo
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--cyan-300)', fontFamily: 'var(--font-mono)', marginBottom: '20px' }}>
                {stage}
              </p>

              <div className="forecast-meter" style={{ maxWidth: '480px', margin: '0 auto' }}>
                <div className="forecast-meter-fill" style={{ width: `${progress}%`, background: 'var(--cyan-400)' }}></div>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '8px', display: 'block' }}>
                {progress}% Hoàn thành
              </span>
            </div>
          )}

          {/* Analysis Results View */}
          {analysisResult && (
            <div>
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px'
              }}>
                <CheckCircle2 size={24} className="text-emerald-400" />
                <div>
                  <h4 style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>Phân Tích Thành Công: {file.name}</h4>
                  <span style={{ fontSize: '12px', color: 'var(--emerald-400)' }}>
                    Đã xử lý {analysisResult.totalFrames} khung hình • Thời gian suy luận: 4.5s
                  </span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>TỔNG PHƯƠNG TIỆN</div>
                  <div className="mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--cyan-400)', marginTop: '4px' }}>
                    {analysisResult.totalTracked} xe
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>VẬN TỐC TRUNG BÌNH</div>
                  <div className="mono" style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginTop: '4px' }}>
                    {analysisResult.avgSpeed}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>XÁC SUẤT ÙN TẮC</div>
                  <div className="mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--amber-400)', marginTop: '4px' }}>
                    {analysisResult.congestionProbability}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>MỨC ĐỘ NGUY CƠ</div>
                  <div className="mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--amber-400)', marginTop: '6px' }}>
                    Mức 3 (Chậm)
                  </div>
                </div>
              </div>

              {/* Recommendation Box */}
              <div style={{
                background: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--cyan-400)', marginBottom: '4px' }}>
                  🎯 Khuyến Nghị Điều Phối Đèn Tín Hiệu:
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  {analysisResult.recommendedAction}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={handleReset}>
                  Phân Tích Video Khác
                </button>
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  Xem Trên Live Console
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
