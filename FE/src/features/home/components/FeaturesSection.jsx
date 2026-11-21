import { FEATURES } from '../homeContent'
import { useLanguage } from '../../../hooks/useLanguage'

export default function FeaturesSection() {
  const { t } = useLanguage()
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section__head">
          <span className="eyebrow">{t('System Functional Architecture')}</span>
          <h2>{t('Core Capabilities & Analytical Modules')}</h2>
          <p>
            {t('Structured into 6 primary functional modules and advanced traffic extensions dedicated to UAV trajectory extraction and ultra-short-term forecasting.')}
          </p>
        </div>
        <div className="grid grid--features">
          {FEATURES.map(({ icon: Icon, color, tag, title, desc }) => (
            <article className="card feature" key={title}>
              <div className="feature__top">
                <span className={`icon-chip icon-chip--${color}`}>
                  <Icon size={20} />
                </span>
                <span className={`pill pill--${tag === 'Advanced' ? 'purple' : 'blue'}`}>
                  {t(tag)}
                </span>
              </div>
              <h3>{t(title)}</h3>
              <p>{t(desc)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
