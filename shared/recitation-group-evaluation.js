import { calculateRecitationScore } from './evaluation-settings.js';

export const isLocalRecitationGroup = task => !Number(task?.nazemManaged)
  && ['memorization', 'link', 'review'].includes(task?.taskType);

export const recitationGroupKey = task => [task.planId, task.taskDate, task.taskType, task.track || 'memorization'].join(':');

export function localRecitationGroups(tasks = []) {
  const groups = new Map();
  for (const task of tasks.filter(isLocalRecitationGroup)) {
    const key = recitationGroupKey(task);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  return [...groups.values()].map(group => group.sort((a, b) => Number(a.id) - Number(b.id)));
}

export function countRecitationPayload(task, tasks, itemCounts) {
  if (!isLocalRecitationGroup(task)) return itemCounts[String(task.id)] || { warningCount: 0, mistakeCount: 0 };
  const group = tasks.filter(item => recitationGroupKey(item) === recitationGroupKey(task))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const counts = itemCounts[String(group[0].id)] || { warningCount: 0, mistakeCount: 0 };
  return {
    warningCount: Number(task.id) === Number(group[0].id) ? counts.warningCount : 0,
    mistakeCount: Number(task.id) === Number(group[0].id) ? counts.mistakeCount : 0,
    groupEvaluation: { taskIds: group.map(item => Number(item.id)), ...counts },
  };
}

export function mushafRecitationGroup(task, items) {
  if (!isLocalRecitationGroup(task)) return undefined;
  const group = items.filter(item => recitationGroupKey(item.task) === recitationGroupKey(task));
  const marks = group.flatMap(item => item.payload.wordMarks || []);
  return {
    taskIds: group.map(item => Number(item.task.id)),
    warningCount: marks.filter(mark => mark.markType === 'warning').length,
    mistakeCount: marks.filter(mark => mark.markType === 'mistake').length,
    wordMarksByTask: Object.fromEntries(group.map(item => [String(item.task.id), item.payload.wordMarks || []])),
  };
}

export function calculateGroupRecitationOutcome({ policy, taskType, evaluatedFaces, expectedFaces, warningCount, mistakeCount }) {
  const gradingFaces = taskType === 'review' && expectedFaces > 0 ? Math.min(evaluatedFaces, expectedFaces) : evaluatedFaces;
  const qualityScore = calculateRecitationScore(policy, gradingFaces, warningCount, mistakeCount);
  const ratio = taskType === 'review' && expectedFaces > 0 ? Math.min(1, Math.max(0, evaluatedFaces / expectedFaces)) : 1;
  return {
    score: Math.max(0, Math.round(qualityScore * ratio)),
    completed: qualityScore >= Number(policy.passingScore || 0),
  };
}
