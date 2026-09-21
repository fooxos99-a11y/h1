import React, { useCallback, useEffect, useState } from 'react';
import StudentHomeStatus from './home/StudentHomeStatus';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import StudentProgramContent from '@/components/portal/StudentProgramContent';
import StudentProgramCard from '@/components/programs/StudentProgramCard';
import ProgramRichText from '@/components/programs/ProgramRichText';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';
import useProgramNavigation from '@/hooks/useProgramNavigation';

export default function StudentProgramsSection() {
  const { toast } = useToast();
  const [programs, setPrograms] = useState([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const { programId, sectionId, open } = useProgramNavigation();
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError(false);
    try { setPrograms((await studentsApi.getPrograms()).programs || []); }
    catch (error) {
      setError(true);
      toast({ title: 'تعذر تحميل البرامج', description: error.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <DashboardLoader />;
  const selected = programs.find(program => program.id === programId);
  const section = selected?.sections?.find(item => item.id === sectionId);
  const activity = sectionId ? section : selected?.sectionsEnabled ? null : selected;
  return <section className="student-programs mx-auto w-full max-w-5xl space-y-5 p-1 [font-family:var(--font-ui)]" dir="rtl">
    {error && <StudentHomeStatus message="تعذر تحميل البرامج." onRetry={load} />}
    {programId && !selected || sectionId && !section ? <>
      <p role="status">البرنامج غير متاح.</p>
    </> : activity ? <StudentProgramContent key={activity.id} program={activity}
      onCompleted={() => load({ quiet: true })} /> : <>
      {selected && <>
        <h1 className="break-words text-2xl font-black">{selected.title}</h1>
        <ProgramRichText>{selected.contents?.find(item => item.type === 'text')?.value}</ProgramRichText>
      </>}
      {!error && !programs.length && <p className="py-10 text-center text-muted-foreground">لا توجد برامج متاحة حاليًا.</p>}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {(selected ? selected.sections : programs).map(program => <StudentProgramCard key={program.id} program={program}
          onStart={() => open(selected ? selected.id : program.id, selected ? program.id : 0)} />)}
      </div>
    </>}
  </section>;
}
