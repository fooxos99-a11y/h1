import React from 'react';

const StudentMushafPageControls = ({ pageNumber }) => (
  <div className="absolute inset-x-[4%] bottom-0 z-30 flex h-11 items-center justify-center" data-recitation-control>
    <span
      className="absolute bottom-[4cqw] flex h-[7cqw] min-h-7 w-[12cqw] min-w-12 items-center justify-center rounded-full border border-border/80 bg-secondary text-[2.8cqw] font-black text-secondary-foreground shadow-sm [font-family:var(--font-ui)]"
      aria-label={`رقم الصفحة ${pageNumber}`}
    >
      {String(pageNumber)}
    </span>
  </div>
);

export default StudentMushafPageControls;
