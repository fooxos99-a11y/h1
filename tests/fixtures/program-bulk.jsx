import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProgramsSection from '../../src/components/dashboard/ProgramsSection';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
studentsApi.getProgramsConfiguration = async () => ({ learningPathsEnabled: true });
studentsApi.getPrograms = async () => ({ programs: [{ id: 1, title: 'برنامج اختبار', status: 'open', sectionsEnabled: true, questions: [], sections: [{ id: 2, title: 'القسم الأول', pointsReward: 150, questions: [] }] }] });
studentsApi.getProgramGrades = async () => ({ students: [1, 2, 3].map(id => ({ id, name: `طالب ${id}`, earnedPoints: 0, completedAt: null })) });
function Preview() {
  const [saved, setSaved] = useState([]);
  studentsApi.saveProgramGrades = async (_id, grades) => {
    setSaved(grades);
    return { grades: grades.map(row => ({ studentId: row.studentId, earnedPoints: row.points })) };
  };
  return <main className="p-3" dir="rtl"><ProgramsSection /><output aria-label="الدفعة المحفوظة">{JSON.stringify(saved)}</output></main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
