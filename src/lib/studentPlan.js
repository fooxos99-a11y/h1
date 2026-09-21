import { hideStudentTaskAmount, isStudentAmountHidden } from '../../shared/student-amount-visibility.js';
import { getBusinessDate, shiftDateOnly } from '../../shared/business-date.js';
import { formatQuranRangeText } from './quranRangeText.js';

export const PLAN_TASK_TYPES = ['memorization', 'link', 'review'];
export const PLAN_TASK_LABELS = { memorization: 'الحفظ', link: 'الربط', review: 'المراجعة' };
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && getBusinessDate(`${value}T12:00:00Z`) === value;

export const planWeekStart = (date) => shiftDateOnly(date, -new Date(`${date}T12:00:00Z`).getUTCDay());
export const planDayName = (date) => new Intl.DateTimeFormat('ar-SA', { weekday: 'long', timeZone: 'Asia/Riyadh' }).format(new Date(`${date}T12:00:00Z`));
export const planTaskCompleted = (task) => task.teacherCompleted === true || task.teacherCompleted === 1;
export const planTaskAmount = (task) => task.amountHidden ? '' : task.ayahPreview || task.preview || formatQuranRangeText({
  startSurah: task.fromSurah, startSurahName: task.fromSurahName, startAyah: task.fromAyah,
  endSurah: task.toSurah, endSurahName: task.toSurahName, endAyah: task.toAyah,
  startPage: task.fromPage, endPage: task.toPage,
});

export const planCompactAmount = (task) => planTaskAmount(task)
  .replace(/،?\s*من آية\s*/g, ' ')
  .replace(/\s*آية\s*/g, ' ')
  .replace(/\s*إلى\s*/g, '–');

export const planProgressPercent = (plan) => {
  const value = Number(plan?.progressPercent ?? plan?.progress?.progressPercent ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
};

export const buildStudentPlanWeeks = ({ rows = [], todayData = null, points = null, today = getBusinessDate() } = {}) => {
  const tasks = new Map();
  // Today assignments are authoritative only for the date returned by the server.
  for (const task of rows) {
    const date = task.taskDate || task.sessionDate;
    if (validDate(date) && date <= today && PLAN_TASK_TYPES.includes(task.taskType)) tasks.set(`${date}:${task.id}`, { ...task, taskDate: date });
  }
  if (validDate(todayData?.date) && todayData.date <= today) {
    for (const task of todayData.todayAmounts || todayData.tasks || []) {
      if (!PLAN_TASK_TYPES.includes(task.taskType)) continue;
      const key = `${todayData.date}:${task.id}`;
      const existing = tasks.get(key);
      tasks.set(key, { ...task, ...existing, taskDate: todayData.date,
        repeatCount: existing?.repeatCount ?? task.repeatCount ?? todayData.repeatCount,
        listeningCount: existing?.listeningCount ?? task.listeningCount ?? todayData.listeningCount,
      });
    }
  }
  const days = new Map([[today, { date: today, tasks: [] }]]);
  const preview = todayData?.nextDay;
  if (todayData?.date === today && preview?.date === shiftDateOnly(today, 1)) {
    const previewTasks = (preview.tasks || []).filter((task) => PLAN_TASK_TYPES.includes(task.taskType));
    if (previewTasks.length) days.set(preview.date, { date: preview.date, tasks: previewTasks, preview: true });
  }
  for (const task of tasks.values()) {
    if (!days.has(task.taskDate)) days.set(task.taskDate, { date: task.taskDate, tasks: [] });
    days.get(task.taskDate).tasks.push(isStudentAmountHidden(todayData, task.taskType) ? hideStudentTaskAmount(task) : task);
  }
  for (const summary of points?.days || []) {
    if (!validDate(summary.date) || summary.date > today) continue;
    if (!days.has(summary.date)) days.set(summary.date, { date: summary.date, tasks: [] });
    days.get(summary.date).points = summary;
  }
  const weeks = new Map();
  for (const day of [...days.values()].sort((a, b) => b.date.localeCompare(a.date))) {
    day.tasks.sort((a, b) => Number(a.id) - Number(b.id));
    const start = planWeekStart(day.date);
    if (!weeks.has(start)) weeks.set(start, { start, end: shiftDateOnly(start, 6), days: [] });
    weeks.get(start).days.push(day);
  }
  return [...weeks.values()].sort((a, b) => b.start.localeCompare(a.start));
};

export const buildPlanMushafTarget = (tasks, label) => {
  const ranges = tasks.filter((task) => !task.amountHidden && Number(task.fromPage) >= 1 && Number(task.fromPage) <= 604).map((task) => ({
    page: Number(task.fromPage), preview: planTaskAmount(task),
    range: Number(task.fromSurah) > 0 && Number(task.toSurah) > 0 && Number(task.fromAyah) > 0 && Number(task.toAyah) > 0 ? {
      fromSurah: Number(task.fromSurah), fromAyah: Number(task.fromAyah),
      toSurah: Number(task.toSurah), toAyah: Number(task.toAyah),
      direction: Number(task.fromSurah) > Number(task.toSurah) || (Number(task.fromSurah) === Number(task.toSurah) && Number(task.fromAyah) > Number(task.toAyah)) ? -1 : 1,
    } : null,
  }));
  return ranges.length ? { ...ranges[0], label, ranges } : null;
};

export const buildStudentSessionWeeks = (rows = []) => buildStudentPlanWeeks({
  rows: rows.map((row) => ({ ...row, taskDate: row.sessionDate })),
}).map((week) => ({ ...week, days: week.days.filter((day) => day.tasks.length > 0) })).filter((week) => week.days.length > 0);
