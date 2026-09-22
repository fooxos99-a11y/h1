import React from 'react';
import InlineRecitationSelect from '@/components/portal/InlineRecitationSelect';
import { NAZEM_LINK_COUNT_MAX, normalizeNazemLinkCount } from '../../../shared/nazem-link-count.js';

const options = Array.from({ length: NAZEM_LINK_COUNT_MAX + 1 }, (_, value) => ({
  value,
  label: String(value),
}));

const NazemLinkCountSelector = ({ value, onChange, studentName = '' }) => (
  <div
    className="flex min-h-6 w-auto shrink-0 items-center justify-start gap-0 whitespace-nowrap text-right text-xs font-bold text-muted-foreground [font-family:var(--font-ui)] sm:text-sm"
    dir="rtl"
  >
    <span>الربط:</span>
    <InlineRecitationSelect
      ariaLabel={`عدد أوجه الربط${studentName ? ' لـ ' + studentName : ''}`}
      value={normalizeNazemLinkCount(value)}
      options={options}
      onValueChange={(nextValue) => onChange?.(normalizeNazemLinkCount(nextValue))}
    />
  </div>
);

export default NazemLinkCountSelector;
