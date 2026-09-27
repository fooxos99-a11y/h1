import {
  BookOpenCheck, Building2, CalendarCheck2, Coins, GraduationCap, PlusCircle,
} from 'lucide-react';
import { formatStatisticsNumber as formatNumber } from '@/lib/statisticsNumber';

export const METRIC_COLORS = Object.freeze({
  achievement: '#0d9488',
  attendance: '#ea580c',
  studentPoints: '#ca8a04',
  students: '#0891b2',
  committees: '#4f46e5',
  points: '#dc2626',
});

const TONES = Object.freeze({
  good: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  bad: 'bg-destructive/12 text-destructive',
  neutral: 'bg-muted text-foreground',
});

const facesFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', { useGrouping: false, maximumFractionDigits: 2 });
const faces = (value) => facesFormatter.format(Number(value || 0));
const pct = (part, total) => (Number(total) > 0 ? Math.round((Number(part || 0) / Number(total)) * 100) : 0);
const rounded = (value) => Math.round(Number(value || 0));
const percentMetric = (value) => ({ value: rounded(value), display: `${formatNumber(rounded(value))}%` });
const countMetric = (count) => ({ value: Number(count || 0) > 0 ? 100 : 0, countValue: Number(count || 0), display: formatNumber(count) });
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar');
const outOf = (part, total, format = formatNumber) => `${format(part)} من ${format(total)}`;
const gradeTone = (percentage) => {
  if (percentage >= 80) return TONES.good;
  return percentage >= 50 ? TONES.warn : TONES.bad;
};
// Signs and dates stay left-to-right inside Arabic text (LRI … PDI), so +30 is not shown as 30+.
const ltr = (text) => `\u2066${text}\u2069`;
const signed = (value) => ltr(`${Number(value) < 0 ? '-' : '+'}${faces(Math.abs(Number(value || 0)))}`);

/** Small summary cards at the top of a details window: a share (%) or a count. */
const percentTile = (label, value) => ({ label, ...percentMetric(value) });
const countTile = (label, count, format = formatNumber) => ({ label, value: Number(count || 0) > 0 ? 100 : 0, display: format(count) });

const attendedOf = (stats = {}) => Number(stats.present || 0) + Number(stats.late || 0) + Number(stats.excused || 0);
const committeeBars = (committees = [], read) => (committees.length > 1
  ? committees.map((row) => ({ label: row.name, percent: read(row) }))
  : []);

export const ALL_COMMITTEES = 'all';
const sum = (rows, read) => rows.reduce((total, row) => total + Number(read(row) || 0), 0);
const QURAN_KEYS = Object.freeze([
  ['memorization', 'الحفظ'],
  ['mastery', 'الإتقان'],
  ['review', 'المراجعة'],
  ['link', 'الربط'],
]);

/** Students of every circle with their plan indicators (attendance and achieved faces). */
const studentsOf = (overview) => (overview.committeeIndicators || [])
  .flatMap((committee) => (committee.students || []).map((student) => ({ ...student, committeeName: committee.name })));

/** Quran achievement: plan completion, the faces achieved and each student's attendance and faces. */
function achievementMetric(overview, students, filtered) {
  const committees = overview.committeeIndicators || [];
  const quranFaces = filtered
    ? Object.fromEntries(QURAN_KEYS.map(([key]) => [key, sum(students, (student) => student.metrics?.[key]?.done)]))
    : overview.totals?.quranFaces || {};
  const attendance = filtered
    ? { present: sum(students, (student) => student.metrics?.attendance?.done), total: sum(students, (student) => student.metrics?.attendance?.total) }
    : overview.attendance?.students || {};
  const allStudents = studentsOf(overview);
  const facesOf = (metric = {}) => outOf(metric.done, metric.total, faces);
  const rows = [...students]
    .sort((a, b) => Number(b.overallPercentage || 0) - Number(a.overallPercentage || 0) || byName(a, b))
    .map((student) => ({
      label: student.name,
      note: student.committeeName,
      value: `${formatNumber(rounded(student.overallPercentage))}%`,
      tone: gradeTone(Number(student.overallPercentage || 0)),
      stats: [
        { label: 'الحضور', value: outOf(student.metrics?.attendance?.done, student.metrics?.attendance?.total) },
        ...QURAN_KEYS.map(([key, label]) => ({ label, value: facesOf(student.metrics?.[key]) })),
      ],
    }));
  return {
    id: 'achievement',
    label: 'الإنجاز القرآني',
    icon: BookOpenCheck,
    color: METRIC_COLORS.achievement,
    ...percentMetric(allStudents.length ? sum(allStudents, (student) => student.overallPercentage) / allStudents.length : 0),
    tiles: [
      percentTile('الحضور', pct(attendedOf(attendance), attendance.total)),
      ...QURAN_KEYS.map(([key, label]) => countTile(label, quranFaces[key], faces)),
    ],
    bars: [{ title: 'الحلقات', rows: filtered ? [] : committeeBars(committees, (row) => row.overallPercentage) }],
    records: [{ title: 'الطلاب', rows, emptyText: 'لا يوجد طلاب' }],
  };
}

