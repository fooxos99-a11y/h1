import React from 'react';
import StudentNewsCard from '@/components/portal/home/StudentNewsCard';
import '@/components/portal/home/student-home.css';

// Renders the draft with the student's own news card inside a phone-sized student home.
export default function NewsPhonePreview({ entry, className = '' }) {
  const news = { entries: [{ ...entry, title: entry.title.trim() || 'الخبر' }] };
  return <section aria-label="معاينة الخبر" className={`min-w-0 space-y-2 ${className}`}>
    <h3 className="text-sm font-medium">معاينة جوال الطالب</h3>
    <div className="mx-auto w-full max-w-[372px] overflow-hidden rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 shadow-lg">
      <div className="student-home !min-h-0 !p-0" dir="rtl">
        <div aria-hidden="true" className="flex h-14 items-center justify-between border-b border-[#e7eef1] bg-white px-4">
          <span className="flex items-center gap-2"><span className="h-9 w-9 rounded-full bg-[#09626f]" /><span className="h-2.5 w-20 rounded-full bg-[#e8eef1]" /></span>
          <span className="h-9 w-9 rounded-xl bg-[#eaf5f5]" />
        </div>
        <div className="grid gap-[18px] px-4 pb-8 pt-6">
          <StudentNewsCard news={news} active={false} phone />
          <div aria-hidden="true" className="h-24 rounded-[22px] border border-[#dce7eb] bg-white" />
        </div>
      </div>
    </div>
  </section>;
}
