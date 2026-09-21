import React from 'react';
import RecitationEndSelector from '@/components/portal/RecitationEndSelector';
import InlineRecitationSelect from '@/components/portal/InlineRecitationSelect';
import { correctionPageOptions } from '../../../shared/execution-correction-options.js';

export default function ExecutionCorrectionEndSelector({ referenceMode, start, options = [], value, onChange, disabled }) {
  if (referenceMode !== 'page') return <fieldset disabled={disabled}><RecitationEndSelector start={start} options={options} value={value} onChange={onChange} /></fieldset>;
  const pages = correctionPageOptions(options);
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm font-bold [font-family:var(--font-ui)] [&_[role=combobox]]:!min-h-11 [&_[role=combobox]]:!min-w-11">
      <span>من وجه {start?.page} إلى وجه</span>
      <InlineRecitationSelect ariaLabel="وجه نهاية التنفيذ" disabled={disabled} value={value?.page}
        options={pages.map((option) => ({ value: option.page, label: option.page }))}
        onValueChange={(page) => { const option = pages.find((item) => Number(item.page) === Number(page)); if (option) onChange(option); }} />
    </div>
  );
}
