import React from 'react';

export default function StudentHomeProgress({ value = 0, label, className = '' }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className={`student-home-progress ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>;
}
