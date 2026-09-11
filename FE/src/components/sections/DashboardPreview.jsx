import React, { useState } from 'react';
import { 
  Car, 
  Gauge, 
  Flame, 
  Activity, 
  Lock, 
  BarChart3, 
  ArrowRight
} from 'lucide-react';
import { useLanguage } from '../../context';

export default function DashboardPreview({ onOpenAuth }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('vehicle'); // 'vehicle', 'speed', 'density', 'flow'

  return (
    <section id="dashboard-preview" style={{ padding: '40px 0 80px 0' }}>
      <div className="container">
        {/* Card */}
        <div style={{
          background: '#ffffff',
          border: '1px solid var(--border-medium)',
          borderRadius: '24px',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden'
        }}>
          {/* Top Bar Header */}
          <div style={{
            background: '#f8fafc',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--brand-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--brand-primary)'
              }}>
                <BarChart3 size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {t('dashboardPreview.title')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {t('dashboardPreview.subtitle')}
                </p>
              </div>
            </div>

            {/* 4 Tabs: Vehicle | Speed | Density | Flow */}
            <div style={{
              display: 'flex',
              background: '#ffffff',
              padding: '4px',
              borderRadius: '10px',
              border: '1px solid var(--border-medium)',
              gap: '4px'
            }}>
              <button
                type="button"
                onClick={() => setActiveTab('vehicle')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'vehicle' ? 'var(--brand-primary)' : 'transparent',
                  color: activeTab === 'vehicle' ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Car size={14} /> {t('dashboardPreview.tabVehicle')}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('speed')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'speed' ? 'var(--brand-primary)' : 'transparent',
                  color: activeTab === 'speed' ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Gauge size={14} /> {t('dashboardPreview.tabSpeed')}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('density')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'density' ? 'var(--brand-primary)' : 'transparent',
                  color: activeTab === 'density' ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Flame size={14} /> {t('dashboardPreview.tabDensity')}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('flow')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'flow' ? 'var(--brand-primary)' : 'transparent',
                  color: activeTab === 'flow' ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Activity size={14} /> {t('dashboardPreview.tabFlow')}
              </button>
            </div>
          </div>

          {/* Body: KPI + Chart + Heatmap preview */}
          <div style={{ padding: '24px' }}>
            {/* 4 KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  {t('dashboardPreview.metricVehiclesLong')}
                </span>
                <div className="mono" style={{ fontSize: '24px', fontWeight: 800, color: 'var(--brand-primary)', marginTop: '4px' }}>
                  2,840 xe/h
                </div>
                <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>↑ +14.2% {t('dashboardPreview.comparedYesterday')}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  {t('dashboardPreview.metricSpeedLong')}
                </span>
                <div className="mono" style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                  21.6 km/h
                </div>
                <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>{t('dashboardPreview.slowFlow')}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  {t('dashboardPreview.metricDensityLong')}
                </span>
                <div className="mono" style={{ fontSize: '24px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
                  68 xe / 100m
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('dashboardPreview.roadCapacity')}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  {t('dashboardPreview.metricFlowLong')}
                </span>
                <div className="mono" style={{ fontSize: '24px', fontWeight: 800, color: '#7c3aed', marginTop: '4px' }}>
                  47.3 xe/phút
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('dashboardPreview.measurementCycle')}</span>
              </div>
            </div>

            {/* Chart + Heatmap Visual Mockup */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '24px' }}>
              {/* Traffic Flow Chart */}
              <div style={{ background: '#ffffff', border: '1px solid var(--border-medium)', borderRadius: '14px', padding: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('dashboardPreview.chartTitle')}
                  </span>
                  <span className="badge badge-blue">inD & pNEUMA Model</span>
                </div>
                {/* SVG Visual Chart */}
                <div style={{ height: '180px', display: 'flex', alignItems: 'flex-end', gap: '12px', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
                  {[35, 48, 62, 85, 92, 78, 60, 45, 70, 88, 95, 65].map((val, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${val}%`,
                          borderRadius: '4px 4px 0 0',
                          background: val > 80 ? 'linear-gradient(to top, #0284c7, #ef4444)' : 'linear-gradient(to top, #0284c7, #38bdf8)'
                        }}
                      ></div>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {i + 7}h
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  <span>07:00 - {t('dashboardPreview.morning')}</span>
                  <span>12:00 - {t('dashboardPreview.noon')}</span>
                  <span>18:00 - {t('dashboardPreview.evening')}</span>
                </div>
              </div>

              {/* Simulated Heatmap */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border-medium)', borderRadius: '14px', padding: '18px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('dashboardPreview.heatmapTitle')}
                  </span>
                  <span className="badge badge-amber">Density Heatmap</span>
                </div>

                <div style={{
                  height: '180px',
                  borderRadius: '10px',
                  background: '#e2e8f0',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {/* Road Grid */}
                  <div style={{ position: 'absolute', width: '100%', height: '50px', background: '#cbd5e1' }}></div>
                  <div style={{ position: 'absolute', height: '100%', width: '50px', background: '#cbd5e1' }}></div>
                  
                  {/* Heat glow */}
                  <div style={{
                    position: 'absolute',
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(239, 68, 68, 0.6) 0%, rgba(245, 158, 11, 0.4) 40%, transparent 70%)'
                  }}></div>

                  <span style={{
                    position: 'relative',
                    zIndex: 2,
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#0f172a',
                    background: 'rgba(255,255,255,0.85)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    {t('dashboardPreview.bottleneckZone')}
                  </span>
                </div>
              </div>
            </div>

            {/* Lock Banner Call-to-action: 🔒 Đăng nhập để phân tích dữ liệu */}
            <div style={{
              background: 'linear-gradient(135deg, #f0f9ff 0%, #eff6ff 100%)',
              border: '1.5px dashed #0284c7',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand-primary)',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <Lock size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    🔒 {t('dashboardPreview.loginTitle')}
                  </h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {t('dashboardPreview.loginDesc')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onOpenAuth('login')}
                style={{ padding: '10px 20px' }}
              >
                <span>{t('dashboardPreview.loginNow')}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
