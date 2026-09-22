const roundScore = (value) => Number(Number(value).toFixed(2));
const roundWholeScore = (value) => Math.round(Number(value));

export function resolveRecitationEvaluationUnit(type, rawEvaluatedFaces, rawTargetFaces) {
  if (!['memorization', 'mastery'].includes(type)) return 'tenFaces';
  const evaluatedFaces = Math.max(0.25, Number(rawEvaluatedFaces) || 0.25);
  const targetFaces = Math.max(0, Number(rawTargetFaces) || 0);
  const policyFaces = targetFaces > 0 && targetFaces <= 0.5
    ? Math.min(evaluatedFaces, targetFaces)
    : evaluatedFaces;
  if (policyFaces <= 0.25) return 'quarterFace';
  if (policyFaces <= 0.5) return 'halfFace';
  return 'face';
}

export function updateEvaluationMaxScore(settings, prefix, rawValue) {
  const maxScoreKey = `${prefix}MaxScore`;
  const passingScoreKey = `${prefix}PassingScore`;
  const previousMaxScore = Math.max(1, Number(settings[maxScoreKey]) || 1);
  const previousPassingScore = Math.max(1, Number(settings[passingScoreKey]) || 1);
  const maxScore = Math.max(1, Number(rawValue) || 1);
  const passingRatio = Math.min(1, previousPassingScore / previousMaxScore);

  return {
    ...settings,
    [maxScoreKey]: maxScore,
    [passingScoreKey]: Math.max(1, roundScore(maxScore * passingRatio)),
  };
}

export function calculateRecitationScore(policy, rawFaces, rawWarnings, rawMistakes) {
  const faces = Math.max(0.25, Number(rawFaces) || 0.25);
  const warnings = Math.max(0, Number(rawWarnings) || 0);
  const mistakes = Math.max(0, Number(rawMistakes) || 0);
  const maxScore = Math.max(1, roundWholeScore(Number(policy.maxScore) || 1));
  const isPerFace = ['memorization', 'mastery'].includes(policy.type);

  if (isPerFace) {
    const evaluationUnits = ['quarterFace', 'halfFace'].includes(policy.unit) ? 1 : Math.max(1, faces);
    return Math.max(0, roundWholeScore(Math.min(
      maxScore,
      maxScore
        - ((mistakes / evaluationUnits) * policy.mistakeDeduction)
        - ((warnings / evaluationUnits) * policy.warningDeduction),
    )));
  }

  const tenFaceUnits = faces / 10;
  const mistakeDeduction = policy.type === 'review'
    ? policy.mistakeDeduction
    : policy.mistakeDeduction / tenFaceUnits;
  const warningDeduction = policy.warningDeduction / tenFaceUnits;
  return Math.max(0, roundWholeScore(Math.min(
    maxScore,
    maxScore
      - (mistakes * mistakeDeduction)
      - (warnings * warningDeduction),
  )));
}


export function getRecitationEvaluationPolicy(settings, task = {}) {
  const _resolveType = () => {
    if (task.taskType === 'memorization' && task.track === 'mastery') {
      return 'mastery';
    }
    if (['memorization', 'review', 'link'].includes(task.taskType)) {
      return task.taskType;
    }
    return 'memorization';
  };
  const type = _resolveType();
  const rawFaces = Math.max(0, Number(task.evaluatedFaces ?? task.targetPages ?? 0));
  const faces = rawFaces > 0 ? Math.max(0.25, Math.round(rawFaces * 4) / 4) : 0;
  const unit = resolveRecitationEvaluationUnit(type, faces, task.targetPages);
  const _resolvePrefix = () => {
    if (unit === 'quarterFace') {
      return `${type}QuarterFaceEvaluation`;
    }
    if (unit === 'halfFace') {
      return `${type}HalfFaceEvaluation`;
    }
    return `${type}Evaluation`;
  };
  const prefix = _resolvePrefix();
  return { type, unit, maxScore: Number(settings[`${prefix}MaxScore`] || 100),
    warningDeduction: Number(settings[`${prefix}WarningDeduction`] || 0),
    mistakeDeduction: Number(settings[`${prefix}MistakeDeduction`] || 0),
    passingScore: Number(settings[`${prefix}PassingScore`] || 85) };
}
