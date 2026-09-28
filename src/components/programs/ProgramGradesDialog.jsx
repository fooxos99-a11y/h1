import React from 'react';
import StudentPointsDialog from '@/components/dashboard/StudentPointsDialog';
import { studentsApi } from '@/services/studentsApi';

export default function ProgramGradesDialog({ program, onClose }) {
  return <StudentPointsDialog program={program} onClose={onClose}
    loadGrades={studentsApi.getProgramGrades} saveGrades={studentsApi.saveProgramGrades} />;
}
