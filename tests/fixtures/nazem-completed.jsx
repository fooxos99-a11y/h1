import React from 'react';
import { createRoot } from 'react-dom/client';
import TeacherRecitationTaskList from '../../src/components/portal/TeacherRecitationTaskList';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
createRoot(document.getElementById('root')).render(<TeacherRecitationTaskList onRecite={() => {}} students={[
  { studentId: 1, studentName: 'طالب مكتمل', attendanceStatus: 'present', nazemManaged: true, nazemRecitationCompleted: true },
  { studentId: 2, studentName: 'طالب لم تصل بياناته', attendanceStatus: 'present', nazemManaged: true },
]} />);
