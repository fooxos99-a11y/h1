import { parseReviewExecution } from '../../shared/quran-review-cycle.js';

export function needsRecitationPreparation(student) {
  if (!student.rangeChanged || !student.actualEnd || !['memorization', 'review'].includes(student.tasks?.[0]?.taskType)) return false;
  const first = student.tasks[0];
  const last = student.tasks.at(-1);
  const end = first.normalEnd || { surah: last.actualToSurah || last.toSurah, ayah: last.actualToAyah || last.toAyah };
  return Number(end.surah) !== Number(student.actualEnd.surah) || Number(end.ayah) !== Number(student.actualEnd.ayah);
}

export function mergePreparedRecitationTasks(original, prepared, chapters = []) {
  if (!Array.isArray(prepared?.tasks) || !prepared.tasks.length) throw new Error('تعذر تجهيز مقدار التسميع. أعد المحاولة.');
  return prepared.tasks.map(row => {
    const previous = original.find(task => Number(task.id) === Number(row.id)) || original[0];
    const reviewExecution = parseReviewExecution(row.reviewExecution);
    return { ...previous, ...row, reviewExecution, reviewGroupMember: Boolean(row.reviewExecution),
      actualFaces: row.reviewExecution ? Number(reviewExecution?.faces || 0) : previous.actualFaces,
      actualToSurahName: chapters.find(chapter => Number(chapter.number) === Number(row.actualToSurah))?.name,
      ...(row.taskType === 'review' ? { normalEnd: prepared.actualEnd, reviewActualFaces: reviewExecution?.faces || previous.reviewActualFaces } : {}),
    };
  });
}
