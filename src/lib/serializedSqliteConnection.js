// A native connection is shared by drafts, cache writes, and background sync.
// Keep each complete native operation exclusive, including reads during writes.
export function serializedSqliteConnection(connection) {
  let tail = Promise.resolve();
  const enqueue = (method, args) => {
    const result = tail.then(() => connection[method](...args));
    // The caller receives the failure; later operations must still be runnable.
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  return {
    run: (...args) => enqueue('run', args),
    query: (...args) => enqueue('query', args),
    executeSet: (...args) => enqueue('executeSet', args),
  };
}
