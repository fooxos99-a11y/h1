export const PLATFORM_POLICY_PREFIX = 'platformPolicy:';

export const PLATFORM_POLICY_VALUES = Object.freeze({
  enabled: 'enabled',
  disabled: 'disabled',
  tenant: 'tenant',
});

const number = (key, label, defaultValue, min = 0, max) => ({
  key, label, type: 'number', defaultValue, min, ...(max === undefined ? {} : { max }),
});
const text = (key, label, defaultValue = '', type = 'text') => ({ key, label, type, defaultValue });
const toggle = (key, label, defaultValue = false) => ({ key, label, type: 'boolean', defaultValue });
const select = (key, label, defaultValue, options) => ({ key, label, type: 'select', defaultValue, options });

const evaluationFields = (prefix, label, defaults = [100, 1, 2, 85]) => [
  number(`${prefix}MaxScore`, `${label} — أصل الدرجة والكيلومترات`, defaults[0], 1),
  number(`${prefix}WarningDeduction`, `${label} — خصم التنبيه`, defaults[1]),
  number(`${prefix}MistakeDeduction`, `${label} — خصم الخطأ`, defaults[2]),
  number(`${prefix}PassingScore`, `${label} — حد النجاح`, defaults[3], 1),
];

const limitFields = (prefix, label, defaults) => [
  number(`${prefix}OneFaceMistakes`, `${label} — أخطاء وجه واحد`, defaults[0]),
  number(`${prefix}OneFaceWarnings`, `${label} — تنبيهات وجه واحد`, defaults[1]),
  number(`${prefix}TwoFacesMistakes`, `${label} — أخطاء وجهين`, defaults[2]),
  number(`${prefix}TwoFacesWarnings`, `${label} — تنبيهات وجهين`, defaults[3]),
  number(`${prefix}ThreePlusFacesMistakes`, `${label} — أخطاء ثلاثة أوجه فأكثر`, defaults[4]),
  number(`${prefix}ThreePlusFacesWarnings`, `${label} — تنبيهات ثلاثة أوجه فأكثر`, defaults[5]),
];

