import { getSiteConfig } from '@/site/siteConfigs';

const allDashboardPermissionOptions = [
  { key: 'manualAttendance', label: 'تحضير الطلاب' },
  { key: 'staffAttendance', label: 'تحضير المعلمين والمقرئين والإدارة' },
  { key: 'registrationRequests', label: 'طلبات التسجيل' },
  { key: 'contactMessages', label: 'رسائل التواصل' },
  { key: 'students', label: 'الطلاب' },
  { key: 'studentPlans', label: 'خطط الطلاب' },
  { key: 'quranTests', label: 'الاختبارات' },
  { key: 'narrationDay', label: 'يوم السرد' },
  { key: 'calls', label: 'المكالمات' },
  { key: 'executionFollowup', label: 'متابعة التنفيذ' },
  { key: 'quranEvaluation', label: 'جلسات التسميع' },
  { key: 'families', label: 'الحلقات' },
  { key: 'supervisors', label: 'المعلمين' },
  { key: 'reciters', label: 'المقرئون' },
  { key: 'administrators', label: 'الإداريين' },
  { key: 'notifications', label: 'الإشعارات' },
  { key: 'reports', label: 'التقارير' },
  { key: 'programs', label: 'البرامج' },
  { key: 'whatsappSend', label: 'الإرسال عبر الواتس' },
  { key: 'settings', label: 'الإعدادات' },
  { key: 'store', label: 'المتجر' },
  { key: 'culturalCompetition', label: 'المسابقات الثقافية' },
];

const siteFeatures = getSiteConfig().features || {};

export const dashboardPermissionOptions = allDashboardPermissionOptions.filter((option) => (
  option.key !== 'store' || siteFeatures.store !== false
));

export const dashboardPermissionKeys = dashboardPermissionOptions.map((option) => option.key);

export const normalizeDashboardPermissions = (permissions = []) => {
  const allowed = new Set(dashboardPermissionKeys);
  return [...new Set(
    (Array.isArray(permissions) ? permissions : [])
      .map((permission) => String(permission || '').trim())
      .filter((permission) => allowed.has(permission))
  )];
};

export const readStoredDashboardPermissions = () => {
  try {
    return normalizeDashboardPermissions(JSON.parse(localStorage.getItem('wajeh_dashboard_permissions') || '[]'));
  } catch {
    return [];
  }
};

export const storeDashboardPermissions = (permissions = []) => {
  localStorage.setItem('wajeh_dashboard_permissions', JSON.stringify(normalizeDashboardPermissions(permissions)));
};
