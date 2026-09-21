import { readStoredDashboardPermissions } from '@/lib/dashboardPermissions';

export const getCulturalCompetitionHomePath = () => {
  const role = localStorage.getItem('wajeh_role') || '';
  const teacherUsesPortal = role === 'supervisor' && readStoredDashboardPermissions().length === 0;
  return teacherUsesPortal
    ? '/portal/cultural-competitions'
    : '/dashboard/cultural-competitions';
};
