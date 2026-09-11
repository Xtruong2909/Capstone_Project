import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  FileText, 
  Lock, 
  Eye, 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  Scale, 
  ExternalLink 
} from 'lucide-react';
import { useLanguage } from '../../context';

export default function LegalModal({ isOpen, onClose, initialTab = 'terms' }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState(initialTab); // 'terms' or 'privacy'

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '680px', 
          width: '90%', 
          maxHeight: '88vh', 
          display: 'flex', 
          flexDirection: 'column',
          borderRadius: '16px',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          background: '#ffffff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: activeTab === 'terms' ? 'rgba(2, 132, 199, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              color: activeTab === 'terms' ? 'var(--brand-primary)' : '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {activeTab === 'terms' ? <Scale size={18} /> : <ShieldCheck size={18} />}
            </div>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                {activeTab === 'terms' ? t('legal.termsTitle') : t('legal.privacyTitle')}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                {t('legal.platformSub')}
              </p>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tabs" style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'terms' ? 'active' : ''}`}
            onClick={() => setActiveTab('terms')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <FileText size={15} />
            <span>{t('legal.termsTitle')}</span>
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('privacy')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <ShieldCheck size={15} />
            <span>{t('legal.privacyTitle')}</span>
          </button>
        </div>

        {/* Scrollable Document Body */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          fontSize: '14px',
          lineHeight: '1.65',
          color: 'var(--text-secondary)',
          background: '#ffffff',
          flex: 1
        }}>
          {activeTab === 'terms' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                color: '#0369a1',
                fontSize: '13px'
              }}>
                {t('legal.termsNotice')}
              </div>

              <section>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {t('legal.termsS1Title')}
                </h4>
                <p>{t('legal.termsS1Content')}</p>
              </section>

              <section>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {t('legal.termsS2Title')}
                </h4>
                <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>{t('legal.termsS2Item1')}</li>
                  <li>{t('legal.termsS2Item2')}</li>
                  <li>{t('legal.termsS2Item3')}</li>
                </ul>
              </section>

              <section>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {t('legal.termsS3Title')}
                </h4>
                <p>{t('legal.termsS3Content')}</p>
              </section>

              <section>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {t('legal.termsS4Title')}
                </h4>
                <p>{t('legal.termsS4Content')}</p>
              </section>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#065f46',
                fontSize: '13px'
              }}>
                {t('legal.privacyNotice')}
              </div>

              <section>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {t('legal.privacyS1Title')}
                </h4>
                <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>{t('legal.privacyS1Item1')}</li>
                  <li>{t('legal.privacyS1Item2')}</li>
                  <li>{t('legal.privacyS1Item3')}</li>
                </ul>
              </section>

              <section>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {t('legal.privacyS2Title')}
                </h4>
                <p>{t('legal.privacyS2Desc')}</p>
                <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  <li>{t('legal.privacyS2Item1')}</li>
                  <li>{t('legal.privacyS2Item2')}</li>
                </ul>
              </section>

              <section>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {t('legal.privacyS3Title')}
                </h4>
                <p>{t('legal.privacyS3Content')}</p>
              </section>

              <section>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {t('legal.privacyS4Title')}
                </h4>
                <p>{t('legal.privacyS4Content')}</p>
              </section>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f8fafc'
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {t('common.needHelp')} <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>support@aerotraffic.ai</span>
          </span>
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={onClose}
            style={{ padding: '8px 18px', fontSize: '13px' }}
          >
            {t('common.understoodAndClose')}
          </button>
        </div>
      </div>
    </div>
  );
}
