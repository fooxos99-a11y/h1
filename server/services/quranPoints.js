const clampRatio = (value) => Math.min(1, Math.max(0, Number(value || 0)));

export function calculateProportionalPoints(maxPoints, completed, expected) {
  const normalizedMax = Math.max(0, Number(maxPoints || 0));
  const normalizedExpected = Math.max(0, Number(expected || 0));
  if (!normalizedMax || !normalizedExpected) return 0;
  return Math.max(0, Math.round(normalizedMax * clampRatio(Number(completed || 0) / normalizedExpected)));
}

export function calculateStudentExecutionPoints({
  taskType,
  track,
  completedAmount,
  expectedAmount,
  completedRepeatCount = 0,
  expectedRepeatCount = 0,
  completedListeningCount = 0,
  expectedListeningCount = 0,
  settings = {},
}) {
  const _resolveCategoryPoints = () => {
    if (taskType === 'memorization') {
      return Number(track === 'mastery' ? settings.masteryEvaluationMaxScore : settings.memorizationEvaluationMaxScore);
    }
    if (taskType === 'review') {
      return Number(settings.reviewEvaluationMaxScore || 0);
    }
    if (taskType === 'link') {
      return Number(settings.linkEvaluationMaxScore || 0);
    }
    return 0;
  };
  const categoryPoints = _resolveCategoryPoints();
  const taskPoints = taskType === 'memorization'
    ? 0
    : calculateProportionalPoints(categoryPoints, completedAmount, expectedAmount);
  const _resolveRepeatPoints = () => {
    if (taskType === 'memorization') {
      return Math.max(0, Math.min(Number(completedRepeatCount || 0), Number(expectedRepeatCount || 0)))
      * Math.max(0, Math.trunc(Number(track === 'mastery'
        ? settings.masteryRepeatPointValue ?? 1
        : settings.memorizationRepeatPointValue ?? 1)));
    }
    return 0;
  };
  const repeatPoints = _resolveRepeatPoints();
  const _resolveListeningPoints = () => {
    if (taskType === 'memorization') {
      return Math.max(0, Math.min(Number(completedListeningCount || 0), Number(expectedListeningCount || 0)))
      * Math.max(0, Math.trunc(Number(track === 'mastery'
        ? settings.masteryListeningPointValue ?? 10
        : settings.memorizationListeningPointValue ?? 10)));
    }
    return 0;
  };
  const listeningPoints = _resolveListeningPoints();

  const _resolveLabel = () => {
    if (taskType === 'memorization') {
      if (track === 'mastery') {
        return 'الإتقان والتكرار والسماع';
      }
      return 'الحفظ والتكرار والسماع';
    }
    if (taskType === 'review') {
      return 'المراجعة';
    }
    return 'الربط';
  };
  return {
    taskPoints,
    repeatPoints,
    listeningPoints,
    total: taskPoints + repeatPoints + listeningPoints,
    label: _resolveLabel(),
  };
}
