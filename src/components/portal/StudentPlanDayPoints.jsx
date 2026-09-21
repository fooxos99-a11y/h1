import React from 'react';
import PointIcon from '@/components/points/PointIcon';
import RankingPointsValue from '@/components/points/RankingPointsValue';

export default function StudentPlanDayPoints({ points }) {
  if (!points) return null;
  if (points.pending) return <span className="text-xs text-muted-foreground [font-family:var(--font-ui)]">بانتظار التقييم</span>;
  return <details className="min-w-0 text-sm [font-family:var(--font-ui)]">
    <summary className="flex min-h-11 cursor-pointer items-center justify-end gap-1 rounded-md px-2 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`نقاط اليوم: ${points.earned} من ${points.maximum}`}>
      <span dir="ltr" className="inline-flex items-center gap-1"><bdi>{Number(points.earned).toLocaleString('ar-SA-u-nu-latn')}</bdi><span>/</span><bdi>{Number(points.maximum).toLocaleString('ar-SA-u-nu-latn')}</bdi></span>
      <PointIcon className="h-4 w-4" />
    </summary>
    <ul className="space-y-1 pb-2">
      {points.details.map((item, index) => <li key={index} className="flex items-center justify-between gap-3"><span>{item.label}</span><RankingPointsValue value={item.earned} iconClassName="h-4 w-4" /></li>)}
    </ul>
  </details>;
}
