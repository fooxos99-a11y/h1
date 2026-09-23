import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingToggle from '@/components/ui/setting-toggle';
import MultiSelectSetting from '@/components/ui/multi-select-setting';
import StudentNewsCard from '@/components/portal/home/StudentNewsCard';
import { studentNewsService } from '@/services/studentNewsService';
import { emptyStudentNews } from '../../../shared/student-news';
import { filterRosterByName } from '@/lib/rosterSearch';
import { isActionCancelled } from '@/lib/deferredActions';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { useToast } from '@/components/ui/use-toast';

const readImage = file => new Promise((resolve, reject) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    reject(new Error('اختر صورة PNG أو JPEG أو WebP بحجم أقصاه ٥ ميجابايت.')); return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('تعذرت قراءة الصورة.'));
  reader.readAsDataURL(file);
});

export default function StudentNewsEditor() {
  const { toast } = useToast();
  const [news, setNews] = useState(emptyStudentNews);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [targeted, setTargeted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const busy = useRef(false);
  const fileInput = useRef(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoaded(false); setError('');
    Promise.all([studentNewsService.manage(), studentNewsService.audience()]).then(([value, rows]) => {
      if (active) { setNews(value); setStudents(rows); setTargeted(value.studentIds.length > 0); setLoaded(true); }
    }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const update = (key, value) => setNews(current => ({ ...current, [key]: value }));
  const addImages = async event => {
    const files = [...event.target.files]; event.target.value = '';
    if (files.length + news.images.length > 8) { setError('الحد الأقصى ٨ صور.'); return; }
    setSaving(true); setError('');
    try { const images = await Promise.all(files.map(readImage)); setNews(current => ({ ...current, images: [...current.images, ...images] })); }
    catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };
  const move = (index, delta) => {
    const images = [...news.images];
    [images[index], images[index + delta]] = [images[index + delta], images[index]];
    update('images', images);
  };
  const save = async () => {
    if (busy.current) return;
    if (JSON.stringify(news).length > 15_000_000) { setError('حجم الصور الإجمالي كبير؛ قلل عدد الصور أو أحجامها.'); return; }
    if (targeted && !news.studentIds.length) { setError('اختر طالبًا واحدًا على الأقل.'); return; }
    busy.current = true; setSaving(true); setError('');
    try {
      setNews(await studentNewsService.save({ ...news, studentIds: targeted ? news.studentIds : [] }));
      toast({ title: 'حُفظت الأخبار' });
    } catch (reason) { if (!isActionCancelled(reason)) setError(reason.message); }
    finally { busy.current = false; setSaving(false); }
  };
  if (loading) return <LoadingIndicator />;
  return <section dir="rtl" className="mx-auto max-w-3xl space-y-4 rounded-2xl border bg-card p-3 [font-family:var(--font-ui)] sm:p-5">
    <h2 className="text-lg font-bold text-primary">الأخبار والتكريم</h2>
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" disabled={saving} onClick={() => setRetry(value => value + 1)}>إعادة التحميل</Button></div>}
    <fieldset disabled={saving || !loaded} className="min-w-0 space-y-4 disabled:opacity-70">
      <div className="space-y-2"><Label htmlFor="news-title">المسمى</Label><Input id="news-title" value={news.title} maxLength={80} onChange={event => update('title', event.target.value)} /></div>
      <SettingToggle label="إظهار في صفحة الطالب" checked={news.enabled} onCheckedChange={value => update('enabled', value)} />
      <div className="space-y-2"><Label htmlFor="news-expiry">تاريخ انتهاء العرض</Label><Input id="news-expiry" type="date" value={news.expiresOn} onChange={event => update('expiresOn', event.target.value)} /></div>
      <SettingToggle label="طلاب محددون" checked={targeted} onCheckedChange={setTargeted} />
      {targeted && <div className="space-y-2"><Input aria-label="بحث الطلاب" placeholder="ابحث باسم الطالب" value={search} onChange={event => setSearch(event.target.value)} />
        <MultiSelectSetting value={news.studentIds} placeholder="اختر الطلاب" options={filterRosterByName(students, search).map(student => ({ value: Number(student.id), label: student.name }))}
          onToggle={id => update('studentIds', news.studentIds.includes(id) ? news.studentIds.filter(value => value !== id) : [...news.studentIds, id])} />
      </div>}
      <div className="space-y-2"><Label htmlFor="news-images">الصور</Label><Input ref={fileInput} id="news-images" className="hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addImages} /><Button variant="outline" className="w-full" onClick={() => fileInput.current?.click()}>إضافة صور</Button></div>
      <div className="space-y-2">{news.images.map((image, index) => <div key={index} className="flex min-w-0 items-center gap-1 rounded-xl border p-2">
        <img src={image} alt={`الصورة ${index + 1}`} className="h-14 w-14 shrink-0 object-contain" />
        <span className="flex-1 text-xs">{index + 1}</span>
        <Button variant="outline" className="min-w-11 px-2" disabled={index === 0} aria-label={`تقديم الصورة ${index + 1}`} onClick={() => move(index, -1)}>↑</Button>
        <Button variant="outline" className="min-w-11 px-2" disabled={index === news.images.length - 1} aria-label={`تأخير الصورة ${index + 1}`} onClick={() => move(index, 1)}>↓</Button>
        <Button variant="outline" className="min-w-11 px-2" aria-label={`حذف الصورة ${index + 1}`} onClick={() => update('images', news.images.filter((_, item) => item !== index))}>حذف</Button>
      </div>)}</div>
    </fieldset>
    <StudentNewsCard news={news} active={false} />
    <Button className="w-full sm:w-auto" disabled={saving || !loaded} onClick={save}>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</Button>
  </section>;
}
