import React from 'react';
import { 
  ArrowRight, 
  Play, 
  Lock, 
  Sparkles
} from 'lucide-react';
import { useLanguage } from '../../context';

export default function Hero({ onOpenAuth }) {
  const { t } = useLanguage();

  return (
    <section id="hero" className="hero-section">
      <div className="container">
        {/* Badge */}
        <div className="hero-badge-container">
          <div className="hero-badge">
            <Sparkles size={15} />
            <span>{t('hero.badge')}</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="hero-title">
          {t('hero.titlePrefix')} <br />
          <span className="hero-title-highlight">{t('hero.titleHighlight')}</span>
        </h1>

        {/* Introduction of the topic / Giới thiệu đề tài */}
        <p className="hero-subtitle">
          {t('hero.subtitle')}
        </p>

        {/* Buttons: [Bắt đầu sử dụng] [Xem cách hoạt động] */}
        <div className="hero-actions">
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={() => onOpenAuth('register')}
            style={{ padding: '14px 28px', fontSize: '15px' }}
          >
            <span>{t('common.freeTrial')}</span>
            <ArrowRight size={18} />
          </button>

          <a href="#workflow" className="btn btn-secondary" style={{ padding: '14px 24px', fontSize: '15px' }}>
            <Play size={16} className="text-cyan-600" />
            <span>{t('nav.workflow')}</span>
          </a>
        </div>

        {/* Lock Notice: 🔒 Chức năng yêu cầu đăng nhập */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '9999px',
          background: '#f1f5f9',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)',
          fontSize: '13px',
          fontWeight: 600
        }}>
          <Lock size={14} className="text-amber-600" />
          <span>🔒 {t('auth.loginSub')}</span>
        </div>
      </div>
    </section>
  );
}

