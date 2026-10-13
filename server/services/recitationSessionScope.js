import { localRecitationScopeError } from '../../shared/recitation-session-scope.js';

export function assertLocalRecitationScope(task, date, compensation, allowed) {
  const error = localRecitationScopeError(task, date, compensation, allowed);
  if (error) throw Object.assign(new Error(error.message), { statusCode: error.statusCode });
}

// Only a managed remote identity can supersede another day's identical local range.
export function managedRecitationIdentitySql(alias) {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid recitation table alias');
  return `EXISTS (SELECT 1 FROM nazem_plan_links historicalManagedPlan
    WHERE historicalManagedPlan.ruwasi_plan_id = ${alias}.plan_id
      AND historicalManagedPlan.sync_status NOT IN ('deleted','detached'))`;
}
