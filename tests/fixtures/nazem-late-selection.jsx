import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TeacherRecitationTaskList from '../../src/components/portal/TeacherRecitationTaskList';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const queue = [[1, 4], [5, 6], [7, 13], [3, 6]].map(([fromAyah, toAyah], index) => ({
  id: index + 1, planId: 87, studentId: 99, studentName: 'طالب اختبار', taskType: 'memorization',
  track: 'memorization', nazemManaged: true, nazemLate: true, taskDate: `2026-09-${13 + index}`,
  fromSurah: index < 3 ? 61 : 62, toSurah: index < 3 ? 61 : 62, fromAyah, toAyah,
  fromSurahName: index < 3 ? 'الصف' : 'الجمعة', toSurahName: index < 3 ? 'الصف' : 'الجمعة',
  fromPage: 551, toPage: 551, expectedRepeatCount: 10, expectedListeningCount: 1,
}));
function Preview() {
  const [selected, setSelected] = useState([]);
  return <main className="p-3 [font-family:var(--font-ui)]">
    <TeacherRecitationTaskList tasks={[queue[0]]} taskQueue={queue}
      students={[{studentId: 99, studentName: 'طالب اختبار', attendanceStatus: 'present', nazemManaged: true}]}
      quranChapters={[{number: 61, name: 'الصف', ayahCount: 14}, {number: 62, name: 'الجمعة', ayahCount: 11}]}
      showAmounts teacherExecutionMode onRecite={student => setSelected(student.tasks.map(task => task.id))} />
    <output aria-label="المقاطع المختارة">{selected.join(',')}</output>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
