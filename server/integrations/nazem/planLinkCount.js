import { readNazemLinkCount } from '../../../shared/nazem-recitation-policy.js';

export async function loadNazemPlanLinkCount(connection, { planId, studentId, teacherId }) {
  const [[row]] = await connection.query(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(remote_snapshot, '$.primary.linkCount')) AS expectedCount
     FROM nazem_plan_links WHERE ruwasi_plan_id = ? AND ruwasi_student_id = ? AND teacher_id = ?
       AND sync_status NOT IN ('deleted','detached') LIMIT 1`, [planId, studentId, teacherId],
  );
  return readNazemLinkCount(row?.expectedCount);
}
