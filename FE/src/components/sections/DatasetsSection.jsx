import React from 'react';
import { 
  Database, 
  Layers, 
  CheckCircle2 
} from 'lucide-react';
import { useLanguage } from '../../context';

export default function DatasetsSection() {
  const { t } = useLanguage();
  return (
    <section id="datasets" style={{ padding: '60px 0 80px 0', background: '#f8fafc', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="container">
        {/* Header */}
        <div className="section-header">
          <span className="section-tag">{t('datasets.tag')}</span>
          <h2 className="section-title">{t('datasets.title')}</h2>
          <p className="section-desc">
            {t('datasets.desc')}
          </p>
        </div>

        {/* 2 Cards Grid: inD & pNEUMA */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', maxWidth: '960px', margin: '0 auto' }}>
          {/* 1. inD Dataset (Primary) */}
          <div className="light-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1.5px solid #bae6fd' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'var(--brand-light)',
                  color: 'var(--brand-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Database size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{t('datasets.indTitle')}</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Intersection Drone Dataset</span>
                </div>
              </div>
              <span className="badge badge-blue" style={{ fontWeight: 700 }}>
                {t('datasets.indTitle')}
              </span>
            </div>

            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {t('datasets.indDesc')}
            </p>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={15} className="text-cyan-600" />
                <span>{t('datasets.indFeat1')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={15} className="text-cyan-600" />
                <span>{t('datasets.indFeat2')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={15} className="text-cyan-600" />
                <span>{t('datasets.indFeat3')}</span>
              </div>
            </div>
          </div>

          {/* 2. pNEUMA Dataset (Benchmark) */}
          <div className="light-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#fef3c7',
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Layers size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{t('datasets.pneumaTitle')}</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Large-scale Urban Drone Dataset</span>
                </div>
              </div>
              <span className="badge badge-amber" style={{ fontWeight: 700 }}>
                {t('datasets.pneumaTitle')}
              </span>
            </div>

            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {t('datasets.pneumaDesc')}
            </p>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={15} className="text-amber-600" />
                <span>{t('datasets.pneumaFeat1')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={15} className="text-amber-600" />
                <span>{t('datasets.pneumaFeat2')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={15} className="text-amber-600" />
                <span>{t('datasets.pneumaFeat3')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
