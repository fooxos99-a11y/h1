import React from 'react';
import SummitMapTextInput from '@/components/dashboard/SummitMapTextInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleSwitch } from '@/components/ui/setting-toggle';
import { SUMMIT_MAP_CHALLENGES } from '../../../shared/summit.js';

const SummitMapEventFields = ({
  entity,
  idPrefix,
  maximumKilometer = 7999,
  isStation = false,
  active = false,
  onActiveChange,
  onChange,
}) => (
  <div className="grid gap-4 sm:grid-cols-2 [font-family:var(--font-ui)]" dir="rtl">
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-name`}>الاسم</Label>
      <SummitMapTextInput id={`${idPrefix}-name`} value={entity.name} maxLength={60} onCommit={(name) => onChange({ name })} />
    </div>
    {!isStation && <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-kilometer`}>كيلومتر الوصول</Label>
      <Input id={`${idPrefix}-kilometer`} type="number" min="0" max={maximumKilometer} value={entity.kilometer} onChange={(event) => onChange({ kilometer: event.target.value })} />
    </div>}
    {isStation && (
      <div className="flex items-end">
        <Button
          type="button"
          variant={active ? 'destructive' : 'default'}
          className="h-11 w-full touch-manipulation"
          onClick={() => onActiveChange?.(!active)}
        >
          {active ? 'إنهاء المحطة' : 'تفعيل المحطة'}
        </Button>
      </div>
    )}
    <div className="grid grid-cols-2 gap-2 sm:col-span-2">
      <div className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-primary/15 px-3">
        <Label className="font-black">الإشعار</Label>
        <ToggleSwitch ariaLabel="إشعار عند الوصول" checked={entity.notificationEnabled} onCheckedChange={(checked) => onChange({ notificationEnabled: checked })} />
      </div>
      <div className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-primary/15 px-3">
        <Label className="font-black">التحدي</Label>
        <ToggleSwitch ariaLabel="تحدٍّ عند الوصول" checked={entity.challengeEnabled} onCheckedChange={(checked) => onChange({ challengeEnabled: checked })} />
      </div>
    </div>
    {entity.notificationEnabled && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${idPrefix}-notification`}>نص الإشعار</Label><SummitMapTextInput id={`${idPrefix}-notification`} value={entity.notificationText} maxLength={180} onCommit={(notificationText) => onChange({ notificationText })} /></div>}
    {entity.challengeEnabled && <>
      <div className="space-y-1.5"><Label>نوع التحدي</Label><Select value={entity.challengeType} onValueChange={(challengeType) => onChange({ challengeType })}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{SUMMIT_MAP_CHALLENGES.map((challenge) => <SelectItem key={challenge.type} value={challenge.type}>{challenge.title}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-reward`}>مكافأة الفوز بالتحدي</Label><Input id={`${idPrefix}-reward`} type="number" min="0" max="10000" value={entity.rewardPoints} onChange={(event) => onChange({ rewardPoints: event.target.value })} /></div>
    </>}
  </div>
);

export default SummitMapEventFields;
