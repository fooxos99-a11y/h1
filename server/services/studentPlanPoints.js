import { calculateStudentExecutionPoints } from './quranPoints.js';
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const labels = { attendance: 'الحضور', quran_evaluation: 'التسميع', quran_execution: 'التنفيذ' };

export function buildStudentPlanPoints({ total, rows, transactions, attendance, settings, today }) {
  const days = new Map();
  const dayFor = (date) => {
    if (!days.has(date)) days.set(date, { date, earned: 0, maximum: 0, pending: true, details: [], groups: new Map() });
    return days.get(date);
  };
  for (const row of rows) {
    if (row.taskDate > today) continue;
    const day = dayFor(row.taskDate);
    const key = `${row.taskType}:${row.track}`;
    if (!day.groups.has(key)) day.groups.set(key, []);
    day.groups.get(key).push(row);
    if (row.evaluatedAt) day.pending = false;
  }
  for (const record of attendance) {
    if (record.date > today) continue;
    const day = dayFor(record.date);
    day.pending = false;
  }
  addPointTransactions(transactions, today, dayFor);
  calculateDailyMaximums(days, settings);
  return { total: number(total), days: [...days.values()] };
}

function addPointTransactions(transactions, today, dayFor) {
  for (const row of transactions) {
    if (row.date > today) continue;
    const day = dayFor(row.date);
    const value = row.type === 'deduction' ? -number(row.points) : number(row.points);
    day.earned += value;
    day.pending = false;
    day.details.push({ label: row.reason || labels[row.source] || 'أخرى', earned: value });
    if (!['attendance', 'quran_evaluation', 'quran_execution'].includes(row.source) && value > 0) day.maximum += value;
  }
}

function calculateDailyMaximums(days, settings) {
  for (const day of days.values()) {
    day.maximum += Math.max(0, number(settings.attendancePoints));
    for (const group of day.groups.values()) {
      day.maximum += group.reduce((sum, task) => sum + number(task.pointsMaximum), 0) / group.length;
      if (settings.hasStudentQuranExecution && group[0].taskType === 'memorization') {
        const mastery = group[0].track === 'mastery';
        const repeats = number(mastery ? settings.masteryRepeatCount : settings.memorizationRepeatCount);
        const listening = number(mastery ? settings.masteryListeningCount : settings.memorizationListeningCount);
        day.maximum += calculateStudentExecutionPoints({
          taskType: 'memorization', track: group[0].track,
          completedRepeatCount: repeats, expectedRepeatCount: repeats,
          completedListeningCount: listening, expectedListeningCount: listening, settings
        }).total;
      }
    }
    day.maximum = Math.round(day.maximum);
    delete day.groups;
  }
}
