import React from 'react';

const ProgramChoiceIndicator = ({ selected = false }) => (
  <span
    aria-hidden="true"
    className={`h-5 w-5 shrink-0 rounded-full border transition-all ${
      selected
        ? 'border-transparent bg-primary shadow-[0_3px_9px_hsl(var(--primary)/.24)]'
        : 'border-slate-300 bg-background'
    }`}
  />
);

export default ProgramChoiceIndicator;
