import React from 'react';
import { Button } from '@/components/ui/button';
import { narrationRangeLabel } from '@/lib/narrationParts';

export default function NarrationJuzParts({ groups, archived, onRecite }) {
  return <div className="space-y-3 py-2 [font-family:var(--font-ui)]" dir="rtl">
    {groups.map((group) => <section key={group.juzNumber} aria-label={`الجزء ${group.juzNumber}`} className="rounded-xl border border-primary/15 bg-background/60 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black text-foreground">الجزء {group.juzNumber}</h3>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${group.evaluated ? 'border-primary/20 bg-primary/10 text-primary' : 'border-amber-500/25 bg-amber-500/10 text-amber-500'}`}>
          {group.evaluated ? `${Number(group.score).toFixed(1)} من 100` : 'لم يُقيّم'}
        </span>
      </div>
      <ul className="space-y-1.5" aria-label={`مقاطع الجزء ${group.juzNumber}`}>
        {group.parts.map((part) => <li key={part.id} className="rounded-lg bg-primary/5 px-3 py-2 text-sm font-bold text-foreground break-words">
          {narrationRangeLabel(part)}
        </li>)}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {group.evaluated
          ? <span className="text-sm font-black text-muted-foreground">{group.mistakeCount} خطأ · {group.warningCount} تنبيه</span>
          : <span className="text-xs font-bold text-muted-foreground">{group.parts.length > 1 ? `${group.parts.length} مقاطع تُقيَّم بدرجة واحدة` : ''}</span>}
        {!archived && <Button type="button" onClick={() => onRecite(group)} className="min-h-11">
          {group.evaluated ? 'إعادة التسميع' : 'بدء التسميع'}
        </Button>}
      </div>
    </section>)}
  </div>;
}
