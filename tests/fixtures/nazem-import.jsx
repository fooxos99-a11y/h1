import React from 'react';
import { createRoot } from 'react-dom/client';
import NazemStudentPlanImportDialog from '../../src/components/dashboard/NazemStudentPlanImportDialog';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const base = { circleName: 'حلقة الاختبار', organizationName: 'جهة الاختبار', plans: [] };
const teacher = { teacherId: 99, teacherName: 'معلم اختبار', preparedImport: {
  mode: 'existing', committeeId: '1', preview: {
    committees: [{ id: 1, name: 'حلقة الاختبار', studentCount: 1 }], localStudents: [],
    candidates: [
      { ...base, id: 1, nazemStudentName: 'طالب اختبار دون خطة' },
      { ...base, id: 2, nazemStudentName: 'طالب اختبار مرتبط', linkedStudentId: 2, linkedStudentName: 'طالب اختبار مرتبط' },
      { ...base, id: 3, nazemStudentName: 'طالب اختبار لديه خطة', plans: [{ id: 3, status: 'discovered' }] },
    ],
  },
} };
createRoot(document.getElementById('root')).render(
  <NazemStudentPlanImportDialog open teacher={teacher} onOpenChange={() => {}} />,
);
