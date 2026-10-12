/** Only plan owners of students in this reciter's assigned committees. */
export async function loadReciterNazemScope(connection, accountId) {
  const [rows] = await connection.query(`SELECT DISTINCT p.teacher_id AS teacherId, s.id AS studentId
    FROM students s
    JOIN supervisor_committees sc ON sc.committee_id = s.committee_id AND sc.supervisor_id = ?
    JOIN student_quran_plans plan ON plan.student_id = s.id AND plan.status = 'active'
    JOIN nazem_plan_links p ON p.ruwasi_student_id = s.id AND p.ruwasi_plan_id = plan.id
      AND p.sync_status NOT IN ('deleted','detached')
    JOIN nazem_accounts a ON a.teacher_id = p.teacher_id AND a.status = 'connected'
    JOIN nazem_student_links roster ON roster.teacher_id = p.teacher_id AND roster.ruwasi_student_id = s.id
      AND roster.status = 'linked' AND roster.roster_active <> 0`, [accountId]);
  return {
    teacherIds: [...new Set(rows.map((row) => Number(row.teacherId)))],
    teacherByStudent: new Map(rows.map((row) => [Number(row.studentId), Number(row.teacherId)])),
  };
}
