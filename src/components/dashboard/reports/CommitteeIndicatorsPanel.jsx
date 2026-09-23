import React, { useMemo } from 'react';
import { ArrowRight, BadgeCheck, BookOpen, CalendarCheck, Link2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { formatStatisticsNumber as formatNumber } from '@/lib/statisticsNumber';

const metricConfig = [
  { key: 'attendance', label: 'الحضور', icon: CalendarCheck, color: '#22c55e' },
  { key: 'review', label: 'المراجعة', icon: RefreshCw, color: '#f59e0b' },
  { key: 'link', label: 'الربط', icon: Link2, color: '#06b6d4' },
  { key: 'memorization', label: 'الحفظ', icon: BookOpen, color: '#14b8a6' },
  { key: 'mastery', label: 'الإتقان', icon: BadgeCheck, color: '#8b5cf6' },
];

const buildConic = (value, color) => {
  const degrees = Math.max(0, Math.min(100, Number(value || 0))) * 3.6;
  return `conic-gradient(${color} 0deg ${degrees}deg, rgba(100,116,139,.32) ${degrees}deg 360deg)`;
};

const MetricGauge = ({ metric, config, compact = false }) => {
  const Icon = config.icon;
  const percentage = Math.max(0, Math.min(100, Number(metric?.percentage || 0)));
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-primary/10 bg-background/60 p-2">
      <div
        className={`relative flex shrink-0 items-center justify-center rounded-full ${compact ? 'h-16 w-16' : 'h-20 w-20'}`}
        style={{ background: buildConic(percentage, config.color) }}
      >
        <div className="absolute inset-2 rounded-full bg-card" />
        <div className="relative flex flex-col items-center leading-none">
          <Icon className="mb-1 h-3.5 w-3.5" style={{ color: config.color }} />
          <span className="text-sm font-black text-foreground">{formatNumber(percentage)}%</span>
        </div>
      </div>
      <div className="w-full text-center">
        <p className="truncate text-xs font-black text-foreground">{config.label}</p>
      </div>
    </div>
  );
};

const MetricsGrid = ({ metrics = {}, compact = false }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
    {metricConfig.map((config) => (
      <MetricGauge key={config.key} metric={metrics[config.key]} config={config} compact={compact} />
    ))}
  </div>
);

const CommitteeCard = ({ committee, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(committee.id)}
    className="w-full rounded-lg border border-primary/15 bg-card/55 p-3 text-right transition hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h5 className="truncate text-base font-black text-foreground">{committee.name}</h5>
        <p className="mt-1 text-xs font-bold text-muted-foreground">{formatNumber(committee.studentsCount)} طالب</p>
      </div>
      <span className="rounded-full border border-primary/15 bg-background px-3 py-1 text-xs font-black text-primary">
        {formatNumber(committee.overallPercentage)}%
      </span>
    </div>
    <MetricsGrid metrics={committee.metrics} compact />
  </button>
);

const StudentCard = ({ student }) => (
  <div className="rounded-lg border border-primary/15 bg-card/55 p-3">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Users className="h-4 w-4" />
        </span>
        <h5 className="truncate text-base font-black text-foreground">{student.name}</h5>
      </div>
      <span className="rounded-full border border-primary/15 bg-background px-3 py-1 text-xs font-black text-primary">
        {formatNumber(student.overallPercentage)}%
      </span>
    </div>
    <MetricsGrid metrics={student.metrics} compact />
  </div>
);

const CommitteeIndicatorsPanel = ({ committees = [], selectedCommitteeId = null, onSelectCommittee, onBack }) => {
  const sortedCommittees = useMemo(() => committees || [], [committees]);
  const selectedCommittee = sortedCommittees.find((committee) => String(committee.id) === String(selectedCommitteeId));

  if (selectedCommittee) {
    return (
      <div className="space-y-4" dir="rtl">
        <div className="flex items-center gap-3 border-b border-primary/15 pb-4">
          <Button type="button" variant="outline" size="icon" onClick={onBack} title="العودة إلى الإحصائيات" aria-label="العودة إلى الإحصائيات" className="shrink-0">
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-lg font-black text-foreground">طلاب {selectedCommittee.name}</h4>
            <p className="mt-1 text-xs font-bold text-muted-foreground">{formatNumber(selectedCommittee.studentsCount)} طالب</p>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-primary/15 bg-background/70 p-3 sm:p-4">
          <div>
            <h5 className="mb-3 text-sm font-black text-foreground">مؤشرات الحلقة</h5>
            <MetricsGrid metrics={selectedCommittee.metrics} />
          </div>

          <div className="border-t border-primary/15 pt-4">
            <h5 className="mb-3 text-sm font-black text-foreground">إحصائيات الطلاب</h5>
            {selectedCommittee.students.length === 0 ? (
            <p className="py-6 text-center text-sm font-bold text-muted-foreground">لا يوجد طلاب في هذه الحلقة.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {selectedCommittee.students.map((student) => <StudentCard key={student.id} student={student} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/15 bg-background/70 p-3 sm:p-4">
      <h4 className="mb-4 truncate text-lg font-black text-foreground">مؤشرات الحلق</h4>

      {sortedCommittees.length === 0 ? (
        <p className="py-6 text-center text-sm font-bold text-muted-foreground">لا توجد حلقات في هذه الفترة.</p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {sortedCommittees.map((committee) => (
            <CommitteeCard key={committee.id} committee={committee} onSelect={onSelectCommittee} />
          ))}
        </div>
      )}
    </div>
  );
};

export default CommitteeIndicatorsPanel;
