export const isTemporaryReadFailure = (error) => (
  error?.name !== 'AbortError'
  && (!error?.status || error.status === 408 || error.status >= 500)
);

export async function retryTemporaryRead(read, { isCurrent = () => true } = {}) {
  try {
    return await read();
  } catch (error) {
    if (!isCurrent() || !isTemporaryReadFailure(error)) throw error;
    return read();
  }
}

export async function withinTimeout(operation, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = globalThis.setTimeout(() => {
          const error = new Error(message);
          error.code = 'LOCAL_STORAGE_TIMEOUT';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    globalThis.clearTimeout(timer);
  }
}
