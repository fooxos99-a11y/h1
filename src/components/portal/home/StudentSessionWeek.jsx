import React from 'react';
import StudentPlanDayPoints from '@/components/portal/StudentPlanDayPoints';
import { studentSessionResult } from '@/lib/studentSessionResult';
import { planDayName, planTaskAmount, PLAN_TASK_LABELS } from '@/lib/studentPlan';

const columns = ['memorization', 'review', 'link'];

export default function StudentSessionWeek({ week, today }) {
  return <article className="student-session-week" dir="rtl">
    <header><h3>الأسبوع</h3><span dir="ltr">{week.start} — {week.end}</span></header>
    {week.days.filter(day => day.date <= today).map(day => <section key={day.date} className="student-session-day">
      <header><h4>{day.date === today ? 'اليوم' : planDayName(day.date)}</h4>{day.points && <StudentPlanDayPoints points={day.points} />}</header>
      <div className="student-session-columns">{columns.map(type => <div key={type} className="student-session-track" data-track={type}>
        <h5>{PLAN_TASK_LABELS[type]}</h5>
        <div className="student-session-amounts">{!day.tasks.some(task => task.taskType === type) && <span>—</span>}{day.tasks.filter(task => task.taskType === type && !task.amountHidden).map(task => <p key={task.id}>{planTaskAmount(task) || '—'}</p>)}</div>
        <div className="student-session-results">{day.tasks.filter(task => task.taskType === type).map(task => {
          const result = studentSessionResult(task);
          return <span key={task.id} className="student-session-result" data-tone={result.tone}>{result.label}</span>;
        })}</div>
      </div>)}</div>
    </section>)}
  </article>;
}
