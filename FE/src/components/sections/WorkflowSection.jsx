import React from 'react';
import { 
  Database, 
  ShieldCheck, 
  Activity, 
  Map, 
  TrendingUp, 
  FlaskConical, 
  FileText,
  ArrowRight
} from 'lucide-react';
import { useLanguage } from '../../context';

const WORKFLOW_STEPS = [
  { step: '01', titleKey: 'step1', descKey: 'step1Desc', icon: <Database size={18} /> },
  { step: '02', titleKey: 'step2', descKey: 'step2Desc', icon: <ShieldCheck size={18} /> },
  { step: '03', titleKey: 'step3', descKey: 'step3Desc', icon: <Activity size={18} /> },
  { step: '04', titleKey: 'step4', descKey: 'step4Desc', icon: <Map size={18} /> },
  { step: '05', titleKey: 'step5', descKey: 'step5Desc', icon: <TrendingUp size={18} /> },
  { step: '06', titleKey: 'step6', descKey: 'step6Desc', icon: <FlaskConical size={18} /> },
  { step: '07', titleKey: 'step7', descKey: 'step7Desc', icon: <FileText size={18} /> }
];

export default function WorkflowSection() {
  const { t } = useLanguage();
  return (
    <section id="workflow" style={{ padding: '80px 0', background: '#ffffff', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <span className="section-tag">{t('workflow.tag')}</span>
          <h2 className="section-title">{t('workflow.title')}</h2>
          <p className="section-desc">
            {t('workflow.desc')}
          </p>
        </div>

        {/* Workflow Horizontal Chain */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          background: '#f8fafc',
          padding: '24px 20px',
          borderRadius: '18px',
          border: '1px solid var(--border-subtle)'
        }}>
          {WORKFLOW_STEPS.map((step, idx) => (
            <React.Fragment key={step.step}>
              <div className="workflow-step-card" style={{
                background: '#ffffff',
                border: '1px solid var(--border-medium)',
                borderRadius: '12px',
                padding: '16px 14px',
                textAlign: 'center',
                flex: 1,
                minWidth: '125px',
                height: '320px',
                boxSizing: 'border-box',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.2s ease'
              }}>
                <div style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--brand-primary)',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  marginBottom: '6px'
                }}>
                  STEP {step.step}
                </div>

                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'var(--brand-light)',
                  color: 'var(--brand-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px auto'
                }}>
                  {step.icon}
                </div>

                <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '13px', fontWeight: 700, lineHeight: 1.3, letterSpacing: '0', color: 'var(--text-primary)', marginBottom: '7px' }}>
                  {t(`workflow.${step.titleKey}`)}
                </h4>

                <p style={{ fontFamily: 'var(--font-body)', fontSize: '11.5px', fontWeight: 400, color: 'var(--text-secondary)', lineHeight: 1.45, letterSpacing: '0' }}>
                  {t(`workflow.${step.descKey}`)}
                </p>
              </div>

              {idx < WORKFLOW_STEPS.length - 1 && (
                <div style={{ color: 'var(--border-strong)', display: 'flex', alignItems: 'center' }}>
                  <ArrowRight size={18} className="hidden-mobile" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
