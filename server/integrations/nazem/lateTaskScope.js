import { getBusinessDate } from '../../../shared/business-date.js';

export function buildNazemLateTaskExistsSql(taskAlias = 't', { includePending = true } = {}) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(taskAlias)) throw new Error('Invalid task alias');
  return `EXISTS (
    SELECT 1 FROM nazem_daily_follow_up_links lateDay
    WHERE lateDay.ruwasi_plan_id = ${taskAlias}.plan_id
      AND lateDay.ruwasi_student_id = ${taskAlias}.student_id
      AND lateDay.follow_up_date = ${taskAlias}.task_date
      AND lateDay.track = IF(${taskAlias}.task_type = 'memorization', ${taskAlias}.track, 'memorization')
      AND lateDay.task_type = CASE WHEN ${taskAlias}.task_type = 'link' THEN 'memorization' ELSE ${taskAlias}.task_type END
      AND (LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(lateDay.remote_snapshot, '$.nazemLate')), 'false')) = 'true'
        ${includePending ? "OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(lateDay.remote_snapshot, '$.nazemPendingDay')), 'false')) = 'true'" : ''})
      AND JSON_UNQUOTE(JSON_EXTRACT(lateDay.remote_snapshot, '$.nazemLateAvailableOn')) = '${getBusinessDate()}'
  )`;
}
