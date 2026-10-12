import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import NarrationSetupStudents from '@/components/dashboard/NarrationSetupStudents';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { studentsApi } from '@/services/studentsApi';
import '@/index.css';

globalThis.narrationSetupFixture = { fail: new URLSearchParams(globalThis.location.search).has('fail'), saves: [] };
studentsApi.getNarrationSetup = async () => {
  if (globalThis.narrationSetupFixture.fail) throw new Error('تعذر تحميل المحفوظ');
  return { students: [
    { id: 1, name: 'طالب مرتبط', committeeId: 3, committeeName: 'حلقة سهيل', memorizedFaces: 20, memorizedRanges: [{ juz: 1, fromPage: 1, toPage: 20 }] },
    { id: 2, name: 'طالب مستقل', committeeId: 3, committeeName: 'حلقة سهيل', memorizedFaces: 0, memorizedRanges: [] },
    { id: 3, name: 'حلقة أخرى', committeeId: 4, committeeName: 'حلقة عتبة', memorizedFaces: 10, memorizedRanges: [] },
  ], juzRanges: [{ juz: 1, fromPage: 1 }, { juz: 30, fromPage: 582 }] };
};
function Fixture() {
  const [mode, setMode] = useState('full');
  const [selections, setSelections] = useState([]);
  const [ready, setReady] = useState(false);
  return <Dialog open><DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto [font-family:var(--font-ui)]">
    <DialogHeader><DialogTitle>فتح يوم سرد</DialogTitle></DialogHeader>
    <NarrationSetupStudents startDate="2026-10-01" committeeIds={['3']} selectionMode={mode} selections={selections} onReady={setReady}
      onModeChange={(value) => { setMode(value); setSelections([]); }} onChange={setSelections} />
    <Button disabled={!ready || !selections.length} onClick={() => globalThis.narrationSetupFixture.saves.push({ mode, selections })}>فتح</Button>
  </DialogContent></Dialog>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
