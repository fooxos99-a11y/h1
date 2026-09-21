const toAsciiDigits = (value = '') => String(value).replace(/[٠-٩۰-۹]/g, (digit) => {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicIndex = arabicDigits.indexOf(digit);
  return String(arabicIndex >= 0 ? arabicIndex : persianDigits.indexOf(digit));
});

export function normalizeOptionalAccountNumber(value, label = 'الرقم') {
  const digits = toAsciiDigits(value).replace(/\D/g, '');
  if (digits.length > 40) throw new RangeError(`${label} يجب ألا يتجاوز 40 رقمًا.`);
  return digits;
}
