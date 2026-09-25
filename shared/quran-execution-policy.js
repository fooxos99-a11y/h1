const QURAN_EXECUTION_SOURCES = Object.freeze(['student', 'teacher', 'both']);

export function compareQuranPositionInDirection(first = {}, second = {}, direction = 1) {
  if (Number(direction) >= 0) {
    return Number(first.page || 0) - Number(second.page || 0)
      || Number(first.surah || 0) - Number(second.surah || 0)
      || Number(first.ayah || 0) - Number(second.ayah || 0);
  }
  return Number(second.surah || 0) - Number(first.surah || 0)
    || Number(first.ayah || 0) - Number(second.ayah || 0)
    || Number(first.page || 0) - Number(second.page || 0);
}

const rangePosition = (range = {}, prefix = undefined) => ({
  page: Number(range[`${prefix}Page`] || 0),
  surah: Number(range[`${prefix}Surah`] || 0),
  ayah: Number(range[`${prefix}Ayah`] || 0),
});

export function orderQuranRangesBeforePosition(ranges = [], current = {}, direction = 1) {
  return [...ranges]
    .map((range) => {
      const first = rangePosition(range, 'start');
      const second = rangePosition(range, 'end');
      const ordered = compareQuranPositionInDirection(first, second, direction) <= 0
        ? [first, second]
        : [second, first];
      return { range, traversalStart: ordered[0], traversalEnd: ordered[1] };
    })
    .filter(({ traversalEnd }) => (
      compareQuranPositionInDirection(traversalEnd, current, direction) < 0
    ))
    .sort((left, right) => compareQuranPositionInDirection(
      right.traversalEnd,
      left.traversalEnd,
      direction,
    ));
}

export function normalizeQuranExecutionSource(value, fallback = 'student') {
  return QURAN_EXECUTION_SOURCES.includes(String(value || '')) ? String(value) : fallback;
}

export function getQuranTaskExecutionSource(settings = {}, taskType = '') {
  if (taskType === 'memorization') {
    return normalizeQuranExecutionSource(settings.memorizationExecutionSource, 'teacher');
  }
  if (taskType === 'review') {
    return normalizeQuranExecutionSource(settings.reviewExecutionSource, settings.quranTaskExecutionSource || 'student');
  }
  if (taskType === 'link') {
    return normalizeQuranExecutionSource(settings.linkExecutionSource, settings.quranTaskExecutionSource || 'student');
  }
  if (taskType === 'repeat') {
    return getQuranTaskExecutionSource(settings, 'memorization');
  }
  return normalizeQuranExecutionSource(settings.quranTaskExecutionSource, 'student');
}

export const canStudentExecuteQuranTask = (settings, taskType) => (
  ['student', 'both'].includes(getQuranTaskExecutionSource(settings, taskType))
);

export const canTeacherExecuteQuranTask = (settings, taskType) => (
  taskType === 'memorization'
  || ['teacher', 'both'].includes(getQuranTaskExecutionSource(settings, taskType))
);

export const hasStudentQuranExecution = (settings = {}) => (
  ['memorization', 'review', 'link', 'repeat']
    .some((taskType) => canStudentExecuteQuranTask(settings, taskType))
);

const isEnabled = (value, fallback = false) => (
  value === undefined ? fallback : value === true || value === 'true'
);

export function canStudentSetQuranTaskEnd(settings = {}, taskType = '', comparisonToAssignedEnd = 0) {
  const comparison = Math.sign(Number(comparisonToAssignedEnd || 0));
  if (comparison === 0) return true;
  if (taskType === 'link') return false;
  if (taskType === 'review') return isEnabled(settings.studentReviewAmountEditable, true);
  if (comparison < 0) {
    const _resolveEditableKey = () => {
      if (taskType === 'review') {
        return 'studentReviewAmountEditable';
      }
      if (taskType === 'link') {
        return 'studentLinkAmountEditable';
      }
      return 'studentTaskAmountEditable';
    };
    const editableKey = _resolveEditableKey();
    return isEnabled(settings[editableKey], true);
  }
  return taskType === 'memorization'
    && (isEnabled(settings.allowQuranCompensation, true) || isEnabled(settings.allowQuranExtra));
}
