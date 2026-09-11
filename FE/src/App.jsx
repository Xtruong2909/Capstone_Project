import React, { useState } from 'react';
import { Navbar, Footer } from './components/layout';
import { 
  Hero, 
  DashboardPreview, 
  DatasetsSection, 
  FeaturesSection, 
  WorkflowSection, 
  RolesSection, 
  CtaSection 
} from './components/sections';
import { AuthModal, LegalModal } from './components/modals';

function App() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [currentUser, setCurrentUser] = useState(null);

  // Legal Modal states (Terms of Service / Privacy Policy)
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState('terms'); // 'terms' or 'privacy'

  const handleOpenAuth = (mode = 'login') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleOpenLegal = (tab = 'terms') => {
    setLegalTab(tab);
    setLegalModalOpen(true);
  };

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* 1. NAVBAR */}
      <Navbar 
        onOpenAuth={handleOpenAuth}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content following exact wireframe order */}
      <main>
        {/* 2. HERO */}
        <Hero 
          onOpenAuth={handleOpenAuth}
        />

        {/* 3. DASHBOARD PREVIEW */}
        <DashboardPreview 
          onOpenAuth={handleOpenAuth}
        />

        {/* 4. DATASETS (inD & pNEUMA) */}
        <DatasetsSection />

        {/* 5. FEATURES (8 modules) */}
        <FeaturesSection />

        {/* 6. WORKFLOW (Dataset -> Validation -> Analysis -> Visualization -> Forecasting -> Evaluation -> Report) */}
        <WorkflowSection />

        {/* 7. ROLES (Admin | Researcher | Analyst | Student) */}
        <RolesSection />

        {/* 8. CTA */}
        <CtaSection 
          onOpenAuth={handleOpenAuth}
        />
      </main>

      {/* 9. FOOTER */}
      <Footer 
        onOpenAuth={handleOpenAuth}
        onOpenLegal={handleOpenLegal}
      />

      {/* AUTH MODAL (Đăng nhập & Đăng ký) */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        onOpenLegal={handleOpenLegal}
      />

      {/* LEGAL MODAL (Điều khoản dịch vụ & Chính sách bảo mật) */}
      <LegalModal
        isOpen={legalModalOpen}
        initialTab={legalTab}
        onClose={() => setLegalModalOpen(false)}
      />
    </div>
  );
}

export default App;
