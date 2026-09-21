export function correctionPageOptions(options = []) {
  const pages = new Map();
  for (const option of options) pages.set(Number(option.page), option);
  return [...pages.values()];
}
