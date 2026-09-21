import React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CommitteeMultiSelect = ({ committees = [], value = [], onChange }) => {
  const selected = new Set((Array.isArray(value) ? value : []).map(String));
  const allSelected = selected.has('all');

  const selectAll = () => onChange?.(['all']);
  const toggleCommittee = (committeeId) => {
    const id = String(committeeId);
    const next = new Set(allSelected ? [] : selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange?.([...next]);
  };

  const optionClassName = (checked) => `min-h-11 justify-start gap-2 touch-manipulation [font-family:var(--font-ui)] ${checked ? 'border-primary bg-primary/10 text-primary' : 'border-primary/20 bg-background'}`;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="حلقات يوم السرد" dir="rtl">
      <Button type="button" variant="outline" role="checkbox" aria-checked={allSelected} onClick={selectAll} className={optionClassName(allSelected)}>
        <span className="flex h-5 w-5 items-center justify-center rounded border border-current">{allSelected && <Check className="h-4 w-4" />}</span>
        جميع الحلقات
      </Button>
      {committees.map((committee) => {
        const checked = !allSelected && selected.has(String(committee.id));
        return (
          <Button key={committee.id} type="button" variant="outline" role="checkbox" aria-checked={checked} onClick={() => toggleCommittee(committee.id)} className={optionClassName(checked)}>
            <span className="flex h-5 w-5 items-center justify-center rounded border border-current">{checked && <Check className="h-4 w-4" />}</span>
            <span className="truncate">{committee.name}</span>
          </Button>
        );
      })}
    </div>
  );
};

export default CommitteeMultiSelect;