export const platformSettingsGroups = [
  {
    key: 'plans', label: 'الخطط والقرآن', settings: [
      text('quranPlanStartDate', 'البداية', '', 'date'),
      text('quranPlanEndDate', 'النهاية', '', 'date'),
      { key: 'weeklyHolidayDays', label: 'أيام الإجازة', type: 'weekDays', defaultValue: [5, 6] },
      { key: 'holidayTaskTypes', label: 'مهام الإجازة', type: 'taskTypes', defaultValue: [] },
      select('recitationAmountDay', 'المقادير التي تظهر في جلسة التسميع', 'previous_day', [
        { value: 'previous_day', label: 'المقادير المقررة حتى اليوم السابق للجلسة' },
        { value: 'same_day', label: 'المقادير المقررة حتى يوم الجلسة' },
      ]),
      { key: 'recitationSessionDays', label: 'أيام التسميع', type: 'weekDays', defaultValue: [0, 1, 2, 3, 4] },
      select('memorizationExecutionSource', 'تنفيذ الحفظ', 'teacher', [
        { value: 'student', label: 'الطالب' }, { value: 'teacher', label: 'المعلم' }, { value: 'both', label: 'الأسبق منهما' },
      ]),
      select('reviewExecutionSource', 'تنفيذ المراجعة', 'both', [
        { value: 'student', label: 'الطالب' }, { value: 'teacher', label: 'المعلم' }, { value: 'both', label: 'الأسبق منهما' },
      ]),
      select('linkExecutionSource', 'تنفيذ الربط', 'both', [
        { value: 'student', label: 'الطالب' }, { value: 'teacher', label: 'المعلم' }, { value: 'both', label: 'الأسبق منهما' },
      ]),
      select('recitationAttendanceSource', 'مصدر حضور التسميع', 'supervisor', [
        { value: 'supervisor', label: 'المشرف' }, { value: 'teacher', label: 'المعلم' },
      ]),
      select('quranReferenceMode', 'عرض مرجع القرآن', 'ayah', [
        { value: 'ayah', label: 'السورة والآية' }, { value: 'page', label: 'رقم الصفحة' },
      ]),
      toggle('hideStudentAmounts', 'إخفاء المقدار عن الطلاب', false),
      toggle('hideStudentMemorizationAmount', 'إخفاء الحفظ والإتقان', true),
      toggle('hideStudentReviewAmount', 'إخفاء المراجعة', true),
      toggle('hideStudentLinkAmount', 'إخفاء الربط', true),
      toggle('studentReviewAmountEditable', 'تعديل الطالب لمقدار المراجعة', true),
      toggle('studentLinkAmountEditable', 'تعديل الطالب لمقدار الربط', true),
      toggle('studentTaskAmountEditable', 'السماح للطالب بتقليل مقدار حفظ اليوم', true),
      toggle('allowQuranCompensation', 'السماح بإكمال الحفظ المتأخر (التعويض)', true),
      number('quranCompensationPointsPercent', 'نسبة كيلومترات التعويض', 100, 0, 100),
      toggle('allowQuranExtra', 'السماح بتجاوز مقدار اليوم والتقدم في الخطة', false),
      number('quranExtraPointsPercent', 'نسبة كيلومترات الزيادة خارج الخطة', 50, 0, 100),
      number('memorizationRepeatCount', 'عدد تكرارات الحفظ', 1, 1),
      number('masteryRepeatCount', 'عدد تكرارات الإتقان', 1, 1),
      number('memorizationListeningCount', 'عدد مرات سماع الحفظ', 3, 1),
      number('masteryListeningCount', 'عدد مرات سماع الإتقان', 3, 1),
      number('memorizationRepeatPointValue', 'كيلومترات كل تكرار للحفظ', 1, 0),
      number('masteryRepeatPointValue', 'كيلومترات كل تكرار للإتقان', 1, 0),
      number('memorizationListeningPointValue', 'كيلومترات كل سماع للحفظ', 10, 0),
      number('masteryListeningPointValue', 'كيلومترات كل سماع للإتقان', 10, 0),
    ],
  },
  {
    key: 'attendance', label: 'الحضور والغياب', settings: [
      toggle('attendanceManualEnabled', 'الحضور اليدوي', true),
      toggle('attendanceAccountEnabled', 'حضور الطالب من حسابه'),
      { key: 'attendanceDays', label: 'أيام الحضور', type: 'weekDays', defaultValue: [0, 3] },
      toggle('allowEarlyAttendance', 'السماح بالحضور المبكر', true),
      text('attendanceStartTime', 'وقت بداية الحضور', '16:00', 'time'),
      number('lateEveryMinutes', 'احتساب التأخر كل عدد دقائق', 10, 1),
      number('lateDeductionPoints', 'خصم كيلومترات التأخر', 1),
      number('attendancePoints', 'كيلومترات الحضور', 1),
      number('manualLateAttendancePoints', 'كيلومترات التأخير', 0),
      number('excusedAttendancePoints', 'كيلومترات الاستئذان', 0),
      text('attendanceAbsentTemplate', 'قالب رسالة الغياب', 'السلام عليكم، تم تسجيل غياب الطالب {name} بتاريخ {date}.', 'textarea'),
      toggle('automaticAbsenceMessageEnabled', 'رسالة الغياب التلقائية'),
      toggle('automaticExecutionMessageEnabled', 'رسالة تنفيذ الخطة التلقائية'),
      text('automaticExecutionMessageTime', 'وقت رسالة تنفيذ الخطة', '23:59', 'time'),
      text('executionReminderTemplate', 'قالب تذكير تنفيذ الخطة', 'السلام عليكم، لم يتم تنفيذ خطة الطالب {name} بتاريخ {date}.', 'textarea'),
    ],
  },
  {
    key: 'points', label: 'الكيلومترات والمتجر والترتيب', settings: [
      toggle('pointsSystemEnabled', 'نظام الكيلومترات'),
      toggle('studentRankingsVisible', 'إظهار ترتيب الطلاب', true),
      toggle('familyRankingsVisible', 'إظهار ترتيب الحلقات', true),
      toggle('rankingPointsVisible', 'عرض كيلومترات الترتيب', true),
      toggle('storeEnabled', 'المتجر'),
      toggle('storePurchaseDeductsRanking', 'خصم شراء المتجر من الترتيب'),
      toggle('teacherManualPointsEnabled', 'السماح للمعلم بالإضافة والخصم'),
      number('teacherManualPointsTermLimit', 'حد المعلم في الفصل', 100),
      { key: 'teacherPointTypes', label: 'أنواع إضافة وخصم المعلم', type: 'teacherPointTypes', defaultValue: [] },
      number('maxSupervisorStudentPoints', 'حد كيلومترات المشرف للطالب', 10),
      number('maxSupervisorFamilyItemsPoints', 'حد كيلومترات المشرف للحلقة', 100),
      number('maxSupervisorDeductionPoints', 'حد خصم المشرف', 10),
      toggle('familyPointsAddToStudents', 'إضافة كيلومترات الحلقة للطلاب', true),
      toggle('familyPointsAddToAbsentStudents', 'إضافة كيلومترات الحلقة للغائبين', true),
      toggle('studentPointsAddToFamily', 'إضافة كيلومترات الطالب للحلقة', true),
      select('familyEvaluationScope', 'نطاق تقييم الحلقة', 'program_supervisor', [
        { value: 'program_supervisor', label: 'مشرف البرنامج' },
        { value: 'all_supervisors', label: 'جميع المشرفين' },
      ]),
    ],
  },
  {
    key: 'registration', label: 'التسجيل والرسائل', settings: [
      toggle('registrationEnabled', 'فتح التسجيل'),
      toggle('learningPathsEnabled', 'البرامج والمسارات التعليمية'),
      text('registrationPreAcceptTemplate', 'قالب القبول المبدئي', '', 'textarea'),
      text('registrationAcceptTemplate', 'قالب القبول النهائي', '', 'textarea'),
      text('registrationRejectTemplate', 'قالب رفض التسجيل', '', 'textarea'),
      text('quranTestMessageTemplate', 'قالب رسالة الاختبار', '', 'textarea'),
      text('narrationStartTemplate', 'قالب بداية يوم السرد', '', 'textarea'),
      text('narrationEndTemplate', 'قالب نهاية يوم السرد', '', 'textarea'),
      text('narrationResultTemplate', 'قالب نتيجة يوم السرد', '', 'textarea'),
    ],
  },
  {
    key: 'tests', label: 'الاختبارات ويوم السرد', settings: [
      number('quranTestMaxScore', 'الاختبار — أصل الدرجة', 100, 1),
      number('quranTestWarningDeduction', 'الاختبار — خصم التنبيه', 1),
      number('quranTestMistakeDeduction', 'الاختبار — خصم الخطأ', 5),
      number('quranTestRetestScore', 'الاختبار — درجة الإعادة', 60),
      number('quranTestPassingScore', 'الاختبار — درجة الاجتياز', 85, 1),
      number('narrationMaxScore', 'السرد — أصل الدرجة', 100, 1),
      number('narrationWarningDeduction', 'السرد — خصم التنبيه', 1),
      number('narrationMistakeDeduction', 'السرد — خصم الخطأ', 5),
      ...evaluationFields('teacherEvaluation', 'تقييم المعلم', [100, 1, 5, 85]),
    ],
  },
  {
    key: 'evaluation', label: 'سياسات التسميع والتقييم', settings: [
      ...evaluationFields('memorizationEvaluation', 'الحفظ', [100, 2, 3, 95]),
      ...evaluationFields('memorizationQuarterFaceEvaluation', 'حفظ ربع وجه', [100, 2, 3, 95]),
      ...evaluationFields('memorizationHalfFaceEvaluation', 'حفظ نصف وجه', [100, 2, 3, 95]),
      ...evaluationFields('masteryEvaluation', 'الإتقان', [100, 2, 3, 95]),
      ...evaluationFields('masteryQuarterFaceEvaluation', 'إتقان ربع وجه', [100, 2, 3, 95]),
      ...evaluationFields('masteryHalfFaceEvaluation', 'إتقان نصف وجه', [100, 2, 3, 95]),
      ...evaluationFields('reviewEvaluation', 'المراجعة', [100, 1, 2, 85]),
      ...evaluationFields('linkEvaluation', 'الربط', [100, 1, 2, 85]),
      ...limitFields('teacherEvaluation', 'حدود تقييم المعلم', [1, 2, 2, 3, 3, 5]),
      ...limitFields('masteryEvaluation', 'حدود تقييم الإتقان', [1, 2, 2, 3, 3, 5]),
    ],
  },
  {
    key: 'access', label: 'صفحات النظام', settings: [
      toggle('studentsSectionEnabled', 'الطلاب', true),
      toggle('studentPlansSectionEnabled', 'خطط الطلاب', true),
      toggle('committeesSectionEnabled', 'الحلقات', true),
      toggle('usersRolesSectionEnabled', 'المستخدمون والصلاحيات', true),
      toggle('programsSectionEnabled', 'البرامج والمسارات', true),
      toggle('registrationRequestsSectionEnabled', 'طلبات التسجيل', true),
      toggle('quranTestsSectionEnabled', 'الاختبارات', true),
      toggle('narrationSectionEnabled', 'يوم السرد', true),
      toggle('culturalCompetitionSectionEnabled', 'المسابقات الثقافية', true),
      toggle('reportsSectionEnabled', 'التقارير والتصدير', true),
      toggle('callsSectionEnabled', 'المكالمات', true),
      toggle('rankingsSectionEnabled', 'الترتيب والمكافآت', true),
      toggle('storeSectionEnabled', 'المتجر والمنتجات', true),
      toggle('brandingSectionEnabled', 'الهوية والشعار', true),
      toggle('supportSectionEnabled', 'الدعم والتواصل', true),
      toggle('legalSectionEnabled', 'الصفحات القانونية', true),
      toggle('securitySectionEnabled', 'الدخول والأمان', true),
      toggle('deletionRequestsSectionEnabled', 'طلبات حذف الحساب', true),
      toggle('termClosureSectionEnabled', 'إنهاء الفترة', true),
    ],
  },
];

export const platformSettingsCatalog = platformSettingsGroups.flatMap((group) => group.settings);
export const platformSettingsByKey = new Map(platformSettingsCatalog.map((setting) => [setting.key, setting]));

export const platformFeatureSettingKeys = platformSettingsGroups
  .find((group) => group.key === 'access').settings.map((setting) => setting.key);
