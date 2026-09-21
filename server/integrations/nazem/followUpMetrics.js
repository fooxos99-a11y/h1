import { normalizeNazemLinkCount } from '../../../shared/nazem-link-count.js';

export function nazemFollowUpMetricsMatch(day, local) {
  if (day.taskType !== 'memorization' && !['conserve', 'master'].includes(day.remoteType)) return true;
  if (Object.hasOwn(day, 'repetition') && Math.min(30, Math.max(0, Number(day.repetition))) !== Number(local.repeatCount)) return false;
  if (Object.hasOwn(day, 'hearing') && (Number(day.hearing) === 1 ? 1 : 0) !== Number(local.listeningCount)) return false;
  if (Object.hasOwn(day, 'link') && normalizeNazemLinkCount(day.link) !== Number(local.linkCount)) return false;
  return true;
}
