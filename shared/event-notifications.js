export const eventNotificationDefinitions = [
  { key: 'program', label: 'إضافة برنامج', template: 'أُضيف برنامج جديد: {program}' },
  { key: 'station', label: 'إضافة محطة', template: 'أُضيفت محطة جديدة: {station}' },
  { key: 'violation', label: 'تسجيل مخالفة للطالب', template: 'سُجلت عليك مخالفة: {reason}' },
  { key: 'city', label: 'انتقال الطالب إلى مدينة جديدة', template: 'انتقلت إلى مدينة {city}' },
  { key: 'storeOrder', label: 'طلب جديد من المتجر', template: 'طلب {student} المنتج: {product}' },
];
export function normalizeEventNotifications(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(eventNotificationDefinitions.map(def => [def.key, {
    enabled: source[def.key]?.enabled === undefined ? def.key !== 'storeOrder' : source[def.key].enabled === true,
    template: String(source[def.key]?.template || def.template).trim().slice(0, 2000) || def.template,
    ...(def.key === 'storeOrder' ? { administrators: [...new Set((Array.isArray(source.storeOrder?.administrators) ? source.storeOrder.administrators : []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))] } : {}),
  }]));
}
export const formatEventNotification = (template, values) => template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
