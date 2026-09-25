import React from 'react';
import { Button } from '@/components/ui/button';
import { narrationRangeLabel } from '@/lib/narrationParts';

export default function NarrationJuzParts({ groups, archived, onRecite }) {
  return <div className="space-y-3 py-2 [font-family:var(--font-ui)]" dir="rtl">
    {groups.map(group => <section key={group.juzNumber} aria-label={`الجزء ${group.juzNumber}`} className="rounded-xl border border-primary/15 bg-background/60 p-3 sm:p-4">
      <h3 className="mb-3 font-black text-foreground">الجزء {group.juzNumber}</h3>
      <div className="divide-y divide-primary/15">
        {group.parts.map(part => {
          const evaluated = part.score !== null && part.score !== undefined;
          return <div key={part.id} className="space-y-3 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 break-words font-bold text-foreground">{narrationRangeLabel(part)}</p>
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${evaluated ? 'border-primary/20 bg-primary/10 text-primary' : 'border-amber-500/25 bg-amber-500/10 text-amber-500'}`}>
                {evaluated ? `${Number(part.score).toFixed(1)} من 100` : 'لم يُقيّم'}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {evaluated && <span className="text-sm font-black text-muted-foreground">{part.mistakeCount} خطأ · {part.warningCount} تنبيه</span>}
              {!archived && <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => onRecite(part)} className="min-h-11">بدء التسميع</Button>
              </div>}
            </div>
          </div>;
        })}
      </div>
    </section>)}
  </div>;
}
