import React from 'react';
import StudentHomeRankings from '@/components/portal/home/StudentHomeRankings';
import '@/components/portal/home/student-home.css';

export default function RankingsSection() {
  return <div className="student-home !min-h-0 !bg-transparent !p-0" dir="rtl"><StudentHomeRankings /></div>;
}
