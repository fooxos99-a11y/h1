import { tasksMatchingNazemRange } from './taskRange.js';

export const nazemRemainderSuffix = task => task?.nazemRemainderKey ? `:remainder:${task.nazemRemainderKey}` : '';

export function scopeNazemRewardTasks(daily, tasks) {
  if (!tasks.some(task => task.nazemRemainderKey)) return tasks;
  const local = typeof daily.localSnapshot === 'string' ? JSON.parse(daily.localSnapshot) : daily.localSnapshot;
  const primary = tasksMatchingNazemRange(tasks.filter(task => task.taskType === daily.taskType), local?.nazemSavedTarget);
  const identities = new Set(primary.map(task => task.nazemRemainderKey || ''));
  if (!local?.nazemSavedTarget || !primary.length || identities.size !== 1) {
    const error = new Error('تعذر فصل تقييم المتبقي عن التقييم السابق لاحتساب النقاط.');
    error.statusCode = 409;
    throw error;
  }
  return primary[0].nazemRemainderKey ? primary
    : tasks.filter(task => task.taskType !== daily.taskType || primary.some(row => Number(row.id) === Number(task.id)));
}
