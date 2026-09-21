import { request } from '@/services/studentsApi';

const statusRequestOptions = { timeoutMs: 30_000 };
const terminalImportRefreshStatuses = new Set(['synced', 'failed', 'blocked', 'requires_review', 'dismissed']);
const createAbortError = () => {
  const error = new Error('تم إلغاء جلب بيانات ناظم.');
  error.name = 'AbortError';
  return error;
};
const throwIfAborted = (signal) => {
  if (signal?.aborted) throw createAbortError();
};
const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
  throwIfAborted(signal);
  const timer = window.setTimeout(() => {
    signal?.removeEventListener('abort', abort);
    resolve();
  }, milliseconds);
  const abort = () => {
    window.clearTimeout(timer);
    reject(createAbortError());
  };
  signal?.addEventListener('abort', abort, { once: true });
});

export const nazemIntegrationApi = {
  getReconciliation: (query) => request(`/nazem/reconciliation?${new URLSearchParams(query)}`, statusRequestOptions),
  getConfig: () => request('/nazem/config', statusRequestOptions),
  updateConfig: (enabled) => request('/nazem/config', {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  }),
  getAccounts: () => request('/nazem/accounts', statusRequestOptions),
  getAccountIssues: (teacherId) => request(`/nazem/accounts/${teacherId}/issues`),
  retryStudentDiscovery: (teacherId, studentExternalId) => request(
    `/nazem/accounts/${teacherId}/issues/${encodeURIComponent(studentExternalId)}/retry`,
    { method: 'POST' },
  ),
  linkAccount: (teacherId, credentials) => request(`/nazem/accounts/${teacherId}/link`, {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),
  confirmAccountIdentity: (teacherId, identity) => request(`/nazem/accounts/${teacherId}/confirm-identity`, {
    method: 'POST',
    body: JSON.stringify(identity),
  }),
  unlinkAccount: (teacherId) => request(`/nazem/accounts/${teacherId}`, { method: 'DELETE' }),
  getStudentLinks: (teacherId) => request(`/nazem/accounts/${teacherId}/students`),
  getImportPreview: (teacherId, committeeId = '', options = {}) => request(
    `/nazem/accounts/${teacherId}/import-preview${committeeId ? `?committeeId=${encodeURIComponent(committeeId)}` : ''}`,
    options,
  ),
  refreshImportData: (teacherId, options = {}) => request(`/nazem/accounts/${teacherId}/refresh-import`, {
    ...options,
    method: 'POST',
  }),
  getImportRefreshStatus: (teacherId, jobId, options = {}) => request(
    `/nazem/accounts/${teacherId}/refresh-import/${encodeURIComponent(jobId)}`,
    options,
  ),
  prepareImportData: async (teacherId, {
    attempts = 300,
    intervalMs = 2_000,
    onProgress = () => {},
    signal,
  } = {}) => {
    throwIfAborted(signal);
    const started = await nazemIntegrationApi.refreshImportData(teacherId, { signal });
    onProgress(0);
    let latest = { status: started.status };
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      throwIfAborted(signal);
      latest = await nazemIntegrationApi.getImportRefreshStatus(teacherId, started.jobId, { signal });
      onProgress(Number(latest.progressPercent || 0));
      if (terminalImportRefreshStatuses.has(latest.status)) break;
      await wait(intervalMs, signal);
    }
    if (latest.status !== 'synced' && terminalImportRefreshStatuses.has(latest.status)) {
      throw new Error(latest.lastError || 'تعذر جلب الطلاب والخطط كاملة من ناظم.');
    }
    if (latest.status !== 'synced') {
      throw new Error('استغرق جلب بيانات ناظم وقتًا أطول من المتوقع. حاول مرة أخرى.');
    }
    onProgress(100);
    const [initialPreview, conflicts] = await Promise.all([
      nazemIntegrationApi.getImportPreview(teacherId, '', { signal }),
      nazemIntegrationApi.getConflicts(teacherId, { signal }),
    ]);
    const recommendedCommitteeId = initialPreview.recommendedCommitteeId;
    const preview = recommendedCommitteeId
      ? await nazemIntegrationApi.getImportPreview(teacherId, recommendedCommitteeId, { signal })
      : initialPreview;
    const firstCircle = preview.candidates[0];
    return {
      preview,
      conflicts: conflicts.filter((row) => row.entityType === 'plan'),
      refreshResult: latest.result || null,
      mode: recommendedCommitteeId ? 'existing' : 'new',
      committeeId: recommendedCommitteeId ? String(recommendedCommitteeId) : '',
      newCommitteeName: firstCircle?.circleName || preview.suggestedNewCommitteeName || '',
    };
  },
  importStudentsAndPlans: (teacherId, payload) => request(`/nazem/accounts/${teacherId}/import`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  matchStudent: (teacherId, studentId, candidateId) => request(`/nazem/accounts/${teacherId}/students/${studentId}`, {
    method: 'PUT',
    body: JSON.stringify({ candidateId }),
  }),
  getDiscoveredPlans: (teacherId) => request(`/nazem/accounts/${teacherId}/plans`),
  importDiscoveredPlan: (teacherId, candidateId) => request(`/nazem/accounts/${teacherId}/plans/${candidateId}/import`, {
    method: 'POST',
  }),
  importDiscoveredPlansBulk: (teacherId, candidateIds) => request(`/nazem/accounts/${teacherId}/plans/import-bulk`, {
    method: 'POST',
    body: JSON.stringify({ candidateIds }),
  }),
  importReadyPlans: () => request('/nazem/plans/import-ready', { method: 'POST' }),
  ignoreDiscoveredPlan: (teacherId, candidateId) => request(`/nazem/accounts/${teacherId}/plans/${candidateId}/ignore`, {
    method: 'POST',
  }),
  getJobs: (status = '') => request(`/nazem/jobs${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  getLog: () => request('/nazem/log'),
  retryJob: (jobId) => request(`/nazem/jobs/${jobId}/retry`, { method: 'POST' }),
  dismissJob: (jobId) => request(`/nazem/jobs/${jobId}/dismiss`, { method: 'POST' }),
  getConflicts: (teacherId = '', options = {}) => request(
    `/nazem/conflicts${teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : ''}`,
    options,
  ),
  resolveConflict: (conflictId, resolution) => request(`/nazem/conflicts/${conflictId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolution }),
  }),
  getPlanStatuses: (studentId = '') => request(`/nazem/plan-statuses${studentId ? `?studentId=${studentId}` : ''}`),
  getDailyStatuses: (date = '') => request(`/nazem/daily-statuses${date ? `?date=${encodeURIComponent(date)}` : ''}`),
};
