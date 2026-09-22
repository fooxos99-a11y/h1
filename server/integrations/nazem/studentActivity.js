import { transientNazemError } from './errors.js';

export async function readNazemStudentActivity(getPage, studentId) {
  for (let pageNumber = 1; pageNumber <= 50; pageNumber++) {
    const payload = await getPage(`/api/students?page=${pageNumber}`);
    const page = payload?.data;
    if (!Array.isArray(page?.data) || Number(page.current_page) !== pageNumber) {
      throw transientNazemError('تعذر التحقق من حالة الطالب في ناظم.', 'NAZEM_STUDENT_PROFILES_FAILED');
    }
    const student = page.data.find(item => String(item.id) === String(studentId));
    if (student) {
      if (student.status === 0 || student.status === '0' || student.status === false) return 'inactive';
      if (student.status === 1 || student.status === '1' || student.status === true) return 'active';
      return 'unknown';
    }
    if (Number(page.last_page) <= pageNumber) return 'unknown';
  }
  throw transientNazemError('تعذر إكمال التحقق من حالة الطالب في ناظم.', 'NAZEM_STUDENT_PROFILES_FAILED');
}
