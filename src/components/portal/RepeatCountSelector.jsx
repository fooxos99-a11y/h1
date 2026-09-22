import React from 'react';
import InlineRecitationSelect from '@/components/portal/InlineRecitationSelect';
import { cn } from '@/lib/utils';

const RepeatCountSelector = ({
  value,
  max = 1,
  optionMax = null,
  editable = false,
  onChange,
  ariaLabel = 'عدد التكرارات',
  label = 'تكرار',
  pluralLabel = false,
  compact = false,
}) => {
  const maximum = Math.max(1, Math.trunc(Number(max || 1)));
  const selectableMaximum = optionMax == null
    ? maximum
    : Math.max(1, Math.trunc(Number(optionMax || 1)));
  const selected = Math.min(selectableMaximum, Math.max(1, Math.trunc(Number(value ?? maximum))));
  const countSuffix = (count) => (pluralLabel && Number(count) !== 1 ? 'مرات' : 'مرة');

  if (!editable) {
    const _resolveRepeatCountSelector = () => {
      if (!label) {
        return selected;
      }
      if (compact) {
        return `${label}: ${selected}`;
      }
      return `${label} ${selected} ${countSuffix(selected)}`;
    };
    return (
      <span
        className={cn(
          'flex min-h-6 items-center justify-start whitespace-nowrap text-right text-xs font-black leading-4 text-muted-foreground [font-family:var(--font-ui)] sm:text-sm',
          compact ? 'w-auto shrink-0' : 'w-full',
        )}
        dir="rtl"
      >
        {_resolveRepeatCountSelector()}
      </span>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-start text-right font-bold text-muted-foreground [font-family:var(--font-ui)]',
        compact ? 'min-h-6 w-auto shrink-0 gap-0 text-xs sm:text-sm' : 'min-h-9 w-full gap-1 text-xs',
      )}
      dir="rtl"
    >
      {label && <span>{compact ? `${label}:` : label}</span>}
      <InlineRecitationSelect
        ariaLabel={ariaLabel}
        value={selected}
        options={Array.from({ length: selectableMaximum }, (_, index) => ({
          value: index + 1,
          label: compact ? String(index + 1) : `${index + 1} ${countSuffix(index + 1)}`,
        }))}
        onValueChange={(nextValue) => onChange?.(Number(nextValue))}
      />
    </div>
  );
};

export default RepeatCountSelector;
