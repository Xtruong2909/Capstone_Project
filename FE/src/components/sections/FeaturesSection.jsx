import React from 'react';
import { 
  Database, 
  ShieldCheck, 
  Activity, 
  Eye, 
  TrendingUp, 
  CheckCircle2, 
  Sliders, 
  FileText 
} from 'lucide-react';
import { useLanguage } from '../../context';

const FEATURES_LIST = [
  {
    id: 'dataset',
    titleKey: 'f1Title',
    descKey: 'f1Desc',
    icon: <Database size={22} className="text-cyan-600" />
  },
  {
    id: 'validate',
    titleKey: 'f2Title',
    descKey: 'f2Desc',
    icon: <ShieldCheck size={22} className="text-emerald-600" />
  },
  {
    id: 'analysis',
    titleKey: 'f3Title',
    descKey: 'f3Desc',
    icon: <Activity size={22} className="text-blue-600" />
  },
  {
    id: 'visual',
    titleKey: 'f4Title',
    descKey: 'f4Desc',
    icon: <Eye size={22} className="text-indigo-600" />
  },
  {
    id: 'forecast',
    titleKey: 'f5Title',
    descKey: 'f5Desc',
    icon: <TrendingUp size={22} className="text-amber-600" />
  },
  {
    id: 'evaluate',
    titleKey: 'f6Title',
    descKey: 'f6Desc',
    icon: <CheckCircle2 size={22} className="text-rose-600" />
  },
  {
    id: 'experiment',
    titleKey: 'f7Title',
    descKey: 'f7Desc',
    icon: <Sliders size={22} className="text-purple-600" />
  },
  {
    id: 'report',
    titleKey: 'f8Title',
    descKey: 'f8Desc',
    icon: <FileText size={22} className="text-teal-600" />
  }
];

export default function FeaturesSection() {
  const { t } = useLanguage();
  return (
    <section id="features" style={{ padding: '80px 0' }}>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <span className="section-tag">{t('features.tag')}</span>
          <h2 className="section-title">{t('features.title')}</h2>
          <p className="section-desc">
            {t('features.desc')}
          </p>
        </div>

        {/* 8 Grid items */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '20px'
        }}>
          {FEATURES_LIST.map((item) => (
            <div 
              key={item.id} 
              className="light-card"
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: '#f8fafc',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {item.icon}
              </div>

              <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t(`features.${item.titleKey}`)}
              </h4>

              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {t(`features.${item.descKey}`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
