import { isNazemExternalStudentId } from '../../../shared/nazem-integration.js';

export function normalizeVerifiedNazemRoster(profiles) {
  if (!Array.isArray(profiles)) throw new Error('Incomplete Nazem roster');
  const ids = new Set();
  return profiles.map(profile => {
    const id = String(profile.id || '');
    if (!isNazemExternalStudentId(id) || ids.has(id)) throw new Error('Invalid Nazem roster identity');
    ids.add(id);
    const status = String(profile.statusName || '').trim();
    let active = null;
    if (status === 'مستمر') active = 1;
    if (status === 'غير مستمر') active = 0;
    return { id, active };
  });
}

export async function refreshNazemRoster(connection, teacherId, adapter) {
  // getStudentProfiles verifies all pages and the total before returning.
  // Never infer removal from a failed request or the add-plan picker.
  const roster = normalizeVerifiedNazemRoster(await adapter.getStudentProfiles());
  await connection.query(`UPDATE nazem_student_links link
    LEFT JOIN JSON_TABLE(?, '$[*]' COLUMNS (
      externalId VARCHAR(190) PATH '$.id', active TINYINT PATH '$.active' NULL ON EMPTY
    )) roster ON roster.externalId = link.nazem_student_id
    SET link.roster_active = CASE WHEN roster.externalId IS NULL THEN 0
      ELSE COALESCE(roster.active, link.roster_active) END,
      link.roster_checked_at = NOW(3)
    WHERE link.teacher_id = ? AND link.status = 'linked'`, [JSON.stringify(roster), teacherId]);
}
