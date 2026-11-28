export function selectValidationCandidate(study) {
  if (!study || !['VALIDATED', 'COMPLETED', 'FINAL_FAILED'].includes(study.status)) return null
  const candidates = (study.candidates || []).filter(candidate => candidate.status === 'COMPLETED'
    && Number.isFinite(candidate.mean_rmse) && Number.isFinite(candidate.mean_mae))
  const frozenIndex = study.result?.selected_candidate_index
  if (frozenIndex != null) return candidates.find(candidate => candidate.index === frozenIndex) || null
  return [...candidates].sort((a, b) => a.mean_rmse - b.mean_rmse
    || a.mean_mae - b.mean_mae || a.index - b.index)[0] || null
}
