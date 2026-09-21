import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TeacherRecitationTaskList from '../../src/components/portal/TeacherRecitationTaskList';
import '../../src/index.css';
const task = { id: 1, studentId: 1, studentName: 'طالب', taskType: 'link', track: 'memorization', nazemManaged: true, attemptCount: 1, teacherCompleted: false, fromPage: 1, toPage: 1, expectedLinkCount: 5 };
function Fixture() {
  const [next, setNext] = useState(false);
  globalThis.savedFixture = { next: () => setNext(true) };
  return <div dir="rtl" className="p-3 [font-family:var(--font-ui)]">
    <TeacherRecitationTaskList tasks={[task, ...(next ? [{ ...task, id: 2, attemptCount: 0, nazemLate: true, taskDate: '2026-09-06' }] : [])]} students={[{ studentId: 1, studentName: 'طالب', attendanceStatus: 'present', recitationPending: true, recitationSyncFailed: true }]} onRecite={() => {}} showAmounts={false} />
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
