const terminalStatuses = new Set(['synced', 'failed', 'blocked', 'requires_review', 'dismissed']);

export async function refreshNazemAccounts(accounts, { api, signal, onUpdate, pause }) {
  const rows = [...new Map(accounts.filter((account) => account.status === 'connected')
    .map((account) => [account.teacherId, {
      teacherId: account.teacherId, teacherName: account.teacherName, status: 'pending', progressPercent: 0,
    }])).values()];
  const publish = () => onUpdate(rows.map((row) => ({ ...row })));
  const checkAbort = () => signal?.throwIfAborted();
  publish();
  for (const row of rows) {
    checkAbort();
    try {
      const job = await api.refreshImportData(row.teacherId, { signal });
      Object.assign(row, { jobId: job.jobId, status: job.status });
    } catch (error) {
      checkAbort();
      Object.assign(row, { status: 'failed', lastError: error.message });
    }
    publish();
  }
  while (rows.some((row) => row.jobId && !terminalStatuses.has(row.status))) {
    for (const row of rows.filter((item) => item.jobId && !terminalStatuses.has(item.status))) {
      checkAbort();
      try {
        const result = await api.getImportRefreshStatus(row.teacherId, row.jobId, { signal });
        Object.assign(row, result, { lastError: result.lastError || '' });
      } catch (error) {
        checkAbort();
        // A failed status request does not mean the server job failed.
        row.lastError = error.message;
      }
      publish();
    }
    if (rows.some((row) => row.jobId && !terminalStatuses.has(row.status))) await pause(signal);
  }
  return rows;
}
