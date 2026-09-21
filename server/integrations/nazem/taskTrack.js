export function nazemTaskTrack(task, fallback = 'memorization') {
  if (task?.taskType !== 'memorization' && task?.taskType !== 'repeat') return 'memorization';
  if (task.remoteType === 'master') return 'mastery';
  if (task.remoteType === 'conserve') return 'memorization';
  return (task.track || fallback) === 'mastery' ? 'mastery' : 'memorization';
}
