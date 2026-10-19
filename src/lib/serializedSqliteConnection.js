// A native connection is shared by drafts, cache writes, and background sync.
// Keep each complete native operation exclusive, including reads during writes.
const wrappers = new WeakMap();

export function serializedSqliteConnection(connection) {
  if (wrappers.has(connection)) return wrappers.get(connection);
  let tail = Promise.resolve();
  const enqueue = (method, args) => {
    const result = tail.then(() => connection[method](...args));
    // The caller receives the failure; later operations must still be runnable.
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const wrapper = {
    run: (...args) => enqueue('run', args),
    query: (...args) => enqueue('query', args),
    executeSet: (...args) => enqueue('executeSet', args),
  };
  wrappers.set(connection, wrapper);
  return wrapper;
}
