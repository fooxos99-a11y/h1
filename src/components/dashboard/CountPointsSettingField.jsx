import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useRewardUnits from '@/hooks/useRewardUnits';

const CountPointsSettingField = ({
  label,
  countKey,
  pointsKey,
  unitLabel,
  settings,
  setSettings,
  defaultCount,
  defaultPoints,
}) => {
  const rewardUnits = useRewardUnits(settings.summitEnabled);
  const [open, setOpen] = useState(false);
  const [draftPoints, setDraftPoints] = useState(defaultPoints);
  const points = Math.max(0, Math.trunc(Number(settings[pointsKey] ?? defaultPoints)));

  const openEditor = () => {
    setDraftPoints(points);
    setOpen(true);
  };

  const savePoints = () => {
    setSettings((current) => ({
      ...current,
      [pointsKey]: Math.max(0, Math.trunc(Number(draftPoints || 0))),
    }));
    setOpen(false);
  };

  return (
    <div className="space-y-1.5 [font-family:var(--font-ui)]">
      <Label htmlFor={`setting-${countKey}`} className="text-xs sm:text-sm">{label}</Label>
      <Input
        id={`setting-${countKey}`}
        type="number"
        inputMode="numeric"
        min="1"
        value={settings[countKey] ?? defaultCount}
        onChange={(event) => setSettings((current) => ({
          ...current,
          [countKey]: Math.max(1, Number(event.target.value || 1)),
        }))}
      />
      <p className="text-[11px] font-normal text-muted-foreground">
        (كل {unitLabel} ={' '}
        <button
          type="button"
          className="min-h-6 px-0.5 font-normal text-blue-600 underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          onClick={openEditor}
          aria-label={rewardUnits.text(`تعديل كيلومترات كل ${unitLabel}`)}
        >
          {points}
        </button>{' '}
        {rewardUnits.short})
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle>{rewardUnits.text('كيلومترات')} كل {unitLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`points-${pointsKey}`}>{rewardUnits.text('عدد الكيلومترات')}</Label>
            <Input
              id={`points-${pointsKey}`}
              type="number"
              inputMode="numeric"
              min="0"
              autoFocus
              value={draftPoints}
              onChange={(event) => setDraftPoints(Math.max(0, Math.trunc(Number(event.target.value || 0))))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button type="button" onClick={savePoints}>تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CountPointsSettingField;
