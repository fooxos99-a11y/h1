const hasRemoteReceipt = (value) => {
  try {
    const receipt = typeof value === 'string' ? JSON.parse(value) : value;
    return Boolean(receipt && (receipt.externalId || receipt.id));
  } catch { return false; }
};

export async function loadRecitationDeliveryReceipts(connection, teacherId, date) {
  const [rows] = await connection.query(`SELECT a.task_id AS taskId, t.student_id AS studentId,
      s.name AS studentName, t.task_type AS taskType, t.track,
      EXISTS (SELECT 1 FROM nazem_plan_links p WHERE p.ruwasi_plan_id = t.plan_id
        AND p.ruwasi_student_id = t.student_id AND p.teacher_id = a.evaluator_id
        AND p.sync_status NOT IN ('deleted', 'detached')) AS nazemManaged,
      DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
      r.id AS linkId, r.sync_status AS syncStatus, r.last_synced_at AS confirmedAt,
      r.last_error AS error, r.remote_snapshot AS remoteSnapshot,
      JSON_UNQUOTE(JSON_EXTRACT(d.local_snapshot, '$.importedFromNazem')) AS importedFromNazem
    FROM student_quran_recitation_attempts a
    JOIN student_quran_tasks t ON t.id = a.task_id
    JOIN students s ON s.id = t.student_id
    LEFT JOIN nazem_recitation_links r ON r.ruwasi_recitation_id = a.id AND r.teacher_id = ?
    LEFT JOIN nazem_daily_follow_up_links d ON d.id = r.daily_follow_up_id
    WHERE a.evaluator_id = ? AND a.session_date = ? AND a.is_official = 1
      AND EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id)
    ORDER BY s.name, t.task_date, a.id DESC`, [teacherId, teacherId, date, teacherId]);
  return rows.map(({ remoteSnapshot, importedFromNazem, linkId, syncStatus, confirmedAt, nazemManaged, ...row }) => { const _resolveStatus = () => {
                                                                                                                        if (!linkId) {
                                                                                                                          if (Number(nazemManaged)) {
                                                                                                                            return 'nazem_pending';
                                                                                                                          }
                                                                                                                          return 'server_saved';
                                                                                                                        }
                                                                                                                        if (['failed', 'blocked', 'requires_review', 'conflict'].includes(syncStatus)) {
                                                                                                                          return 'nazem_failed';
                                                                                                                        }
                                                                                                                        if (syncStatus === 'synced' && confirmedAt && hasRemoteReceipt(remoteSnapshot)) {
                                                                                                                          if (String(importedFromNazem) === 'true') {
                                                                                                                            return 'nazem_adopted';
                                                                                                                          }
                                                                                                                          return 'nazem_confirmed';
                                                                                                                        }
                                                                                                                        return 'nazem_pending';
                                                                                                                      };
                                                                                                                      return ({
    ...row,
    status: _resolveStatus(),
  }); });
}
