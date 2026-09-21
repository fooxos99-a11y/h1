const FAILED_NAZEM_DELIVERY_STATUSES = new Set([
  'failed', 'blocked', 'requires_review', 'conflict',
]);

export function getNazemDeliveryFailure(results = []) {
  return (Array.isArray(results) ? results : []).find((result) => (
    FAILED_NAZEM_DELIVERY_STATUSES.has(result?.syncStatus)
  )) || null;
}
