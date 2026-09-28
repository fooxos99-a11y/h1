import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SummitMapEditor from '../../src/components/dashboard/SummitMapEditor';
import ProgramGradesDialog from '../../src/components/programs/ProgramGradesDialog';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const roster = [1, 2, 3].map(id => ({ id, name: `طالب ${id}`, committeeId: id === 2 ? 2 : 1, committeeName: id === 2 ? 'حلقة ب' : 'حلقة أ', completedAt: id === 1 ? true : null, earnedPoints: id === 1 ? 20 : 0 }));
studentsApi.getStationGrades = studentsApi.getProgramGrades = async () => ({ students: roster });
const program = { id: 1, title: 'برنامج اختبار', pointsReward: 80 };
function Fixture() {
  const [config, setConfig] = useState({ stations: [{ id: 'station-a', name: 'محطة اختبار', rewardPoints: 80, kilometer: 0 }], activeStationId: null });
  const [saved, setSaved] = useState([]);
  const [open, setOpen] = useState(true);
  studentsApi.saveStationGrades = studentsApi.saveProgramGrades = async (_id, grades) => {
    setSaved(grades);
    return { grades: grades.map(row => ({ studentId: row.studentId, earnedPoints: row.points })) };
  };
  const showProgram = new URLSearchParams(location.search).has('program');
  return <><main dir="rtl">{showProgram ? <ProgramGradesDialog program={open ? program : null} onClose={() => setOpen(false)} /> : <SummitMapEditor value={config} onChange={setConfig} />}</main><output aria-label="الدفعة المحفوظة">{JSON.stringify(saved)}</output></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
