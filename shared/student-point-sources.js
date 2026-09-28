const labels = {
  attendance: 'كيلومترات الحضور',
  family_evaluation: 'تقييم الحلقة',
  family_achievement: 'وسام الحلقة',
  family_adjustment: 'تعديل كيلومترات الحلقة',
  family_points_setting_adjustment: 'تعطيل تحويل كيلومترات الحلقة إلى الطلاب',
  daily_challenge: 'التحدي اليومي',
  summit_challenge: 'تحدي الخريطة',
  summit_station: 'المحطات',
  learning_path: 'البرامج',
  quran_plan: 'خطة القرآن',
  inactive_source_adjustment: 'مصدر كيلومترات غير مفعل',
  supervisor_award: 'إضافة كيلومترات من معلم',
  supervisor_deduction: 'خصم كيلومترات من معلم',
  manager_adjustment: 'تعديل كيلومترات من المدير',
  manual_award: 'منح كيلومترات من المدير',
  manual: 'إدخال يدوي',
  quran_execution: 'تنفيذ خطة القرآن',
  quran_evaluation: 'تقييم جلسة التسميع',
  store_purchase: 'شراء من المتجر',
};

export const getStudentPointSourceLabel = (sourceType = '') => labels[sourceType] || 'مصدر غير محدد';