/** Student attendance: the share attended, the statuses and each student's attended days. */
function attendanceMetric(overview, students, filtered) {
  const all = overview.attendance?.students || {};
  const done = filtered ? sum(students, (student) => student.metrics?.attendance?.done) : attendedOf(all);
  const total = filtered ? sum(students, (student) => student.metrics?.attendance?.total) : all.total;
  const tiles = filtered
    ? [countTile('حضر', done), countTile('لم يحضر', Math.max(0, Number(total || 0) - done))]
    : [
      countTile('حاضر', all.present),
      countTile('متأخر', all.late),
      countTile('مستأذن', all.excused),
      countTile('غائب', all.absent),
      countTile('لم يُرصد', all.notRecorded),
    ];
  return {
    id: 'attendance',
    label: 'حضور الطلاب',
    icon: CalendarCheck2,
    color: METRIC_COLORS.attendance,
    ...percentMetric(pct(attendedOf(all), all.total)),
    tiles,
    bars: [{ title: 'الحلقات', rows: filtered ? [] : committeeBars(overview.committeeIndicators || [], (row) => row.metrics?.attendance?.percentage) }],
    records: [{
      title: 'الطلاب',
      rows: [...students]
        .sort((a, b) => Number(b.metrics?.attendance?.percentage || 0) - Number(a.metrics?.attendance?.percentage || 0) || byName(a, b))
        .map((student) => {
          const metric = student.metrics?.attendance || {};
          return {
            label: student.name,
            note: student.committeeName,
            value: outOf(metric.done, metric.total),
            tone: gradeTone(Number(metric.percentage || 0)),
          };
        }),
      emptyText: 'لا يوجد طلاب',
    }],
  };
}

/**
 * Student points by their source: what each source added or deducted in the period,
 * each student's points per source, and every movement with its source.
 */
function studentPointsMetric(list = { loading: true, rows: [] }, inCommittee, unitText) {
  const allStudents = list.rows || [];
  const students = allStudents.filter((row) => inCommittee(row.committeeName));
  const netOf = (rows) => sum(rows, (row) => row.total);
  const transactions = students.flatMap((student) => (student.transactions || []).map((row) => ({ ...row, student })));
  const increases = sum(transactions.filter((row) => row.type !== 'deduction'), (row) => row.points);
  const deductions = sum(transactions.filter((row) => row.type === 'deduction'), (row) => row.points);
  const sources = new Map();
  for (const row of transactions) {
    const source = row.source || 'مصدر غير محدد';
    const current = sources.get(source) || { increase: 0, deduction: 0 };
    current[row.type === 'deduction' ? 'deduction' : 'increase'] += Number(row.points || 0);
    sources.set(source, current);
  }
  const sourceRows = [...sources.entries()]
    .map(([source, totals]) => ({ source, ...totals, net: totals.increase - totals.deduction }))
    .sort((a, b) => (b.increase + b.deduction) - (a.increase + a.deduction));
  const movement = increases + deductions;
  const allIncreases = sum(allStudents.flatMap((row) => row.transactions || []).filter((row) => row.type !== 'deduction'), (row) => row.points);
  const allMovement = sum(allStudents.flatMap((row) => row.transactions || []), (row) => row.points);
  return {
    id: 'studentPoints',
    label: unitText('نقاط الطلاب'),
    icon: Coins,
    color: METRIC_COLORS.studentPoints,
    value: pct(allIncreases, allMovement),
    countValue: netOf(allStudents),
    display: formatNumber(netOf(allStudents)),
    loading: list.loading,
    error: list.error,
    tiles: [
      countTile('الإضافات', increases, faces),
      countTile('الخصومات', deductions, faces),
      countTile('الصافي', increases - deductions, faces),
      countTile('المصادر', sourceRows.length),
    ],
    bars: [{
      title: 'المصادر',
      rows: sourceRows.map((row) => ({
        label: row.source,
        percent: pct(row.increase + row.deduction, movement),
        display: signed(row.net),
      })),
    }],
    records: [
      {
        title: 'الطلاب',
        rows: students
          .filter((student) => (student.transactions || []).length)
          .sort((a, b) => Number(b.total || 0) - Number(a.total || 0) || String(a.studentName || '').localeCompare(String(b.studentName || ''), 'ar'))
          .map((student) => {
            const bySource = new Map();
            for (const row of student.transactions || []) {
              const source = row.source || 'مصدر غير محدد';
              bySource.set(source, (bySource.get(source) || 0) + (row.type === 'deduction' ? -1 : 1) * Number(row.points || 0));
            }
            return {
              label: student.studentName,
              note: student.committeeName || 'بدون حلقة',
              value: signed(student.total),
              tone: Number(student.total || 0) < 0 ? TONES.bad : TONES.good,
              stats: [...bySource.entries()].map(([label, value]) => ({ label, value: signed(value) })),
            };
          }),
        emptyText: 'لا توجد حركات في هذه الفترة',
      },
      {
        title: 'الحركات',
        rows: transactions
          .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
          .map((row) => ({
            label: `${row.student.studentName} · ${row.source || 'مصدر غير محدد'}`,
            note: [row.reason && row.reason !== row.source ? row.reason : '', row.date && ltr(row.date), row.actorName].filter(Boolean).join(' · '),
            value: ltr(`${row.type === 'deduction' ? '-' : '+'}${faces(row.points)}`),
            tone: row.type === 'deduction' ? TONES.bad : TONES.good,
          })),
        emptyText: 'لا توجد حركات في هذه الفترة',
      },
    ],
  };
}

