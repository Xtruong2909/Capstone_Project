import React, { useState, useEffect } from 'react';
import { 
  Plane, 
  Layers, 
  GitCommit, 
  LogIn, 
  UserPlus, 
  LogOut, 
  User, 
  Menu, 
  X,
  Home,
  Database,
  Shield
} from 'lucide-react';
import { useLanguage } from '../../context';

export default function Navbar({ onOpenAuth, currentUser, onLogout }) {
  const { language, setLanguage, t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className="navbar-wrapper" style={{
      boxShadow: scrolled ? 'var(--shadow-md)' : 'none',
      background: scrolled ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 255, 255, 0.88)'
    }}>
      <div className="navbar-container">
        {/* LOGO */}
        <a href="#hero" className="brand-logo">
          <div className="brand-icon-box">
            <Plane size={20} />
          </div>
          <div className="brand-text">
            <h1>AeroTraffic AI</h1>
            <span>{t('nav.brandSub')}</span>
          </div>
        </a>

        {/* Desktop Nav Links */}
        <nav className="nav-links">
          <a href="#hero" className="nav-link-item">
            <Home size={15} /> {t('nav.home')}
          </a>
          <a href="#features" className="nav-link-item">
            <Layers size={15} /> {t('nav.features')}
          </a>
          <a href="#workflow" className="nav-link-item">
            <GitCommit size={15} /> {t('nav.workflow')}
          </a>
          <a href="#datasets" className="nav-link-item">
            <Database size={15} /> {t('nav.datasets')}
          </a>
          <a href="#roles" className="nav-link-item">
            <Shield size={15} /> {t('nav.roles')}
          </a>
        </nav>

        {/* Actions + Language Switcher */}
        <div className="nav-actions">
          {/* Language Switcher Pill */}
          <div 
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: '#f1f5f9',
              borderRadius: '20px',
              padding: '2px',
              border: '1px solid var(--border-subtle)',
              fontSize: '12px',
              fontWeight: 700
            }}
          >
            <button
              type="button"
              onClick={() => setLanguage('vi')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '16px',
                border: 'none',
                background: language === 'vi' ? '#ffffff' : 'transparent',
                color: language === 'vi' ? 'var(--brand-primary)' : 'var(--text-muted)',
                boxShadow: language === 'vi' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                fontWeight: language === 'vi' ? 700 : 500
              }}
              title="Tiếng Việt"
            >
              <span>🇻🇳</span>
              <span>VI</span>
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '16px',
                border: 'none',
                background: language === 'en' ? '#ffffff' : 'transparent',
                color: language === 'en' ? 'var(--brand-primary)' : 'var(--text-muted)',
                boxShadow: language === 'en' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                fontWeight: language === 'en' ? 700 : 500
              }}
              title="English"
            >
              <span>🇬🇧</span>
              <span>EN</span>
            </button>
          </div>

          {currentUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: 'var(--brand-light)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--brand-primary)'
              }}>
                <User size={15} />
                <span>{currentUser.name || t('nav.user')}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onLogout}
                style={{ padding: '8px 12px', fontSize: '13px' }}
                title={t('common.logout')}
              >
                <LogOut size={15} />
                <span>{t('common.logout')}</span>
              </button>
            </div>
          ) : (
            <>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => onOpenAuth('login')}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                <LogIn size={15} />
                <span>{t('common.login')}</span>
              </button>

              <button 
                type="button" 
                className="btn btn-primary"
                onClick={() => onOpenAuth('register')}
                style={{ padding: '8px 18px', fontSize: '13px' }}
              >
                <UserPlus size={15} />
                <span>{t('common.register')}</span>
              </button>
            </>
          )}

          {/* Mobile Menu Toggle */}
          <button 
            type="button" 
            className="mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div style={{
          background: '#ffffff',
          borderBottom: '1px solid var(--border-medium)',
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Mobile Language Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('nav.switchLanguage')}:</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setLanguage('vi')}
                className={`btn ${language === 'vi' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                🇻🇳 Tiếng Việt
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`btn ${language === 'en' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                🇬🇧 English
              </button>
            </div>
          </div>

          <a href="#hero" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>
            <Home size={15} /> {t('nav.home')}
          </a>
          <a href="#features" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>
            <Layers size={15} /> {t('nav.features')}
          </a>
          <a href="#workflow" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>
            <GitCommit size={15} /> {t('nav.workflow')}
          </a>
          <a href="#datasets" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>
            <Database size={15} /> {t('nav.datasets')}
          </a>
          <a href="#roles" className="nav-link-item" onClick={() => setMobileMenuOpen(false)}>
            <Shield size={15} /> {t('nav.roles')}
          </a>
          
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ flex: 1 }}
              onClick={() => { setMobileMenuOpen(false); onOpenAuth('login'); }}
            >
              {t('common.login')}
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ flex: 1 }}
              onClick={() => { setMobileMenuOpen(false); onOpenAuth('register'); }}
            >
              {t('common.register')}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

