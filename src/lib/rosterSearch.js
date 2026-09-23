import { normalizeArabicPersonName } from '../../shared/nazem-integration.js';

export function filterRosterByName(rows, search) {
  const terms = normalizeArabicPersonName(search).split(' ').filter(Boolean);
  return rows.filter(row => {
    const name = normalizeArabicPersonName(row.name);
    return terms.every(term => name.includes(term));
  });
}

export function selectVisibleRoster(current, visible, checked) {
  const ids = visible.map(row => row.id);
  return checked ? [...new Set([...current, ...ids])] : current.filter(id => !ids.includes(id));
}
