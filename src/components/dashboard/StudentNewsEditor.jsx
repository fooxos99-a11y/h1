import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { studentNewsService } from '@/services/studentNewsService';
import { emptyStudentNews, newsTimeNow } from '../../../shared/student-news';
import { isActionCancelled } from '@/lib/deferredActions';
import { useToast } from '@/components/ui/use-toast';
import NewsEntryDialog from './NewsEntryDialog';

function audienceLabel(entry, committees) {
  if (entry.legacyStudentIds?.length) return 'تخصيص سابق';
  if (!entry.committeeIds.length) return 'جميع الحلقات';
  return committees.filter(row => entry.committeeIds.includes(Number(row.id))).map(row => row.name).join('، ');
}

function displayStatus(entry, now) {
  if (entry.enabled === false) return 'مخفي';
  if (entry.endsAt && entry.endsAt < now) return 'انتهى العرض';
  if (entry.startsAt && entry.startsAt > now) return 'مجدول';
  return 'معروض';
}

export default function StudentNewsEditor() {
  const { toast } = useToast();
  const [news, setNews] = useState(emptyStudentNews);
  const [committees, setCommittees] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setLoaded(false); setError('');
    Promise.all([studentNewsService.manage(), studentNewsService.audience()]).then(([value, rows]) => {
      if (active) { setNews(value); setCommittees(rows); setLoaded(true); }
    }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const persist = async entries => {
    if (busy.current) return false;
    busy.current = true; setPending(true); setError('');
    try { setNews(await studentNewsService.save({ entries, revision: news.revision })); return true; }
    catch (reason) { if (isActionCancelled(reason)) return false; throw reason; }
    finally { busy.current = false; setPending(false); }
  };
  const save = async entry => {
    const exists = news.entries.some(row => row.id === entry.id);
    const entries = exists ? news.entries.map(row => row.id === entry.id ? entry : row) : [...news.entries, entry];
    if (await persist(entries)) { setEditing(null); toast({ title: 'حُفظ الخبر' }); }
  };
  const remove = async id => {
    try { await persist(news.entries.filter(entry => entry.id !== id)); }
    catch (reason) { setError(reason.message); }
  };
  if (loading) return <LoadingIndicator />;
  const now = newsTimeNow();
  return <section dir="rtl" className="mx-auto max-w-4xl space-y-3 [font-family:var(--font-ui)]">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-primary">الأخبار</h2>
      <Button disabled={!loaded || pending || news.entries.length >= 8} onClick={() => setEditing({ id: crypto.randomUUID(), title: '', image: '', committeeIds: [], startsAt: '', endsAt: '', enabled: true })}>إضافة خبر</Button></div>
    {error && <div role="alert" className="rounded-xl border p-3 text-sm text-destructive"><p>{error}</p><Button variant="ghost" disabled={pending} onClick={() => setRetry(value => value + 1)}>إعادة التحميل</Button></div>}
    {news.entries.map(entry => <article key={entry.id} className="flex min-w-0 gap-3 rounded-2xl border bg-card p-3 sm:p-4">
      {entry.image && <img src={entry.image} alt="" className="h-20 w-20 shrink-0 rounded-lg bg-muted/30 object-cover sm:h-24 sm:w-24" />}
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="break-words text-sm font-bold text-primary">{entry.title}</h3>
        <p className="text-xs text-muted-foreground">{audienceLabel(entry, committees)}</p>
        <p className="text-xs text-muted-foreground">{displayStatus(entry, now)}</p>
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" disabled={pending} onClick={() => setEditing(entry)}>تعديل</Button>
          <Button variant="ghost" disabled={pending} onClick={() => remove(entry.id)}>حذف</Button>
        </div>
      </div>
    </article>)}
    {editing && <NewsEntryDialog key={editing.id} entry={editing} committees={committees} pending={pending} onClose={() => setEditing(null)} onSave={save} />}
  </section>;
}
