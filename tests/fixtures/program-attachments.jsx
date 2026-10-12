import React from 'react';
import { createRoot } from 'react-dom/client';
import ProgramsSection from '../../src/components/dashboard/ProgramsSection';
import StudentProgramsSection from '../../src/components/portal/StudentProgramsSection';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const storageKey = 'program_attachment_fixture';
const read = () => JSON.parse(localStorage.getItem(storageKey));
studentsApi.getProgramsConfiguration = async () => ({ learningPathsEnabled: true });
studentsApi.getPrograms = async () => {
  if (window.failNextProgramReload) { window.failNextProgramReload = false; throw new Error('Reload failed'); }
  return { programs: [read()] };
};
studentsApi.updateProgram = async (id, payload) => {
  const program = read();
  if (id !== program.id) throw new Error('Invalid program');
  localStorage.setItem(storageKey, JSON.stringify({ ...program, ...payload }));
  window.attachmentSaveCount = (window.attachmentSaveCount || 0) + 1;
  return { program: read() };
};
const student = new URLSearchParams(location.search).get('mode') === 'student';
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-3" dir="rtl">{student ? <StudentProgramsSection /> : <ProgramsSection />}</main>);
