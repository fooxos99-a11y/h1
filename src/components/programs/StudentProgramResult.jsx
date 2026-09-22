import React from 'react';
import { Award, Clock3 } from 'lucide-react';
import useRewardUnits from '@/hooks/useRewardUnits';

export default function StudentProgramResult({ program }) {
  const units = useRewardUnits();
  const recorded = Boolean(program.completedAt);
  const Icon = recorded ? Award : Clock3;
  return <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 [font-family:var(--font-ui)]" role="status">
    <Icon className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
    <div className="min-w-0 space-y-1">
      <p className="text-sm font-bold text-muted-foreground">{recorded ? 'النقاط المرصودة' : 'لم تُرصد النقاط بعد'}</p>
      {recorded && <p className="text-xl font-black tabular-nums text-primary">{units.format(program.earnedPoints)}</p>}
    </div>
  </div>;
}
