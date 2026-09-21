import React from 'react';
import { User } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import StudentPlanDayPoints from '@/components/portal/StudentPlanDayPoints';
import { studentSessionResult } from '@/lib/studentSessionResult';
import { planTaskAmount } from '@/lib/studentPlan';

const tracks = [
  ['memorization', 'الحفظ', task => task.taskType === 'memorization' && task.track !== 'mastery'],
  ['review', 'المراجعة', task => task.taskType === 'review'],
  ['link', 'الربط', task => task.taskType === 'link'],
  ['mastery', 'الإتقان', task => task.track === 'mastery' && task.taskType === 'memorization'],
];

export default function TeacherSessionCard({ day, studentName }) {
  return <Card className="min-w-0 rounded-2xl border-border bg-card [font-family:var(--font-ui)]" dir="rtl" data-teacher-session>
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 p-4 space-y-0">
      <div className="flex min-w-0 items-center gap-2"><User className="h-9 w-9 shrink-0 rounded-xl bg-primary/5 p-2 text-primary" /><div className="min-w-0"><h3 className="break-words text-sm font-bold">{studentName}</h3><time className="text-xs text-muted-foreground" dir="ltr">{day.date}</time></div></div>
      <StudentPlanDayPoints points={day.points} />
    </CardHeader>
    <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
      {tracks.map(([key, label, matches]) => <section key={key} className="min-w-0 rounded-xl bg-muted/40 p-3">
        <h4 className="mb-2 text-xs font-bold text-primary">{label}</h4>
        <div className="space-y-3">{day.tasks.some(matches) ? day.tasks.filter(matches).map(task => {
          const result = studentSessionResult(task);
          return <div key={task.id} className="space-y-2 text-xs leading-6"><p className="break-words text-muted-foreground">{planTaskAmount(task) || '—'}</p><p className="font-bold" data-tone={result.tone}>{result.label}</p></div>;
        }) : <span className="text-xs text-muted-foreground">—</span>}</div>
      </section>)}
    </CardContent>
  </Card>;
}
