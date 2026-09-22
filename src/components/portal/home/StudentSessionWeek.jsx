import React from 'react';
import StudentPlanDayPoints from '@/components/portal/StudentPlanDayPoints';
import { studentSessionResult } from '@/lib/studentSessionResult';
import { planDayName, planTaskAmount, PLAN_TASK_LABELS } from '@/lib/studentPlan';

const columns = ['memorization', 'review', 'link'];

export default function StudentSessionWeek({ week, today }) {
  const evaluatedTodayDates = week.days.filter(day => day.date !== today && day.tasks.some(task => String(task.evaluatedAt || '').startsWith(today))).map(day => day.date);
  return <article className="student-session-week" dir="rtl">
    <header><h3>الأسبوع</h3><span dir="ltr">{week.start} — {week.end}</span></header>
    {week.days.filter(day => day.date <= today).map(day => <section key={day.date} className="student-session-day">
      <header><h4>{day.date === today ? 'اليوم' : planDayName(day.date)}</h4>{day.points && <StudentPlanDayPoints points={day.points} />}</header>
      {day.date === today && evaluatedTodayDates.length > 0 && <p className="px-4 pb-3 text-xs text-muted-foreground">تقييم اليوم شمل مهام بتاريخ: {evaluatedTodayDates.map(date => <bdi key={date} className="mx-1">{date}</bdi>)}</p>}
      <div className="student-session-columns">{columns.map(type => <div key={type} className="student-session-track" data-track={type}>
        <h5>{PLAN_TASK_LABELS[type]}</h5>
        <div className="student-session-amounts">{!day.tasks.some(task => task.taskType === type) && <span>—</span>}{day.tasks.filter(task => task.taskType === type && !task.amountHidden).map(task => <p key={task.id}>{planTaskAmount(task) || '—'}</p>)}</div>
        <div className="student-session-results">{day.tasks.filter(task => task.taskType === type).map(task => {
          const result = studentSessionResult(task);
          const evaluatedDate = String(task.evaluatedAt || '').slice(0, 10);
          return <span key={task.id} className="student-session-result" data-tone={result.tone}>{result.label}{evaluatedDate && evaluatedDate !== day.date && <small className="block text-xs font-normal">قُيّم بتاريخ <bdi>{evaluatedDate}</bdi></small>}</span>;
        })}</div>
      </div>)}</div>
    </section>)}
  </article>;
}
