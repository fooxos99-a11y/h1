import { isNazemExternalStudentId } from '../../../shared/nazem-integration.js';

// Plan membership is authoritative even when the add-plan picker omits an assigned student.
export function includeNazemPlanStudents(students, members, group) {
  const result = new Map(students.map(student => [String(student.externalId), student]));
  for (const member of members || []) {
    const id = String(member?.student_id || '');
    const name = String(member?.student_name || '').trim();
    if (!isNazemExternalStudentId(id) || !name || result.has(id)) continue;
    result.set(id, { externalId: id, name,
      organization: { id: null, name: group.organizationName || null },
      circle: { id: null, name: group.circleName || null } });
  }
  return [...result.values()];
}
