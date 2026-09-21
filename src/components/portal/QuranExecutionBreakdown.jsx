import React from 'react';
import { classifyPlanExecution } from '../../../shared/quran-plan-execution.js';
import { compareQuranPositionInDirection } from '../../../shared/quran-execution-policy.js';

const labels = { compensation: 'تعويض', extra: 'زيادة' };

export default function QuranExecutionBreakdown({ bounds, scheduledEnd, actualEnd, ayahs, recorded, ayahDisplay }) {
  const { start, expectedEnd: normalEnd, direction } = bounds;
  if (!start || !normalEnd || !actualEnd) return null;
  const position = (value) => ayahDisplay
    ? `${value.surahName || ayahs.find((ayah) => Number(ayah.surah) === Number(value.surah))?.surahName || `سورة ${value.surah}`} آية ${value.ayah}`
    : value.page;
  const range = (from, to) => `من ${position(from)} إلى ${position(to)}`;
  const segments = classifyPlanExecution({ actualStart: start, normalEnd, scheduledEnd, actualEnd, direction, allowCompensation: true, allowExtra: true });
  const ordered = [...ayahs].sort((a, b) => compareQuranPositionInDirection(a, b, direction));
  return (
    <div className="mt-2 space-y-1 text-xs font-bold text-muted-foreground [font-family:var(--font-ui)]" dir="rtl">
      <div>المطلوب: {range(start, normalEnd)}</div>
      <div>{recorded ? 'التنفيذ المسجل' : 'التنفيذ المختار'}: {range(start, actualEnd)}</div>
      {segments.filter((segment) => segment.type !== 'normal').map((segment) => {
        const first = ordered.find((ayah) => compareQuranPositionInDirection(ayah, segment.startAfter, direction) > 0);
        return first ? <div key={segment.type}>{labels[segment.type]}: {range(first, segment.end)}</div> : null;
      })}
    </div>
  );
}
