import React from 'react';

export default function NazemIssueDate({ value, label = 'آخر رصد للخطأ' }) {
  if (!value) return null;
  return <div className="mt-1 text-xs font-medium text-muted-foreground [font-family:var(--font-ui)]">
    {label}: <time dir="ltr" dateTime={String(value).replace(' ', 'T')}>{value}</time>
  </div>;
}
