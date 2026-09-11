import React from 'react';
import { 
  LogIn, 
  UserPlus, 
  Sparkles, 
  ShieldCheck, 
  Zap 
} from 'lucide-react';
import { useLanguage } from '../../context';

export default function CtaSection({ onOpenAuth }) {
  const { t } = useLanguage();
  return (
    <section style={{ padding: '20px 0 60px 0' }}>
      <div className="container">
        <div className="cta-banner">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', background: 'rgba(255,255,255,0.2)', borderRadius: '9999px', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
            <Sparkles size={15} />
            <span>AeroTraffic AI Platform</span>
          </div>

          <h2>{t('cta.title')}</h2>
          <p>
            {t('cta.subtitle')}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={() => onOpenAuth('login')}
              style={{ background: '#ffffff', color: 'var(--brand-primary)', fontWeight: 700, padding: '14px 28px', fontSize: '15px', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' }}
            >
              <LogIn size={16} />
              <span>{t('common.login')}</span>
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => onOpenAuth('register')}
              style={{ background: 'rgba(255,255,255,0.15)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.4)', padding: '14px 28px', fontSize: '15px', fontWeight: 700 }}
            >
              <UserPlus size={16} />
              <span>{t('cta.btnCreate')}</span>
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '28px', fontSize: '13px', color: '#e0f2fe' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={16} /> {t('cta.trustSecurity')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={16} /> {t('cta.trustDatasets')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