/** Number of students, with the students of each circle as the details. */
function studentsCountMetric(overview, students, filtered) {
  const committees = overview.committeeIndicators || [];
  return {
    id: 'students',
    label: 'عدد الطلاب',
    icon: GraduationCap,
    color: METRIC_COLORS.students,
    ...countMetric(overview.totals?.studentsCount),
    tiles: [
      countTile('الطلاب', filtered ? students.length : overview.totals?.studentsCount),
      countTile('الحلقات', filtered ? 1 : committees.length),
    ],
    bars: [],
    records: [{
      title: 'الطلاب',
      rows: [...students].sort(byName).map((student) => ({ label: student.name, note: student.committeeName })),
      emptyText: 'لا يوجد طلاب',
    }],
  };
}

/** Number of circles, with each circle's students and teachers. */
function committeesCountMetric(overview, inCommittee) {
  const teachersByCommittee = new Map();
  for (const teacher of overview.teachers || []) {
    for (const name of String(teacher.committees || '').split('، ').filter(Boolean)) {
      teachersByCommittee.set(name, [...(teachersByCommittee.get(name) || []), teacher.name]);
    }
  }
  const committees = (overview.committeeIndicators || []).filter((committee) => inCommittee(committee.name));
  return {
    id: 'committees',
    label: 'عدد الحلقات',
    icon: Building2,
    color: METRIC_COLORS.committees,
    ...countMetric(overview.totals?.familiesCount),
    tiles: [
      countTile('الحلقات', committees.length),
      countTile('الطلاب', sum(committees, (committee) => committee.studentsCount)),
    ],
    bars: [],
    records: [{
      title: 'الحلقات',
      rows: [...committees].sort(byName).map((committee) => ({
        label: committee.name,
        note: (teachersByCommittee.get(committee.name) || []).join('، ') || 'بدون معلم',
        value: `${formatNumber(committee.studentsCount)} طالب`,
      })),
      emptyText: 'لا توجد حلقات',
    }],
  };
}

function teacherPointsMetric(list = { loading: true, rows: [] }, inCommittee) {
  const allRows = list.rows || [];
  const allIncreases = allRows.filter((row) => row.type === 'increase').length;
  const rows = allRows.filter((row) => inCommittee(row.committeeName));
  const increases = rows.filter((row) => row.type === 'increase').length;
  return {
    id: 'points',
    label: 'الإضافة والخصم',
    icon: PlusCircle,
    color: METRIC_COLORS.points,
    value: pct(allIncreases, allRows.length),
    countValue: allRows.length,
    display: formatNumber(allRows.length),
    loading: list.loading,
    error: list.error,
    tiles: [
      countTile('إضافة', increases),
      countTile('خصم', rows.length - increases),
    ],
    bars: [],
    records: [{
      title: 'العمليات',
      rows: rows.map((row) => ({
        label: row.studentName,
        note: [row.reason, row.transactionDate && ltr(row.transactionDate), row.teacherName].filter(Boolean).join(' · '),
        value: ltr(`${row.type === 'increase' ? '+' : '-'}${faces(row.points)}`),
        tone: row.type === 'increase' ? TONES.good : TONES.bad,
      })),
    }],
  };
}

/** Circle names that the details window can filter by. */
export const detailCommitteesOf = (overview) => [...new Set((overview?.committeeIndicators || []).map((committee) => committee.name).filter(Boolean))];

/**
 * Every indicator of the statistics page, each with its own summary cards and student details.
 * The card values always cover the whole page scope; `committee` narrows only the details.
 * `lists` holds { studentPoints, teacherPoints } as { rows, loading, error } or undefined.
 */
export function buildReportMetrics(overview, {
  lists = {},
  showStandard = true,
  showStudentPoints = false,
  showTeacherPoints = false,
  committee = ALL_COMMITTEES,
  unitText = (text) => text,
} = {}) {
  const filtered = committee !== ALL_COMMITTEES;
  const inCommittee = (name) => !filtered || name === committee;
  const metrics = [];
  if (showStandard && overview) {
    const students = studentsOf(overview).filter((student) => inCommittee(student.committeeName));
    metrics.push(
      achievementMetric(overview, students, filtered),
      attendanceMetric(overview, students, filtered),
    );
    if (showStudentPoints) metrics.push(studentPointsMetric(lists.studentPoints, inCommittee, unitText));
    metrics.push(
      studentsCountMetric(overview, students, filtered),
      committeesCountMetric(overview, inCommittee),
    );
  }
  if (showTeacherPoints) metrics.push(teacherPointsMetric(lists.teacherPoints, inCommittee));
  return metrics;
}
