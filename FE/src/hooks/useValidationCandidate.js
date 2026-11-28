import { useEffect, useState } from 'react'
import { validationService } from '../services/validationService'
import { dataScienceService } from '../services/dataScienceService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

export function useValidationCandidate(studyId, candidateIndex) {
  const [retry, setRetry] = useState(0)
  const key = `${studyId}:${candidateIndex}:${retry}`
  const [state, setState] = useState({ key: null, study: null, detail: null, error: '' })
  useEffect(() => {
    let active = true
    validationService.get(studyId).then(async study => {
      const candidate = study.candidates.find(row => String(row.index) === candidateIndex)
      const detail = candidate?.experiment_id ? await dataScienceService.getExperiment(candidate.experiment_id) : null
      if (detail && (detail.evaluation_subset !== 'VALIDATION' || detail.experiment_id !== candidate.experiment_id)) {
        throw new Error('Kết quả không thuộc tập validation của lượt này.')
      }
      if (active) setState({ key, study, detail, error: '' })
    }).catch(error => {
      if (active) setState({ key, study: null, detail: null, error: extractErrorMessage(error, 'Không tải được thông tin cấu hình.') })
    })
    return () => { active = false }
  }, [studyId, key, candidateIndex])
  const loaded = state.key === key
  const candidate = loaded ? state.study?.candidates.find(row => String(row.index) === candidateIndex) : null
  return { study: loaded ? state.study : null, detail: loaded ? state.detail : null, candidate, loading: !loaded,
    error: loaded ? state.error || (!candidate ? 'Không tìm thấy cấu hình này.' : '') : '',
    reload: () => setRetry(value => value + 1) }
}
