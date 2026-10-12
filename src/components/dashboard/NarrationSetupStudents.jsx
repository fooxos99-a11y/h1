import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { studentsApi } from '@/services/studentsApi';

export default function NarrationSetupStudents({ startDate, committeeIds, selectionMode, selections, onModeChange, onChange, onReady }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    onReady(false);
    setPreview(null);
    setError('');
    studentsApi.getNarrationSetup(startDate).then((result) => {
      if (active) { setPreview(result); onReady(true); }
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [startDate, reload, onReady]);
  const students = useMemo(() => (preview?.students || []).filter((student) => (
    committeeIds.includes('all') || committeeIds.map(String).includes(String(student.committeeId))
  )), [preview, committeeIds]);
  const selected = new Map(selections.map((selection) => [Number(selection.studentId), selection]));
  const changeStudent = (studentId, patch) => onChange(selections.map((selection) => (
    Number(selection.studentId) === Number(studentId) ? { ...selection, ...patch } : selection
  )));
  return (
    <div className="min-w-0 space-y-3 [font-family:var(--font-ui)]">
      <Label>طريقة السرد</Label>
      <Select value={selectionMode} onValueChange={onModeChange}>
        <SelectTrigger aria-label="طريقة السرد" className="h-11"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="full">المحفوظ الكامل</SelectItem><SelectItem value="manual">يدوي</SelectItem></SelectContent>
      </Select>
      {error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => setReload((value) => value + 1)}>إعادة المحاولة</Button></div>
        : !preview ? <p role="status">جارٍ تحميل محفوظ الطلاب…</p>
          : !students.length ? <p>لا يوجد طلاب في الحلقات المحددة.</p>
            : <div className="space-y-3">
              <Label>الطلاب</Label>
              {students.map((student) => {
                const selection = selected.get(Number(student.id));
                const eligible = selectionMode === 'manual' || student.memorizedFaces > 0;
                return <div key={student.id} className="min-w-0 rounded-xl border p-3">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3">
                    <Input type="checkbox" className="h-5 w-5 shrink-0" aria-label={`اختيار ${student.name}`} checked={Boolean(selection)} disabled={!eligible}
                      onChange={(event) => onChange(event.target.checked
                        ? [...selections, { studentId: student.id, fromPage: student.memorizedRanges[0]?.fromPage || 1, faces: 1 }]
                        : selections.filter((item) => Number(item.studentId) !== Number(student.id)))} />
                    <span className="min-w-0 break-words font-bold">{student.name}</span>
                  </label>
                  <p className="text-sm text-muted-foreground">{student.committeeName} · المحفوظ: {Number(student.memorizedFaces).toFixed(1).replace(/\.0$/, '')} وجه</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">{student.memorizedRanges.map((range, index) => (
                    <span key={index}>الجزء {range.juz}: صفحات {range.fromPage}–{range.toPage}</span>
                  ))}</div>
                  {selectionMode === 'manual' && selection && <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="col-span-2 space-y-1"><Label>بدء الجزء</Label>
                      <Select value={(preview.juzRanges || []).some((juz) => Number(juz.fromPage) === Number(selection.fromPage)) ? String(selection.fromPage) : ""} onValueChange={(page) => changeStudent(student.id, { fromPage: Number(page) })}>
                        <SelectTrigger aria-label={`بدء الجزء للطالب ${student.name}`} className="h-11"><SelectValue placeholder="اختر جزءًا" /></SelectTrigger>
                        <SelectContent>{(preview.juzRanges || []).map((juz) => <SelectItem key={juz.juz} value={String(juz.fromPage)}>الجزء {juz.juz}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label>صفحة البداية</Label><Input aria-label={`صفحة البداية للطالب ${student.name}`} type="number" inputMode="numeric" min="1" max="604" value={selection.fromPage} onChange={(event) => changeStudent(student.id, { fromPage: event.target.value })} /></div>
                    <div className="space-y-1"><Label>عدد الأوجه</Label><Input aria-label={`عدد الأوجه للطالب ${student.name}`} type="number" inputMode="numeric" min="1" max={605 - Number(selection.fromPage || 1)} value={selection.faces} onChange={(event) => changeStudent(student.id, { faces: event.target.value })} /></div>
                  </div>}
                </div>;
              })}
            </div>}
    </div>
  );
}
