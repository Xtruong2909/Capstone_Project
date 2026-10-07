import { WORKFLOW } from '../homeContent'

export default function WorkflowSection() {
  return (
    <section className="section section--navy" id="workflow">
      <div className="container">
        <div className="section__head section__head--light">
          <span className="eyebrow eyebrow--light">Workflow</span>
          <h2>A clear path from dataset to report</h2>
          <p>Each step is guarded by role-based access, validation, and audit logging.</p>
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
