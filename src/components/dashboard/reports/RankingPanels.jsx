import React from 'react';
import { formatStatisticsNumber as formatNumber } from '@/lib/statisticsNumber';
import { MetricTile } from './MetricCard';

const decimalFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', { useGrouping: false, maximumFractionDigits: 1 });
const panelClassName = 'rounded-2xl border border-border bg-card p-5 shadow-[var(--app-shadow)] [font-family:var(--font-ui)]';

const EmptyRanking = () => (
  <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">لا توجد بيانات في هذه الفترة.</p>
);

/** Ranked rows: position, name with a secondary line, and the value that ranks them. */
function RankingList({ rows, columns = false }) {
  return (
    <ol className={`mt-4 grid gap-3 ${columns ? 'sm:grid-cols-2' : ''}`}>
      {rows.map((row, index) => (
        <li key={row.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{formatNumber(index + 1)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{row.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.note}</p>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{row.value}</span>
        </li>
      ))}
    </ol>
  );
}

/** Best students by the points they earned in the period, and best circles by the average points of their students. */
export function RankingPanels({ bestStudents = [], bestCommittees = [], unit = 'نقطة' }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className={`${panelClassName} lg:col-span-2`} aria-label="أفضل الطلاب">
        <h2 className="text-base font-bold">أفضل الطلاب</h2>
        {bestStudents.length ? (
          <RankingList
            columns
            rows={bestStudents.map((row) => ({ id: row.id, name: row.name, note: row.committeeName || 'بدون حلقة', value: `${decimalFormatter.format(row.points)} ${unit}` }))}
          />
        ) : <EmptyRanking />}
      </section>
      <section className={panelClassName} aria-label="أفضل الحلقات">
        <h2 className="text-base font-bold">أفضل الحلقات</h2>
        {bestCommittees.length ? (
          <RankingList
            rows={bestCommittees.map((row) => ({
              id: row.id,
              name: row.name,
              note: `${formatNumber(row.studentsCount)} طالب`,
              value: `${decimalFormatter.format(row.average)} ${unit}`,
            }))}
          />
        ) : <EmptyRanking />}
      </section>
    </div>
  );
}

/** Every teacher with their attendance and achievement (the plan completion of the students in their circles). */
export function TeachersPanel({ teachers = [], color }) {
  return (
    <section className={panelClassName} aria-label="المعلمون">
      <h2 className="text-base font-bold">المعلمون</h2>
      {teachers.length ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teachers.map((teacher) => (
            <li key={teacher.id} className="min-w-0 rounded-xl border border-border p-3">
              <p className="truncate text-sm font-bold">{teacher.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{teacher.committees || 'بدون حلقة'}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MetricTile color={color} tile={{ label: 'الحضور', value: teacher.attendance.percentage, display: `${formatNumber(teacher.attendance.percentage)}%` }} />
                <MetricTile color={color} tile={{ label: 'الإنجاز', value: teacher.achievement.percentage, display: `${formatNumber(teacher.achievement.percentage)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                حضر {formatNumber(teacher.attendance.attended)} من {formatNumber(teacher.attendance.expected)} يوم · تأخر {formatNumber(teacher.attendance.late)}
              </p>
            </li>
          ))}
        </ul>
      ) : <EmptyRanking />}
    </section>
  );
}
