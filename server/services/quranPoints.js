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
  const categoryPoints = taskType === 'memorization'
    ? Number(track === 'mastery' ? settings.masteryEvaluationMaxScore : settings.memorizationEvaluationMaxScore)
    : taskType === 'review'
      ? Number(settings.reviewEvaluationMaxScore || 0)
      : taskType === 'link'
        ? Number(settings.linkEvaluationMaxScore || 0)
        : 0;
  const taskPoints = taskType === 'memorization'
    ? 0
    : calculateProportionalPoints(categoryPoints, completedAmount, expectedAmount);
  const repeatPoints = taskType === 'memorization'
    ? Math.max(0, Math.min(Number(completedRepeatCount || 0), Number(expectedRepeatCount || 0)))
      * Math.max(0, Math.trunc(Number(track === 'mastery'
        ? settings.masteryRepeatPointValue ?? 1
        : settings.memorizationRepeatPointValue ?? 1)))
    : 0;
  const listeningPoints = taskType === 'memorization'
    ? Math.max(0, Math.min(Number(completedListeningCount || 0), Number(expectedListeningCount || 0)))
      * Math.max(0, Math.trunc(Number(track === 'mastery'
        ? settings.masteryListeningPointValue ?? 10
        : settings.memorizationListeningPointValue ?? 10)))
    : 0;

  return {
    taskPoints,
    repeatPoints,
    listeningPoints,
    total: taskPoints + repeatPoints + listeningPoints,
    label: taskType === 'memorization'
      ? (track === 'mastery'
        ? 'الإتقان والتكرار والسماع'
        : 'الحفظ والتكرار والسماع')
      : taskType === 'review'
        ? 'المراجعة'
        : 'الربط',
  };
}
