// Persist classifications only. Browser errors can contain credentials, headers or URLs.
export function nazemErrorDiagnostics(error) {
  const message = String(error?.cause?.message || '');
  const httpStatus = Number(message.match(/\bHTTP (\d{3})\b/)?.[1]);
  const networkCode = message.match(/\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/)?.[1];
  const stage = ['session-check', 'login-form', 'login-submit', 'dashboard-ready', 'target-resolution', 'post-write-verification'].includes(error?.details?.stage)
    ? error.details.stage : null;
  return {
    ...(Array.isArray(error?.details?.issues) ? { issues: error.details.issues.slice(0, 100).map(issue => ({
      ...(Number.isSafeInteger(Number(issue.studentId)) && Number(issue.studentId) > 0 ? { studentId: Number(issue.studentId) } : {}),
      ...(/^[A-Z][A-Z0-9_]{0,79}$/.test(issue.code || '') ? { code: issue.code } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(issue.taskDate || '') ? { taskDate: issue.taskDate } : {}),
      ...(['memorization', 'review', 'link'].includes(issue.taskType) ? { taskType: issue.taskType } : {}),
    })).filter(issue => issue.code) } : {}),
    ...(stage ? { stage } : {}),
    ...Object.fromEntries(['expectedRecordId', 'observedRecordId'].filter(key => /^\d+$/.test(String(error?.details?.[key] || '')))
      .map(key => [key, String(error.details[key])])),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(error?.details?.taskDate || '') ? { taskDate: error.details.taskDate } : {}),
    ...(httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {}),
    ...(networkCode ? { networkCode } : {}),
    timedOut: /timeout|timed out/i.test(message),
  };
}
