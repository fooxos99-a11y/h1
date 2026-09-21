import { buildPlanMushafTarget, planCompactAmount } from './studentPlan.js';

export const HOME_TASK_TYPES = ['memorization', 'review', 'link'];
export function studentHomePlan(today, date, executionEnabled = true) {
  if (!today || today.date !== date) return { groups: [], percent: 0 };
  const tasks = (today.todayAmounts || today.tasks || []).filter((task) => HOME_TASK_TYPES.includes(task.taskType));
  const done = (task) => (executionEnabled && task.studentStatus === 'done') || task.teacherCompleted === true || task.teacherCompleted === 1;
  const labels = { memorization: today.plan?.track === 'mastery' ? 'الإتقان' : 'الحفظ', review: 'المراجعة', link: 'الربط' };
  return {
    percent: tasks.length ? Math.round(tasks.filter(done).length / tasks.length * 100) : 0,
    groups: HOME_TASK_TYPES.flatMap((type) => {
      const rows = tasks.filter((task) => task.taskType === type);
      return rows.length ? [{ type, label: labels[type], complete: rows.every(done),
        amount: rows.map(planCompactAmount).filter(Boolean).join('، '), target: buildPlanMushafTarget(rows, labels[type]) }] : [];
    }),
  };
}

export function studentJourneySummary(journey) {
  if (!journey) return null;
  const points = Math.max(0, Number(journey.points || 0));
  const total = Math.max(0, Number(journey.totalKilometers || 0));
  const stages = [...(journey.stages || [])].sort((a, b) => Number(a.points) - Number(b.points));
  const next = stages.find((stage) => Number(stage.points) > points);
  const kilometers = total ? Math.min(total, points) : points;
  return { points, kilometers, total, next, percent: total ? Math.min(100, points / total * 100) : 0 };
}

export function studentHomeFeatures(settings, siteFeatures = {}, { showPath, showDailyChallenge } = {}) {
  return {
    store: siteFeatures.store !== false && Boolean(settings?.storeEnabled && settings?.pointsSystemEnabled),
    programs: Boolean(settings?.learningPathsEnabled),
    journey: Boolean(showPath),
    challenge: Boolean(showDailyChallenge),
    sessions: true,
    mushaf: true,
    calls: true,
  };
}
