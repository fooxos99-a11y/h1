import React from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import SettingToggle from '@/components/ui/setting-toggle';
import DashboardHeaderToggle from '@/components/dashboard/DashboardHeaderToggle';
import useMediaQuery from '@/hooks/useMediaQuery';

export default function StoreSettingsActions({ configuration, saving, onChange, deductionLabel }) {
  const mobile = useMediaQuery('(max-width: 767px)');
  const Toggle = mobile ? SettingToggle : DashboardHeaderToggle;
  const controls = <div className={mobile ? 'space-y-4' : 'flex items-center gap-2'} dir="rtl">
    <Toggle label="تفعيل المتجر" checked={configuration.storeEnabled} disabled={!configuration.pointsSystemEnabled || saving} onCheckedChange={(storeEnabled) => onChange({ storeEnabled })} />
    {configuration.storeEnabled && <Toggle label={deductionLabel} checked={configuration.storePurchaseDeductsRanking} disabled={saving} onCheckedChange={(storePurchaseDeductsRanking) => onChange({ storePurchaseDeductsRanking })} />}
  </div>;
  if (!mobile) return controls;
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="icon" className="h-11 w-11" aria-label="إعدادات المتجر"><Settings className="h-5 w-5" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-72 max-w-[calc(100vw-24px)] [font-family:var(--font-ui)]">{controls}</PopoverContent>
  </Popover>;
}
