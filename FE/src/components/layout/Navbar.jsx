import React, { useState, useEffect } from 'react';
import { 
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
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [avatar, setAvatar] = useState('');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setAvatar('');
      setProfileMenuOpen(false);
      return;
    }

    const savedAvatar = localStorage.getItem(`atr_avatar_${currentUser.email}`);
    setAvatar(savedAvatar || '');
  }, [currentUser]);

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const imageData = reader.result;
      setAvatar(imageData);
      localStorage.setItem(`atr_avatar_${currentUser.email}`, imageData);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <header className="navbar-wrapper" style={{
      boxShadow: scrolled ? 'var(--shadow-md)' : 'none',
      background: scrolled ? 'rgba(255, 255, 255, 0.96)' : 'rgba(255, 255, 255, 0.88)'
    }}>
      <div className="navbar-container">
        {/* LOGO */}
        <a href="#hero" className="brand-logo">
          <div className="brand-icon-box">
            <img src="/atr-drone-logo.svg" alt="ATR drone logo" />
          </div>
          <div className="brand-text">
            <h1>ATR</h1>
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
          {currentUser ? (
            <div className="profile-menu-wrap">
              <button
                type="button"
                className="profile-trigger"
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-expanded={profileMenuOpen}
              >
                <span className="profile-avatar">
                  {avatar ? <img src={avatar} alt="Ảnh đại diện" /> : <User size={15} />}
                </span>
                <span>{currentUser.name || t('nav.user')}</span>
                {currentUser.role === 'admin' && <strong>Admin</strong>}
              </button>

              {profileMenuOpen && (
                <div className="profile-menu">
                  <div className="profile-menu-heading">Tài khoản của bạn</div>
                  <div className="profile-menu-preview">
                    <span className="profile-avatar profile-avatar-large">
                      {avatar ? <img src={avatar} alt="Ảnh đại diện" /> : <User size={22} />}
                    </span>
                    <div>
                      <strong>{currentUser.name || t('nav.user')}</strong>
                      <span>{currentUser.email}</span>
                    </div>
                  </div>
                  <label className="avatar-upload-button">
                    Chọn ảnh đại diện
                    <input type="file" accept="image/*" onChange={handleAvatarChange} />
                  </label>
                </div>
              )}

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

