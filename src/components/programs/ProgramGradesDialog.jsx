import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { studentsApi } from '@/services/studentsApi';
import useRewardUnits from '@/hooks/useRewardUnits';

export default function ProgramGradesDialog({ program, onClose }) {
  const units = useRewardUnits();
  const [students, setStudents] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!program) return;
    let active = true;
    setLoading(true); setError(''); setStudents([]);
    studentsApi.getProgramGrades(program.id).then(({ students: rows }) => {
      if (!active) return;
      setStudents(rows); setValues(Object.fromEntries(rows.map(row => [row.id, row.completedAt ? String(row.earnedPoints) : ''])));
    }).catch(error_ => { if (active) setError(error_.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [program, retry]);
  const save = async (student) => {
    setSaving(student.id); setError('');
    try {
      const result = await studentsApi.saveProgramGrade(program.id, student.id, Number(values[student.id]));
      setStudents(rows => rows.map(row => row.id === student.id ? { ...row, earnedPoints: result.earnedPoints, completedAt: true } : row));
    } catch (error_) { setError(error_.message); } finally { setSaving(null); }
  };
  return <Dialog open={Boolean(program)} onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent dir="rtl" className="max-h-[90dvh] max-w-2xl overflow-y-auto [font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>{program?.title} — تسجيل النقاط</DialogTitle></DialogHeader>
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>{!students.length && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</Button>}</div>}
      {loading ? <DashboardLoader /> : <div className="space-y-3">{students.map(student => {
        const value = values[student.id] ?? '';
        const valid = value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= program.pointsReward;
        const unchanged = student.completedAt && Number(value) === Number(student.earnedPoints);
        return <div key={student.id} className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor={`program-grade-${student.id}`} className="text-sm font-bold">{student.name}</label>{student.completedAt && <span className="text-xs text-primary">المسجل: {units.format(student.earnedPoints)}</span>}</div>
          <div className="flex items-center gap-2"><Input id={`program-grade-${student.id}`} type="number" min="0" max={program.pointsReward} step="1" value={value} disabled={saving !== null} onChange={event => setValues(current => ({ ...current, [student.id]: event.target.value }))} className="h-11 min-w-0 flex-1" /><span className="shrink-0 text-xs text-muted-foreground">/ {program.pointsReward}</span><Button className="min-h-11" disabled={!valid || unchanged || saving !== null} onClick={() => save(student)}>{saving === student.id ? 'جارٍ الحفظ' : 'حفظ'}</Button></div>
        </div>;
      })}{!students.length && !error && <p className="text-sm text-muted-foreground">لا يوجد طلاب.</p>}</div>}
    </DialogContent>
  </Dialog>;
}
