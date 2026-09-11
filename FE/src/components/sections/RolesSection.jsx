import React from 'react';
import { 
  ShieldCheck, 
  FlaskConical, 
  BarChart, 
  GraduationCap,
  Check 
} from 'lucide-react';
import { useLanguage } from '../../context';

const ROLES_LIST = [
  {
    role: 'Admin',
    titleKey: 'r1Title',
    descKey: 'r1Desc',
    icon: <ShieldCheck size={24} className="text-cyan-600" />,
    badge: 'Full Access',
    permissionKeys: ['r1p1', 'r1p2', 'r1p3']
  },
  {
    role: 'Researcher',
    titleKey: 'r2Title',
    descKey: 'r2Desc',
    icon: <FlaskConical size={24} className="text-indigo-600" />,
    badge: 'Research Access',
    permissionKeys: ['r2p1', 'r2p2', 'r2p3']
  },
  {
    role: 'Analyst',
    titleKey: 'r3Title',
    descKey: 'r3Desc',
    icon: <BarChart size={24} className="text-emerald-600" />,
    badge: 'Analytics Access',
    permissionKeys: ['r3p1', 'r3p2', 'r3p3']
  },
  {
    role: 'Student',
    titleKey: 'r4Title',
    descKey: 'r4Desc',
    icon: <GraduationCap size={24} className="text-amber-600" />,
    badge: 'Learning Access',
    permissionKeys: ['r4p1', 'r4p2', 'r4p3']
  }
];

export default function RolesSection() {
  const { t } = useLanguage();
  return (
    <section id="roles" style={{ padding: '80px 0' }}>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <span className="section-tag">{t('roles.tag')}</span>
          <h2 className="section-title">{t('roles.title')}</h2>
          <p className="section-desc">
            {t('roles.desc')}
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
          {ROLES_LIST.map((item) => (
            <div 
              key={item.role} 
              className="light-card"
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                background: '#ffffff'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <span className="badge badge-blue" style={{ fontSize: '11px' }}>
                  {item.role}
                </span>
              </div>

              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {t(`roles.${item.titleKey}`)}
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                  {t(`roles.${item.descKey}`)}
                </p>
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                {item.permissionKeys.map((permissionKey) => (
                  <div key={permissionKey} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                    <Check size={13} className="text-emerald-600" />
                    <span>{t(`roles.${permissionKey}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
