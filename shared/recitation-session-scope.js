import { recitationGroupKey } from './recitation-group-evaluation.js';

export const isDailyRecitationTask = (task, date) => Boolean(Number(task.nazemManaged))
  || !date || task.taskDate === date;

export const isRecitationCompensationTask = (task, date, allowed) => Boolean(allowed && date
  && !Number(task.nazemManaged) && ['memorization', 'review'].includes(task.taskType)
  && task.taskDate < date && !task.locallySaved && ![true, 1].includes(task.teacherCompleted));

export function groupRecitationCompensations(tasks, date, allowed) {
  const groups = new Map();
  for (const task of tasks.filter(task => isRecitationCompensationTask(task, date, allowed))) {
    const key = recitationGroupKey(task);
    if (!groups.has(key)) groups.set(key, { key, taskDate: task.taskDate, tasks: [] });
    groups.get(key).tasks.push(task);
  }
  return [...groups.values()].sort((a, b) => a.taskDate.localeCompare(b.taskDate) || a.key.localeCompare(b.key));
}

export function localRecitationScopeError(task, date, compensation, allowed) {
  if (Number(task.nazemManaged)) return null;
  if (compensation !== undefined && typeof compensation !== 'boolean') return { statusCode: 422, message: 'نوع التسميع غير صحيح.' };
  if (task.taskType === 'link' && (task.taskDate !== date || compensation)) {
    return { statusCode: 422, message: 'الربط خاص بمقدار اليوم ولا يقبل التعويض.' };
  }
  // Older offline clients did not send the scope; classify their authorized old work as compensation.
  const compensating = compensation === true || (compensation === undefined && task.taskDate < date);
  if (compensating) {
    if (!allowed) return { statusCode: 403, message: 'التعويض غير متاح.' };
    if (!(task.taskDate < date && ['memorization', 'review'].includes(task.taskType))) return { statusCode: 422, message: 'اختر مقدارًا متأخرًا للتعويض.' };
    return null;
  }
  return task.taskDate === date ? null : { statusCode: 422, message: 'اختر المقدار المتأخر من التعويض.' };
}
