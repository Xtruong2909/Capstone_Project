import { FEATURES } from '../homeContent'

export default function FeaturesSection() {
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section__head">
          <span className="eyebrow">Features</span>
          <h2>Everything you need, from raw data to decisions</h2>
          <p>Thirteen integrated modules cover the complete traffic analytics and forecasting lifecycle.</p>
        </div>
        <div className="grid grid--features">
          {FEATURES.map(({ icon: Icon, color, title, desc }, i) => (
            <article className="card feature" key={title}>
              <span className={`icon-chip icon-chip--${color}`}><Icon size={20} /></span>
              <small className="feature__id">FE-{String(i + 1).padStart(2, '0')}</small>
              <h3>{title}</h3>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
