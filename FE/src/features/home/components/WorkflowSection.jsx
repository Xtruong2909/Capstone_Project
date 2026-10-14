import { WORKFLOW } from '../homeContent'

export default function WorkflowSection() {
  return (
    <section className="section section--navy" id="workflow">
      <div className="container">
        <div className="section__head section__head--light">
          <span className="eyebrow eyebrow--light">Processing Pipeline</span>
          <h2>From Raw Drone Trajectories to 1–5 Min Forecasts</h2>
          <p>
            An end-to-end engineering pipeline designed to ingest, validate, aggregate,
            and forecast urban traffic dynamics with zero lookahead bias.
          </p>
        </div>
        <ol className="workflow">
          {WORKFLOW.map((w) => (
            <li className="workflow__step" key={w.step}>
              <span className="workflow__num">{w.step}</span>
              <h3>{w.title}</h3>
              <p>{w.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
