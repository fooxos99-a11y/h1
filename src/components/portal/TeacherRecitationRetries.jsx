import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { studentsApi } from '@/services/studentsApi';
import { getQuranTaskLabel } from '@/lib/quranTaskLabels';
import { useToast } from '@/components/ui/use-toast';

export default function TeacherRecitationRetries({ supervisorId }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const load = useCallback(async () => {
    try { setRows(await studentsApi.getRecitationRetries(supervisorId)); setError(''); }
    catch { setError('تعذر التحقق من التسميع المتأخر.'); }
  }, [supervisorId]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const retry = async (row) => {
    setBusy(row.id);
    try {
      await studentsApi.retryRecitationDelivery(supervisorId, row.id);
      setRows(current => current.filter(item => item.id !== row.id));
      toast({ title: 'أُعيد إرسال النتيجة المحفوظة' });
    } catch (cause) { toast({ title: 'تعذرت إعادة الإرسال', description: cause.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  return <div className="space-y-3 [font-family:var(--font-ui)]" dir="rtl">
    {error && <Button variant="ghost" onClick={load}>{error} إعادة المحاولة</Button>}
    {rows.map(row => <article key={row.id} className="rounded-2xl border border-primary/15 bg-card p-4">
      <h3 className="mb-3 font-bold">{row.studentName}{row.taskType ? ` — ${getQuranTaskLabel(row)}` : ''}</h3>
      <Button className="min-h-11" disabled={busy !== null} onClick={() => retry(row)}>{busy === row.id ? 'جارٍ الإرسال…' : 'إعادة الإرسال'}</Button>
      <p className="mt-2 break-words text-xs leading-6 text-muted-foreground">{row.firstFailureReason}</p>
    </article>)}
  </div>;
}
