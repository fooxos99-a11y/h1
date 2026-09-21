import { isValidNazemLinkCount } from './nazem-link-count.js';

export const isNazemLinkTask = (task) => Boolean(Number(task?.nazemManaged)) && task.taskType === 'link';

export const isNazemMasteryTask = (task) => Boolean(Number(task?.nazemManaged))
  && task.taskType === 'memorization' && task.track === 'mastery';

export const hasNazemFixedRange = (task) => Boolean(Number(task?.nazemManaged))
  && (task.taskType === 'link' || Boolean(Number(task.nazemLate)));

export const resolveTaskRecitationMode = (task, preferredMode = 'mushaf') => (
  isNazemMasteryTask(task) || isNazemLinkTask(task) ? 'count' : preferredMode
);

export const readNazemLinkCount = (value) => (
  value !== null && value !== undefined && value !== '' && isValidNazemLinkCount(value)
    ? Number(value) : null
);

export const countEvaluationItems = (tasks = []) => (
  isNazemLinkTask(tasks[0])
    ? [{ id: tasks[0].id }]
    : tasks.map((task, index) => ({ id: task.id, label: task.amount || task.rangeLabel || `المقطع ${index + 1}` }))
);

export const canMarkNazemNotCompleted = (task) => Boolean(Number(task?.nazemManaged))
  && ['memorization', 'review', 'link'].includes(task.taskType)
  && !task.nazemSubmissionLocked;

export const nazemNotCompletedLabel = (task) => task?.taskType === 'review' ? 'لم تتم المراجعة'
  : task?.taskType === 'link' ? 'لم يتم الربط'
    : task?.track === 'mastery' ? 'لم يتم الإتقان' : 'لم يتم الحفظ';
