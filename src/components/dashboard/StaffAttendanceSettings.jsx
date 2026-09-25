import React from 'react';
import SettingsGroup from './SettingsGroup';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Edit staff attendance source, grace period and location through the shared controls. */
export default function StaffAttendanceSettings({ settings, setSettings, children }) {
  return (<SettingsGroup>
    <h3 className="text-sm font-black text-primary">التحضير</h3>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>تحضير الكادر عن طريق</Label>
        <Select
          value={settings.staffAttendanceSource || 'supervisor'}
          onValueChange={(value) => setSettings({ ...settings, staffAttendanceSource: value })}
        >
          <SelectTrigger aria-label="تحضير الكادر عن طريق" className="h-11 border-primary/30 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="supervisor">المشرف</SelectItem>
            <SelectItem value="teacher">حساباتهم</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {children}
      {settings.staffAttendanceSource === 'teacher' && (
        <div className="space-y-2">
          <Label htmlFor="staffAttendanceLateAfterAsrMinutes">وقت التأخير بعد صلاة العصر</Label>
          <div className="relative">
            <Input
              id="staffAttendanceLateAfterAsrMinutes"
              type="number"
              min="0"
              max="1440"
              inputMode="numeric"
              value={settings.staffAttendanceLateAfterAsrMinutes}
              onChange={(event) => setSettings({ ...settings, staffAttendanceLateAfterAsrMinutes: event.target.value })}
              className="h-11 border-primary/30 bg-card pe-16"
            />
            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm font-bold text-muted-foreground">دقيقة</span>
          </div>
        </div>
      )}
    </div>
    {settings.staffAttendanceSource === 'teacher' && (
      <div className="space-y-2">
        <Label htmlFor="staffAttendanceLocationUrl">رابط موقع التحضير</Label>
        <Input
          id="staffAttendanceLocationUrl"
          type="url"
          dir="ltr"
          value={settings.staffAttendanceLocationUrl || ''}
          onChange={(event) => setSettings({ ...settings, staffAttendanceLocationUrl: event.target.value })}
          className="h-11 border-primary/30 bg-card text-left"
        />
      </div>
    )}
  </SettingsGroup>);
}
