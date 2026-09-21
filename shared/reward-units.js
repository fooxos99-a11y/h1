const KILOMETER_REPLACEMENTS = [
  [/كيلومترات/g, 'نقاط'],
  [/كيلومتر/g, 'نقطة'],
  [/(\d|[٠-٩])\s*كم/g, '$1 نقطة'],
];

const POINT_REPLACEMENTS = [
  [/نقاط/g, 'كيلومترات'],
  [/نقطة/g, 'كيلومتر'],
];

export const localizeRewardText = (value, summitEnabled = false) => {
  let text = String(value ?? '');
  const replacements = summitEnabled ? POINT_REPLACEMENTS : KILOMETER_REPLACEMENTS;
  replacements.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
  return text;
};

export const getRewardUnits = (summitEnabled = false) => ({
  summitEnabled: Boolean(summitEnabled),
  plural: summitEnabled ? 'كيلومترات' : 'نقاط',
  singular: summitEnabled ? 'كيلومتر' : 'نقطة',
  short: summitEnabled ? 'كم' : 'نقطة',
  text: (value) => localizeRewardText(value, summitEnabled),
  format: (value) => `${Number(value || 0).toLocaleString('ar-SA')} ${summitEnabled ? 'كم' : 'نقطة'}`,
});
