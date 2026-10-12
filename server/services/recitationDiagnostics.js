/** Log internal failure metadata without payloads, SQL, messages, or credentials. */
export function logRecitationFailure(error, requestId, phase, write = console.error) {
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
    ? error.code : 'SERVER_ERROR';
  const location = typeof error?.stack === 'string'
    ? error.stack.match(/(?:\/|\\)(server(?:\/|\\)[\w./\\-]+\.js:\d+:\d+)/)?.[1]?.replaceAll('\\', '/')
    : undefined;
  write(JSON.stringify({
    event: 'recitation_error',
    requestId: typeof requestId === 'string' && /^[\w-]{1,100}$/.test(requestId) ? requestId : undefined,
    phase: phase === 'task' ? 'task' : 'session',
    code,
    ...(location ? { location } : {}),
  }));
}
