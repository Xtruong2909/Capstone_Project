import { ExternalLink, Database } from 'lucide-react'
import { useLanguage } from '../../../hooks/useLanguage'
import { DATASETS } from '../homeContent'

const STATUS_PILL = {
  Recommended: 'green',
  Supported: 'blue',
  'Optional Pipeline': 'orange',
}

export default function DatasetsSection() {
  const { t } = useLanguage()
  return (
    <section className="section" id="datasets">
      <div className="container">
        <div className="section__head">
          <span className="eyebrow">{t('Data Assets')}</span>
          <h2>{t('UAV Trajectory Benchmark & Input Formats')}</h2>
          <p>
            {t('Built around the landmark pNEUMA drone dataset from EPFL and extensible to custom aerial vehicle tracking sessions.')}
          </p>
        </div>
        <div className="grid grid--3">
          {DATASETS.map((d) => (
            <article className="card dataset" key={d.name}>
              <div className="dataset__top">
                <div className="dataset__title-row">
                  <span className="dataset__icon-wrap">
                    <Database size={18} />
                  </span>
                  <div>
                    <h3>{t(d.name)}</h3>
                    <small className="dataset__tag">{t(d.tag)}</small>
                  </div>
                </div>
                <span className={`pill pill--${STATUS_PILL[d.status] || 'blue'}`}>
                  {t(d.status)}
                </span>
              </div>
              <p className="dataset__desc">{t(d.desc)}</p>
              <div className="dataset__footer">
                <span className="dataset__source">{t('Source:')} {t(d.source)}</span>
                {d.link && (
                  <a
                    href={d.link}
                    target="_blank"
                    rel="noreferrer"
                    className="dataset__link"
                    aria-label={`${t('External link to')} ${t(d.name)}`}
                  >
                    {t('EPFL Portal')} <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
