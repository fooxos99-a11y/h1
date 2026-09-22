import NotificationButton from '@/components/notifications/NotificationButton';
import React, { useState } from 'react';
import useMediaQuery from '@/hooks/useMediaQuery';
import { BookOpen, CalendarDays, LogOut, PhoneCall, ShoppingBag, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import RankingPointsValue from '@/components/points/RankingPointsValue';
import StudentHomeProgress from './StudentHomeProgress';

export default function StudentHomeHeader({ points, progress, progressLabel = "تقدم الطالب", level, showLevel = true, storeEnabled, programsEnabled, onOpen, onLogout }) {
  const mobile = useMediaQuery('(max-width: 899px)');
  const [open, setOpen] = useState(false);
  const select = (key) => { setOpen(false); onOpen(key); };
  const _resolveTitle = () => {
    if (!showLevel) {
      return 'الحساب';
    }
    if (level == null) {
      return 'تحميل المستوى';
    }
    return `المستوى ${level} من 100`;
  };
  const _resolveConditional = () => {
    if (!showLevel) {
      return <User size={24} />;
    }
    if (level == null) {
      return '—';
    }
    return Number(level).toLocaleString('ar-SA-u-nu-latn');
  };
  return <header className="student-home-header"><div className="student-home-header-inner">
    <div className="student-home-account-group"><Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="ghost" className="student-home-level !text-white" aria-label="قائمة حساب الطالب" title={_resolveTitle()}>{_resolveConditional()}</Button></PopoverTrigger>
      <PopoverContent align="end" className="student-home-account-menu" dir="rtl" aria-label="الحساب">
        <div className="student-home-points" aria-label="إجمالي النقاط">{points == null ? <span>—</span> : <RankingPointsValue value={points} />}</div>
        {[[CalendarDays, 'الجلسات', 'sessions'], [PhoneCall, 'المكالمات', 'calls'], ...(!mobile && programsEnabled ? [[BookOpen, 'البرامج', 'programs']] : [])].map(([Icon, label, key]) => <Button variant="ghost" key={key} className="student-home-menu-item" onClick={() => select(key)}><Icon size={18} /><span>{label}</span></Button>)}
        <Button variant="ghost" className="student-home-menu-item text-destructive" onClick={onLogout}><LogOut size={18} /><span>تسجيل الخروج</span></Button>
      </PopoverContent>
    </Popover>{showLevel && <StudentHomeProgress value={progress} label={progressLabel} className="student-home-header-progress" />}</div>
    <div className="student-home-header-actions">{storeEnabled && <Button className="student-home-store" aria-label="المتجر" onClick={() => onOpen('store')}><ShoppingBag size={20} /></Button>}<NotificationButton presentation="popover" /></div>
  </div></header>;
}
