import { FEATURES } from '../homeContent'

export default function FeaturesSection() {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section__head">
          <span className="eyebrow">System Functional Architecture</span>
          <h2>Core Capabilities &amp; Analytical Modules</h2>
          <p>
            Structured into 6 primary functional modules and advanced traffic extensions
            dedicated to UAV trajectory extraction and ultra-short-term forecasting.
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
                  {tag}
                </span>
              </div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
