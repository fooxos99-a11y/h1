import React from 'react';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import useRewardUnits from '@/hooks/useRewardUnits';

export default function StudentProgramCard({ program, onStart }) {
  const units = useRewardUnits();
  return <Card className="student-program-card min-w-0 [font-family:var(--font-ui)]"><CardContent className="flex h-full flex-col gap-5 p-5 sm:p-5 lg:p-5">
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="break-words text-lg font-black leading-7">{program.title}</h2>
        <p className="text-sm font-bold tabular-nums text-primary">{units.format(program.pointsReward)}</p>
      </div>
    </div>
    {program.completedAt && <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm font-bold">النتيجة: {units.format(program.earnedPoints)}</p>}
    <Button className="mt-auto min-h-12 w-full" onClick={onStart}>ابدأ</Button>
  </CardContent></Card>;
}
