import { compareRecitationSessions, OFFLINE_RECITATION_MAX_BATCH } from '../../shared/offline-recitation.js';

export async function processRecitationSessionBatch(input, execute) {
  const sessions = (Array.isArray(input) ? input : [])
    .slice(0, OFFLINE_RECITATION_MAX_BATCH).sort(compareRecitationSessions);
  const results = [];
  const blockedStudents = new Map();
  for (const session of sessions) {
    const studentId = Number(session.studentId || 0);
    const previous = blockedStudents.get(studentId);
    if (previous) {
      const reason = previous.tasks?.find(item => item.message)?.message || previous.message;
      const message = `تنتظر هذه الجلسة اعتماد جلسة سابقة للطالب نفسه.${reason ? ` السبب: ${reason}` : ''}`;
      results.push({
        sessionId: session.sessionId, result: 'invalid_sequence',
        code: 'OFFLINE_PREVIOUS_SESSION_BLOCKING', blockedBySessionId: previous.sessionId, message,
        tasks: (Array.isArray(session.tasks) ? session.tasks : []).map(item => ({
          taskId: Number(item.taskId || 0), result: 'invalid_sequence', data: null, message,
        })),
      });
      continue;
    }
    const outcome = await execute(session);
    results.push(outcome);
    if (['invalid_sequence', 'needs_retry', 'server_error'].includes(outcome.result)) {
      blockedStudents.set(studentId, outcome);
    }
  }
  return results;
}
