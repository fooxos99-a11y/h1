import express from 'express';
import { confirmedRecitationJobSql } from '../integrations/nazem/confirmedRecitationJobs.js';

export const retryEligibilitySql = `job.operation_type = 'recitation.submit'
  AND job.status IN ('pending','retrying','failed','syncing')
  AND NOT (${confirmedRecitationJobSql})
  AND (job.status <> 'syncing' OR job.lease_expires_at < NOW(3))
  AND TIMESTAMPDIFF(SECOND, COALESCE(
    STR_TO_DATE(JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.teacherRetryRequestedAt')), '%Y-%m-%d %H:%i:%s'),
    job.created_at), NOW()) >= 1800
  AND EXISTS (SELECT 1 FROM students student JOIN supervisor_committees scope ON scope.committee_id = student.committee_id
    WHERE student.id = job.student_id AND scope.supervisor_id = job.teacher_id)`;

export default function createTeacherRecitationRetriesRouter({ db }) {
  const router = express.Router({ mergeParams: true });
  router.use((req, res, next) => {
    if (req.auth?.role !== 'supervisor' || Number(req.auth.id) !== Number(req.params.supervisorId)) {
      return res.status(403).json({ message: 'لا تملك صلاحية إعادة إرسال تسميع هذا المعلم.' });
    }
    next();
  });
  router.get('/', async (req, res, next) => {
    try {
      const [rows] = await db().query(`SELECT job.id, job.student_id AS studentId, student.name AS studentName,
        JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.taskType')) AS taskType,
        JSON_UNQUOTE(JSON_EXTRACT(job.payload_json, '$.track')) AS track,
        COALESCE((SELECT event.message FROM nazem_sync_events event WHERE event.job_id = job.id
          AND event.error_code IS NOT NULL AND event.message IS NOT NULL
          ORDER BY event.created_at, event.id LIMIT 1), job.last_error,
          'لم يصل تأكيد الإرسال من ناظم خلال 30 دقيقة.') AS firstFailureReason
        FROM nazem_sync_jobs job JOIN students student ON student.id = job.student_id
        WHERE job.teacher_id = ? AND ${retryEligibilitySql} ORDER BY job.created_at, job.id LIMIT 100`, [req.auth.id]);
      res.json(rows);
    } catch (error) { next(error); }
  });
  router.post('/:jobId', async (req, res, next) => {
    try {
      const [result] = await db().query(`UPDATE nazem_sync_jobs job SET status = 'pending', attempt_count = 0,
        next_attempt_at = NOW(3), lease_owner = NULL, lease_expires_at = NULL, last_heartbeat_at = NULL,
        payload_json = JSON_SET(COALESCE(payload_json, JSON_OBJECT()), '$.teacherRetryRequestedAt', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'))
        WHERE job.id = ? AND job.teacher_id = ? AND ${retryEligibilitySql}`, [req.params.jobId, req.auth.id]);
      if (!result.affectedRows) return res.status(409).json({ message: 'تغيّرت حالة الإرسال أو لم تمر 30 دقيقة؛ حدّث القائمة.' });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  return router;
}
