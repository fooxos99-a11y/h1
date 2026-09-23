import React, { lazy, Suspense, useState } from 'react';
import SectionTabs from '@/components/ui/section-tabs';
import DashboardLoader from '@/components/dashboard/DashboardLoader';

const panels = {
  students: lazy(() => import('./StudentsSection')),
  supervisors: lazy(() => import('./SupervisorsSection')),
  reciters: lazy(() => import('./RecitersSection')),
  administrators: lazy(() => import('./AdministratorsSection')),
};

export default function UsersSection({ tabs = [] }) {
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('tab'));
  const active = tabs.some(({ key }) => key === selected) ? selected : tabs[0]?.key;
  const Panel = panels[active];
  if (!Panel) return null;
  return <SectionTabs
    label="فئات المستخدمين"
    items={tabs.map(({ key, label }) => ({ value: key, label }))}
    value={active}
    onChange={setSelected}
    className="[font-family:var(--font-ui)] [&_.section-tabs-list]:mb-4 [&_.section-tabs-list]:grid [&_.section-tabs-list]:grid-cols-2 [&_.section-tabs-list]:gap-1 [&_.section-tabs-list]:rounded-xl [&_.section-tabs-list]:bg-muted [&_.section-tabs-list]:p-1 sm:[&_.section-tabs-list]:flex [&_[role=tab]]:min-h-11 [&_[role=tab]]:flex-1 [&_[aria-selected=true]]:bg-card [&_[aria-selected=true]]:text-primary"
  >
    <Suspense fallback={<DashboardLoader />}><Panel key={active} /></Suspense>
  </SectionTabs>;
}
