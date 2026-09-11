import React from 'react';
import { 
  Plane, 
  Heart, 
  GitBranch 
} from 'lucide-react';
import { useLanguage } from '../../context';

export default function Footer({ onOpenAuth, onOpenLegal }) {
  const { t } = useLanguage();

  return (
    <footer className="footer-wrapper">
      <div className="container">
        <div className="footer-top">
          {/* Col 1 */}
          <div className="footer-col">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div className="brand-icon-box" style={{ width: '36px', height: '36px' }}>
                <Plane size={18} />
              </div>
              <div className="brand-text">
                <h4 style={{ fontSize: '18px', color: 'var(--text-primary)', fontWeight: 800 }}>AeroTraffic AI</h4>
                <span style={{ fontSize: '11px', color: 'var(--brand-primary)', fontWeight: 600 }}>{t('nav.brandSub')}</span>
              </div>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6, maxWidth: '320px' }}>
              {t('footer.desc')}
            </p>
          </div>

          {/* Col 2 */}
          <div className="footer-col">
            <h5>{t('footer.colFeatures')}</h5>
            <ul>
              <li><a href="#features">YOLOv11 Detection</a></li>
              <li><a href="#features">ByteTrack Tracking</a></li>
              <li><a href="#forecast">ST-GNN Forecast</a></li>
              <li><a href="#live-demo">Density Heatmap</a></li>
            </ul>
          </div>

          {/* Col 3 */}
          <div className="footer-col">
            <h5>{t('footer.colLinks')}</h5>
            <ul>
              <li><a href="#how-it-works">{t('nav.workflow')}</a></li>
              <li><a href="#live-demo">{t('common.exploreNow')}</a></li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}
                >
                  {t('footer.loginAccount')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
                >
                  {t('footer.registerFree')}
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4 */}
          <div className="footer-col">
            <h5>{t('footer.colLegal')}</h5>
            <ul style={{ marginBottom: '12px' }}>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal?.('terms')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}
                >
                  {t('footer.terms')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal?.('privacy')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}
                >
                  {t('footer.privacy')}
                </button>
              </li>
            </ul>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--brand-primary)', fontWeight: 600 }}>
              <GitBranch size={15} />
              <span>{t('footer.platformVer')}</span>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="footer-bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span>{t('footer.copyright')}</span>
            <span style={{ color: 'var(--border-strong)' }}>•</span>
            <button
              type="button"
              onClick={() => onOpenLegal?.('terms')}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px' }}
            >
              {t('common.termsOfService')}
            </button>
            <span style={{ color: 'var(--border-strong)' }}>•</span>
            <button
              type="button"
              onClick={() => onOpenLegal?.('privacy')}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px' }}
            >
              {t('common.privacyPolicy')}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{t('common.developedFor')}</span>
            <Heart size={14} className="text-rose-500 fill-rose-500" />
          </div>
        </div>
      </div>
    </footer>
  );
}
