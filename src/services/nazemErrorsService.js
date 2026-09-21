import { limitedTaskQueue } from '../lib/asyncRequests.js';

export async function loadNazemErrors(api, { isActive = () => true, onConflictError = () => {} } = {}) {
  const [accounts, conflicts] = await Promise.all([
    api.getAccounts(),
    api.getConflicts().catch(error => { onConflictError(error); return []; }),
  ]);
  const loadIssues = limitedTaskQueue(async account => {
    if (!isActive()) return null;
    try {
      const data = await api.getAccountIssues(account.teacherId);
      return data.accountIssue || data.studentIssues.length || ['failed', 'blocked', 'requires_review'].includes(account.status)
        ? { account, data } : null;
    } catch (error) {
      return { account, error: error.message || 'تعذر تحميل أخطاء المعلم.' };
    }
  }, account => account.teacherId, 4);
  const rows = await Promise.all(accounts.filter(account => account.status).map(loadIssues));
  return { rows: rows.filter(Boolean), conflicts };
}
