const invalid = (message, status = 422) => Object.assign(new Error(message), { statusCode: status });

/** Validate against the server's authorized roster, never client supplied ranges. */
export function selectNarrationStudents(students, body) {
  if (body.selectionMode === undefined && body.studentSelections === undefined) {
    return students.map((student) => ({ ...student, narrationSelection: null }));
  }
  if (!['full', 'manual'].includes(body.selectionMode) || !Array.isArray(body.studentSelections) || !body.studentSelections.length) {
    throw invalid('اختر طريقة السرد وطلاب يوم السرد.');
  }
  const roster = new Map(students.map((student) => [Number(student.id), student]));
  const selected = new Set();
  return body.studentSelections.map((selection) => {
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) throw invalid('اختيار الطلاب غير صحيح.');
    const studentId = Number(selection.studentId);
    if (!Number.isSafeInteger(studentId) || studentId <= 0 || selected.has(studentId)) throw invalid('اختيار الطلاب غير صحيح.');
    const student = roster.get(studentId);
    if (!student) throw invalid('لا يمكنك إضافة طالب من خارج الحلقات المحددة.', 403);
    selected.add(studentId);
    if (body.selectionMode === 'full') return { ...student, narrationSelected: true, narrationSelection: null };
    const fromPage = Number(selection.fromPage);
    const faces = Number(selection.faces);
    if (!Number.isInteger(fromPage) || !Number.isInteger(faces) || fromPage < 1 || faces < 1 || fromPage + faces - 1 > 604) {
      throw invalid('حدد صفحة البداية وعدد الأوجه ضمن صفحات المصحف.');
    }
    return { ...student, narrationSelected: true, narrationSelection: { fromPage, toPage: fromPage + faces - 1, faces } };
  });
}

export async function manualNarrationRange(selection, readPage) {
  const first = await readPage(selection.fromPage);
  const last = selection.toPage === selection.fromPage ? first : await readPage(selection.toPage);
  if (!first?.start || !last?.end) throw invalid('تعذر تحديد آيات المقدار المختار.');
  return { startPage: first.start.page, startSurah: first.start.surah, startAyah: first.start.ayah,
    endPage: last.end.page, endSurah: last.end.surah, endAyah: last.end.ayah };
}
