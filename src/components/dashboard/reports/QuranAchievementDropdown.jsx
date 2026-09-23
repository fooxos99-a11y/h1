import React from 'react';
import { BadgeCheck, BookOpen, Link2, RefreshCw, Trophy } from 'lucide-react';

import { formatStatisticsNumber as formatNumber } from '@/lib/statisticsNumber';

const leaderboardConfig = [
  { key: 'review', title: 'الطلاب الأكثر مراجعة', icon: RefreshCw, color: '#f59e0b', valueKey: 'faces', suffix: 'وجه' },
  { key: 'link', title: 'الطلاب الأكثر ربطًا', icon: Link2, color: '#06b6d4', valueKey: 'faces', suffix: 'وجه' },
  { key: 'mastery', title: 'الأكثر حفظًا في مسار الإتقان', icon: BadgeCheck, color: '#8b5cf6', valueKey: 'faces', suffix: 'وجه' },
  { key: 'memorization', title: 'الأكثر حفظًا في مسار الحفظ', icon: BookOpen, color: '#14b8a6', valueKey: 'faces', suffix: 'وجه' },
  { key: 'committees', title: 'الحلقات الأعلى إنجازًا', icon: Trophy, color: '#22c55e', valueKey: 'completionRate', suffix: '%' },
];

const LeaderboardCard = ({ config, rows = [] }) => {
  const Icon = config.icon;
  const visibleRows = rows.slice(0, 5);
  return (
    <article className="min-w-0 rounded-xl border border-primary/15 bg-background/70 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${config.color}1f`, color: config.color }}>
          <Icon className="h-4 w-4" />
        </span>
        <h4 className="min-w-0 text-sm font-black text-foreground">{config.title}</h4>
      </div>
      {visibleRows.length === 0 ? (
        <p className="py-5 text-center text-xs font-bold text-muted-foreground">لا توجد بيانات في هذه الفترة.</p>
      ) : (
        <div className="divide-y divide-primary/10">
          {visibleRows.map((row, index) => (
            <div key={row.id || `${config.key}-${index}`} className="flex min-w-0 items-center gap-2 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-black text-primary">
                {formatNumber(index + 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-black text-foreground">{row.name}</div>
                <div className="truncate text-[10px] font-bold text-muted-foreground">
                  {config.key === 'committees' ? `${formatNumber(row.studentsCount)} طالب` : (row.committeeName || 'بدون حلقة')}
                </div>
              </div>
              <span className="shrink-0 text-xs font-black" style={{ color: config.color }}>
                {formatNumber(row[config.valueKey])}{config.suffix === '%' ? '%' : ` ${config.suffix}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
};

const QuranAchievementDropdown = ({ data = {} }) => (
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {leaderboardConfig.map((config) => (
      <LeaderboardCard key={config.key} config={config} rows={data?.[config.key] || []} />
    ))}
  </section>
);

export default QuranAchievementDropdown;
