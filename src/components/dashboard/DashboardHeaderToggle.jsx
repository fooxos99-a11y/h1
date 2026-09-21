import React from 'react';
import { ToggleSwitch } from '@/components/ui/setting-toggle';

const DashboardHeaderToggle = ({
  label,
  checked,
  disabled = false,
  onCheckedChange,
  hideLabelBelow = 'sm',
}) => {
  const labelVisibility = hideLabelBelow === 'lg' ? 'hidden lg:inline' : 'hidden sm:inline';

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 [font-family:var(--font-ui)]" dir="rtl">
      <span className={`${labelVisibility} whitespace-nowrap text-xs font-black text-foreground`}>
        {label}
      </span>
      <ToggleSwitch
        ariaLabel={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
};

export default DashboardHeaderToggle;
