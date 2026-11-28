import { useCallback, useEffect, useRef, useState } from 'react'
import { validationService } from '../services/validationService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

export function useValidationStudy(featureGenerationId, preferredStudyId = '') {
  const [studies, setStudies] = useState([])
  const [selectedId, setSelectedId] = useState(preferredStudyId)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stop = useRef(false)
  const activeGeneration = useRef(featureGenerationId)
  const study = studies.find((item) => item.id === selectedId) || null
  const update = useCallback((next) => {
    setStudies((items) => [next, ...items.filter((item) => item.id !== next.id)])
    setSelectedId(next.id)
  }, [])
  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const rows = await validationService.list(featureGenerationId)
      if (activeGeneration.current !== featureGenerationId) return
      setStudies(rows)
      setSelectedId((id) => rows.some((item) => item.id === id) ? id : '')
    } catch (err) { setError(extractErrorMessage(err, 'Không tải được validation.')) }
    finally { setLoading(false) }
  }, [featureGenerationId])
  useEffect(() => {
    activeGeneration.current = featureGenerationId
    validationService.list(featureGenerationId).then((rows) => {
      if (activeGeneration.current !== featureGenerationId) return
      setStudies(rows)
      setSelectedId(rows.some((item) => item.id === preferredStudyId) ? preferredStudyId : '')
    }).catch((err) => {
      if (activeGeneration.current === featureGenerationId) setError(extractErrorMessage(err, 'Không tải được validation.'))
    }).finally(() => {
      if (activeGeneration.current === featureGenerationId) setLoading(false)
    })
    return () => { stop.current = true; activeGeneration.current = null }
  }, [featureGenerationId, preferredStudyId])
  useEffect(() => {
    if (!study || busy || !['VALIDATING', 'FINALIZING'].includes(study.status)) return
    const timer = setInterval(() => validationService.get(study.id).then(update)
      .catch((err) => setError(extractErrorMessage(err, 'Không cập nhật được trạng thái.'))), 3000)
    return () => clearInterval(timer)
  }, [study, busy, update])
  const perform = async (operation) => {
    if (busy) return false
    setBusy(true); setError(''); stop.current = false
    try { await operation(); return true }
    catch (err) {
      setError(extractErrorMessage(err, 'Thao tác validation thất bại.'))
      if (study) validationService.get(study.id).then(update).catch(() => {})
      return false
    } finally { setBusy(false) }
  }
  return {
    studies, study, selectedId, setSelectedId, loading, busy, error, reload,
    create: (payload) => perform(async () => update(await validationService.create({ ...payload, feature_generation_id: featureGenerationId }))),
    run: () => perform(async () => {
      let current = study
      for (const candidate of current.candidates) {
        if (stop.current || activeGeneration.current !== featureGenerationId) break
        if (candidate.status === 'COMPLETED') continue
        current = await validationService.run(current.id, candidate.index)
        if (activeGeneration.current !== featureGenerationId) break
        update(current)
        if (current.candidates[candidate.index].status !== 'COMPLETED') {
          setError(current.candidates[candidate.index].error || 'Cấu hình thất bại. Hãy thử chạy lại.'); break
        }
      }
    }),
    stop: () => { stop.current = true },
    finalize: () => perform(async () => update(await validationService.finalize(study.id))),
  }
}
