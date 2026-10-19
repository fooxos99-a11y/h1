import { compareRecitationSessions, OFFLINE_RECITATION_MAX_BATCH, recitationSessionsShareDependency, recitationOutcomeBlocksFollowing } from '../../shared/offline-recitation.js';

export async function processRecitationSessionBatch(input, execute) {
  const sessions = (Array.isArray(input) ? input : [])
    .slice(0, OFFLINE_RECITATION_MAX_BATCH).sort(compareRecitationSessions);
  const results = [];
  const blockedStudents = new Map();
  for (const session of sessions) {
    const studentId = Number(session.studentId || 0);
    const previous = (blockedStudents.get(studentId) || []).find(entry => recitationSessionsShareDependency(entry.session, session));
    if (previous) {
      const reason = previous.outcome.tasks?.find(item => item.message)?.message || previous.outcome.message;
      const labels = { memorization: 'الحفظ', review: 'المراجعة', link: 'الربط' };
      const task = previous.session.tasks?.[0];
      const date = task?.taskDate || previous.session.sessionDate;
      const message = `تنتظر هذه الجلسة اعتماد ${labels[task?.taskType] || 'جلسة'} بتاريخ ${date}.${reason ? ` السبب: ${reason}` : ''}`;
      results.push({
        sessionId: session.sessionId, result: 'invalid_sequence',
        code: 'OFFLINE_PREVIOUS_SESSION_BLOCKING', blockedBySessionId: previous.session.sessionId,
        blockedByDate: date, blockedByTaskType: task?.taskType, message,
        tasks: (Array.isArray(session.tasks) ? session.tasks : []).map(item => ({
          taskId: Number(item.taskId || 0), result: 'invalid_sequence', data: null, message,
        })),
      });
      continue;
    }
    const outcome = await execute(session);
    results.push(outcome);
    if (['invalid_sequence', 'needs_retry', 'server_error', 'conflict', 'rejected_permission'].includes(outcome.result)
      && recitationOutcomeBlocksFollowing(outcome)) {
      const entries = blockedStudents.get(studentId) || [];
      entries.push({ session, outcome });
      blockedStudents.set(studentId, entries);
    }
  }
  return results;
}
