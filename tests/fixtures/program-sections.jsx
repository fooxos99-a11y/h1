import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentProgramsSection from '../../src/components/portal/StudentProgramsSection';
import StudentHomeWindow from '../../src/components/portal/home/StudentHomeWindow';
import ProgramEditorDialog from '../../src/components/dashboard/ProgramEditorDialog';
import ClassicDailyChallengeGame from '../../src/components/portal/ClassicDailyChallengeGame';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';
import '../../src/components/portal/home/student-home.css';
import '../../src/components/portal/studentDailyChallenge.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const sections = [
  { id: 2, title: 'قسم الأسئلة', pointsReward: 12, contents: [{ type: 'text', value: 'محتوى الأسئلة' }], questions: [{ id: 1, text: 'اختر الإجابة', options: [{ id: 1, text: 'صحيح' }, { id: 2, text: 'خطأ' }] }] },
  { id: 3, title: 'قسم بدون أسئلة', pointsReward: 8, contents: [{ type: 'text', value: 'محتوى النشاط' }], questions: [] },
];
studentsApi.getPrograms = async () => ({ programs: [{ id: 1, title: 'برنامج تجريبي', pointsReward: 20, sectionsEnabled: true, sections, contents: [], questions: [] }] });
studentsApi.submitProgram = async id => { sections.find(section => section.id === id).completedAt = '2026-09-11'; return { earnedPoints: 12 }; };
function Preview() {
  const [saved, setSaved] = useState(null);
  const mode = new URLSearchParams(location.search).get('mode');
  if (mode === 'editor') return saved ? <pre data-testid="saved">{JSON.stringify(saved)}</pre> : <ProgramEditorDialog open onOpenChange={() => {}} onSave={setSaved} />;
  if (mode === 'sizes') return <ClassicDailyChallengeGame disabled={false} onSubmit={() => {}} attempt={{ gameType: 'size_ordering', challenge: { items: [140, 129, 118, 107, 96, 85, 74].map((size, id) => ({ id, size, shape: 'مربع', color: '#e4ad38' })) } }} />;
  return <StudentHomeWindow surfaceKey="programs" title="البرامج" onClose={() => {}}><StudentProgramsSection /></StudentHomeWindow>;
}
createRoot(document.getElementById('root')).render(<Preview />);
