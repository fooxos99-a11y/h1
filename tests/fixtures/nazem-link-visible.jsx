import React from 'react';
import { createRoot } from 'react-dom/client';
import TeacherRecitationTaskList from '../../src/components/portal/TeacherRecitationTaskList';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const linked = new URLSearchParams(location.search).get('linked') !== 'false';
const base = { studentId: 70, studentName: 'موسى محمد موسى', planId: 71, taskDate: '2026-09-09',
  track: 'memorization', nazemManaged: linked, expectedLinkCount: 5, fromPage: 512, toPage: 512,
  fromSurah: 48, fromAyah: 11, toSurah: 48, toAyah: 14, attemptCount: 0 };
createRoot(document.getElementById('root')).render(<TeacherRecitationTaskList
  students={[{ studentId: 70, studentName: base.studentName, attendanceStatus: 'present', nazemLinkEmpty: true }]}
  tasks={[{ ...base, id: 1, taskType: 'memorization' }, { ...base, id: 2, taskType: 'link' }]}
  onRecite={(_student, tasks) => { document.getElementById('result').textContent = tasks?.[0]?.taskType || 'clicked'; }}
/>);
document.body.insertAdjacentHTML('beforeend', '<output id="result"></output>');
