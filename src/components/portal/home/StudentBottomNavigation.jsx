import React from 'react';
import { BookOpen, Home, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StudentBottomNavigation({ view, onNavigate, storeEnabled, programsEnabled }) {
  return <nav className="student-bottom-navigation" aria-label="تنقل الطالب">
    {[[null, 'الرئيسية', Home], ...(programsEnabled ? [['programs', 'البرامج', BookOpen]] : []), ...(storeEnabled ? [['store', 'المتجر', ShoppingBag]] : [])].map(([key, label, Icon]) => <Button key={label} variant="ghost" aria-current={view === key ? 'page' : undefined} onClick={() => onNavigate(key)}><Icon size={21} /><span>{label}</span></Button>)}
  </nav>;
}
