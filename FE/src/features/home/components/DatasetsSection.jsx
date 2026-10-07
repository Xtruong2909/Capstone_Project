import { DATASETS } from '../homeContent'

const PILL = { Approved: 'green', Benchmark: 'blue', Pending: 'orange' }

export default function DatasetsSection() {
  return (
    <section className="section section--tint" id="datasets">
      <div className="container">
        <div className="section__head">
          <span className="eyebrow">Datasets</span>
          <h2>Trusted traffic data sources</h2>
          <p>Work with public drone-collected datasets or bring your own.</p>
        </div>
        <div className="grid grid--3">
          {DATASETS.map((d) => (
            <article className="card dataset" key={d.name}>
              <div className="dataset__top">
                <h3>{d.name}</h3>
                <span className={`pill pill--${PILL[d.status]}`}>{d.status}</span>
              </div>
              <small>{d.tag}</small>
              <p>{d.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
