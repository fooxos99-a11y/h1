import { buildRecitationSegmentDetails, getQuranVerseLine } from './recitationSegments.js';
import { calculateSegmentedPlanPoints } from './quranPlanProgress.js';
import { calculateEvaluatedGroupReward } from './recitationRewards.js';

// Read-only estimates. Historical plan settings and source evidence must be
// verified before a correction is approved; never infer a flat 20-point reward.
export async function auditDescendingRewards(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = [row.studentId, row.planId, row.taskDate, row.track].join(':');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const results = [];
  for (const tasks of groups.values()) {
    tasks.sort((a, b) => Number(b.fromSurah) - Number(a.fromSurah) || Number(a.fromAyah) - Number(b.fromAyah));
    const first = tasks[0], last = tasks.at(-1);
    const start = { surah: Number(first.fromSurah), ayah: Number(first.fromAyah) };
    const end = { surah: Number(last.actualToSurah || last.toSurah), ayah: Number(last.actualToAyah || last.toAyah) };
    if (start.surah <= end.surah) continue;
    const recorded = tasks.reduce((sum, task) => sum + Number(task.points || 0), 0);
    if (recorded <= 0) continue;
    const result = { studentId: first.studentId, studentName: first.studentName, planId: first.planId,
      date: first.taskDate, track: first.track, taskIds: tasks.map(task => task.id), start, end, recorded,
      status: 'requires_review', proposedDeduction: null };
    const from = getQuranVerseLine(start), to = getQuranVerseLine(end);
    const dailyAmount = Number(first.dailyPages);
    if (!from || !to || !(dailyAmount > 0) || tasks.some(task => !task.evaluatedAt || Number(task.teacherCompleted) !== 1)) {
      results.push({ ...result, reason: 'بيانات المقدار أو الاعتماد غير مكتملة' }); continue;
    }
    const scheduledEnd = { surah: Number(last.toSurah), ayah: Number(last.toAyah) };
    if (end.surah !== scheduledEnd.surah || end.ayah !== scheduledEnd.ayah) {
      results.push({ ...result, reason: 'تنفيذ جزئي أو زائد يحتاج مراجعة تقسيم الاستحقاق' }); continue;
    }
    const segments = await buildRecitationSegmentDetails(null,
      { actualStart: start, normalEnd: end, scheduledEnd: end, direction: -1 }, end,
      { allowQuranCompensation: false, allowQuranExtra: false });
    const basePoints = calculateEvaluatedGroupReward(tasks);
    const legacyLines = Math.abs(((to.endPage - 1) * 15 + to.endLine) - ((from.startPage - 1) * 15 + from.startLine)) + 1;
    const legacyAmount = Number((legacyLines / 15).toFixed(2));
    const legacyPoints = calculateSegmentedPlanPoints({ basePoints, dailyAmount, segments: [{ type: 'normal', amount: legacyAmount }] }).total;
    const correctedPoints = calculateSegmentedPlanPoints({ basePoints, dailyAmount, segments }).total;
    const ledgerPoints = tasks.reduce((sum, task) => sum + Number(task.ledgerPoints || 0), 0);
    const reproducible = recorded === legacyPoints && ledgerPoints === recorded && correctedPoints < recorded;
    results.push({ ...result, basePoints, dailyAmount, legacyAmount, correctedAmount: segments[0]?.amount,
      legacyPoints, correctedPoints, ledgerPoints,
      proposedDeduction: reproducible ? recorded - correctedPoints : null,
      reason: reproducible ? 'الحساب القديم مطابق؛ يلزم تأكيد إعداد الخطة وقت الاعتماد قبل الخصم'
        : 'السجل لا يطابق إعادة إنتاج الحساب القديم؛ لا خصم تلقائي' });
  }
  return results;
}
