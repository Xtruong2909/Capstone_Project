export const DEFAULT_EXPERIMENT_CONFIG = {
  n_estimators: '100', max_depth: '10', min_samples_split: '2',
  min_samples_leaf: '1', max_features: 'all', bootstrap: true, random_state: '42',
}

export function experimentConfiguration(source) {
  if (!source) return { ...DEFAULT_EXPERIMENT_CONFIG }
  return {
    n_estimators: String(source.n_estimators),
    max_depth: source.max_depth == null ? '' : String(source.max_depth),
    min_samples_split: String(source.min_samples_split),
    min_samples_leaf: String(source.min_samples_leaf),
    max_features: source.max_features == null ? 'all' : String(source.max_features),
    bootstrap: source.bootstrap,
    random_state: String(source.random_state),
  }
}

export function resolveExperimentPreset(studies, incoming, generationId) {
  if (incoming?.featureGenerationId === generationId && incoming.hyperparameters) return incoming
  const study = [...studies].filter(item => item.feature_generation_id === generationId
    && item.status === 'COMPLETED' && item.result?.hyperparameters
    && Number.isInteger(item.result.selected_candidate_index))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
  return study ? {
    featureGenerationId: generationId, studyId: study.id,
    candidateIndex: study.result.selected_candidate_index,
    hyperparameters: study.result.hyperparameters,
  } : null
}

export function experimentSource(experiment) {
  if (experiment.evaluation_subset === 'VALIDATION') return 'Cấu hình Validation'
  return experiment.evaluation_policy?.startsWith('frozen validation selection;')
    ? 'Test cuối từ Validation' : 'Train/Test thủ công'
}
