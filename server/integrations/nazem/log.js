import { nazemErrorDiagnostics } from './errorDiagnostics.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

const logSignature = (row) => [
  row.jobId,
  row.status,
  Number(row.attemptNumber || 0),
  row.errorCode || '',
  row.message || '',
].join('|');

export function buildNazemLogEntries(activeRows = [], eventRows = [], limit = 500) {
  const currentSignatures = new Set(activeRows.map(logSignature));
  const historyRows = eventRows.filter((row) => !currentSignatures.has(logSignature(row)));
  const count = Math.max(0, Number(limit || 0));
  // Recent history must never evict an older unresolved current operation.
  const current = activeRows.slice(0, count);
  return [...current, ...historyRows.slice(0, Math.max(0, count - current.length))]
    .map(({ metadata, ...row }) => ({
      ...row,
      ...(metadata ? { diagnostics: nazemErrorDiagnostics({ details: parse(metadata)?.diagnostics }) } : {}),
      attemptNumber: Math.max(0, Number(row.attemptNumber || 0)),
      ...(row.alreadyRecorded != null ? { alreadyRecorded: row.alreadyRecorded === true || String(row.alreadyRecorded) === 'true' } : {}),
      ...(row.authoritative != null ? { authoritative: row.authoritative === true || String(row.authoritative) === 'true' } : {}),
      ...(row.latePending != null ? { latePending: row.latePending === true || String(row.latePending) === 'true' } : {}),
    }))
    .sort((first, second) => String(second.createdAt || '').localeCompare(String(first.createdAt || '')))
    .slice(0, count);
}
