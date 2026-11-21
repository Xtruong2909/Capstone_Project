import { WORKFLOW } from '../homeContent'
import { useLanguage } from '../../../hooks/useLanguage'

export default function WorkflowSection() {
  const { t } = useLanguage()
  return (
    <section className="section section--navy" id="workflow">
      <div className="container">
        <div className="section__head section__head--light">
          <span className="eyebrow eyebrow--light">{t('Processing Pipeline')}</span>
          <h2>{t('From Raw Drone Trajectories to 1–5 Min Forecasts')}</h2>
          <p>
            {t('An end-to-end engineering pipeline designed to ingest, validate, aggregate, and forecast urban traffic dynamics with zero lookahead bias.')}
          </p>
        </div>
        <ol className="workflow">
          {WORKFLOW.map((w) => (
            <li className="workflow__step" key={w.step}>
              <span className="workflow__num">{w.step}</span>
              <h3>{t(w.title)}</h3>
              <p>{t(w.desc)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
