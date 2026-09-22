import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProgramEditorDialog from '../../src/components/dashboard/ProgramEditorDialog';
import ProgramGradesDialog from '../../src/components/programs/ProgramGradesDialog';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
studentsApi.getProgramGrades = async () => ({ students: [{ id: 1, name: 'طالب تجريبي', completedAt: null, earnedPoints: 0 }] });
studentsApi.saveProgramGrades = async (_id, grades) => ({ grades: grades.map(row => ({ studentId: row.studentId, earnedPoints: row.points })) });
function Preview() {
 const [program, setProgram] = useState(null);
 return <><ProgramEditorDialog open={!program} onOpenChange={() => {}} onSave={payload => setProgram({ ...payload, id: 1 })} /><ProgramGradesDialog program={program} onClose={() => setProgram(null)} /></>;
}
createRoot(document.getElementById('root')).render(<Preview />);
