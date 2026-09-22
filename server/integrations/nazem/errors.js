class NazemIntegrationError extends Error {
  constructor(message, {
    code = 'NAZEM_ERROR',
    retryable = false,
    status = 'failed',
    cause,
    details = null,
  } = {}) {
    super(message, { cause });
    this.name = 'NazemIntegrationError';
    this.code = code;
    this.retryable = retryable;
    this.syncStatus = status;
    this.details = details;
  }
}

export const transientNazemError = (message, code = 'NAZEM_TRANSIENT', cause = undefined) => (
  new NazemIntegrationError(message, { code, retryable: true, status: 'retrying', cause })
);

export const blockedNazemError = (message, code = 'NAZEM_BLOCKED') => (
  new NazemIntegrationError(message, { code, retryable: false, status: 'blocked' })
);

export const reviewNazemError = (message, code = 'NAZEM_REQUIRES_REVIEW', cause = undefined) => (
  new NazemIntegrationError(message, { code, retryable: false, status: 'requires_review', cause })
);

export const conflictNazemError = (message, code = 'NAZEM_CONFLICT', details = null) => (
  new NazemIntegrationError(message, {
    code,
    retryable: false,
    status: 'conflict',
    details,
  })
);
