function formatListening(value) {
  if (value == null) return '-';
  return value ? 'نعم' : 'لا';
}

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getTaskSummary, formatReportFaces } from '../../../shared/report-faces.js';
import useRewardUnits from '@/hooks/useRewardUnits';

const formatNumber = (value = 0) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');
const percent = (value = 0) => `${formatNumber(value)}%`;

const TaskAmount = ({ summary, label = '' }) => {
  const content = formatReportFaces(summary?.faces);
  return (
    <div className="min-w-0" title={content === '-' ? undefined : content}>
      {label && <span className="font-black text-muted-foreground">{label}: </span>}
      <span className="text-foreground">{content}</span>
    </div>
  );
};

const RatioValue = ({ done = 0, expected = 0 }) => (
  <span dir="rtl" className="inline-flex items-center justify-center gap-1 tabular-nums">
    <span>{formatNumber(expected)}</span>
    <span className="text-muted-foreground">/</span>
    <span>{formatNumber(done)}</span>
  </span>
);

const attendanceLabels = {
  present: 'حاضر',
  late: 'متأخر',
  excused: 'مستأذن',
  absent: 'غائب',
  no_session: 'لا توجد جلسة',
};

const attendanceClasses = {
  present: 'text-emerald-600 dark:text-emerald-400',
  late: 'text-amber-600 dark:text-amber-400',
  excused: 'text-sky-600 dark:text-sky-400',
  absent: 'text-red-600 dark:text-red-400',
  no_session: 'text-muted-foreground',
};


const executionTypeLabels = { normal: 'طبيعي', compensation: 'تعويض', extra: 'زيادة خارج الخطة' };

const HeaderCell = ({ children }) => (
  <div className="px-2 py-2 text-center text-[11px] font-black text-muted-foreground sm:text-xs">{children}</div>
);

const ValueCell = ({ children, className = '', title }) => (
  <div
    className={`min-w-0 px-2 py-2 text-center text-xs font-black text-foreground sm:text-sm ${className}`}
    title={title}
  >
    {children}
  </div>
);

const DailyDetails = ({ row, items = [], nazemManaged = false }) => {
  const rewardUnits = useRewardUnits();
  const amountValue = (date, type, track = null) => formatReportFaces(getTaskSummary(row, type, true, { from: date }, track).faces);
  return (
  <div className="grid gap-2 border-t border-primary/10 bg-background/45 p-3 sm:grid-cols-2 xl:grid-cols-3">
    {items.map((item) => { const _resolveDailyDetails = () => {
                             if (item.listening == null) {
                               return '-';
                             }
                             if (item.listening) {
                               return 'نعم';
                             }
                             return 'لا';
                           };
                           return (<div key={item.date} className="rounded-xl border border-primary/15 bg-card/70 p-3 text-xs font-bold">
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-primary/10 pb-2">
          <span className="font-black text-foreground" dir="ltr">{item.date}</span>
          <span className={attendanceClasses[item.attendanceStatus] || 'text-muted-foreground'}>
            {attendanceLabels[item.attendanceStatus] || '-'}
          </span>
        </div>
        <div className="space-y-1.5 text-right leading-6">
          <div>
            <span className="text-muted-foreground">المحفوظ:</span>{' '}
            {amountValue(item.date, 'memorization', 'memorization')}
            {item.memorization && item.memorizationStatus === 'partial' && (
              <span className="mr-1 text-amber-600 dark:text-amber-400">(تنفيذ جزئي)</span>
            )}
          </div>
          <div><span className="text-muted-foreground">التكرار:</span> {item.repeat == null ? '-' : `${formatNumber(item.repeat)} مرة`}</div>
          <div><span className="text-muted-foreground">السماع:</span> {_resolveDailyDetails()}</div>
          {item.masteryStatus !== 'no_plan' && (
            <div><span className="text-muted-foreground">الإتقان:</span> {amountValue(item.date, 'memorization', 'mastery')}</div>
          )}
          <div><span className="text-muted-foreground">المراجعة:</span> {amountValue(item.date, 'review')}</div>
          <div><span className="text-muted-foreground">الربط:</span> {amountValue(item.date, 'link')}</div>
          {item.evaluation && <div><span className="text-muted-foreground">التقييم:</span> {item.evaluation}</div>}
          {Object.entries(item.executionBreakdown || {})
            .filter(([type]) => !nazemManaged || type === 'normal')
            .map(([type, values]) => (
            <div key={type}>
              <span className="text-muted-foreground">{executionTypeLabels[type] || type}:</span>{' '}
              {formatNumber(values.amountFaces)} وجه، {rewardUnits.format(values.pointsAwarded)}
            </div>
          ))}
        </div>
      </div>); })}
  </div>
  );
};

const ReportsProgress = ({ rows = [], period = null }) => {
  const [selectedDetails, setSelectedDetails] = useState(null);
  const isDaily = period?.mode === 'daily';
  if (rows.length === 0) return (
    <div className="rounded-2xl border border-dashed border-primary/20 p-8 text-center text-muted-foreground">
      لا توجد بيانات إنجاز ضمن الفترة المحددة.
    </div>
  );

  return (
    <>
      <div>
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => {
          const todayDetails = row.dailyDetails?.[0];
          const memorization = getTaskSummary(row, 'memorization', isDaily, period, 'memorization');
          const mastery = getTaskSummary(row, 'memorization', isDaily, period, 'mastery');
          const review = getTaskSummary(row, 'review', isDaily, period);
          const link = getTaskSummary(row, 'link', isDaily, period);
          return (
            <article key={row.id} className="rounded-xl border border-primary/20 bg-card/50 p-3">
              <div className="flex items-start justify-between gap-3 border-b border-primary/10 pb-2">
                <div className="min-w-0 text-right">
                  <div className="truncate text-sm font-black text-foreground">{row.name}</div>
                  <TaskAmount summary={memorization} label="مقدار الحفظ" />
                  <div className="truncate text-xs font-bold text-muted-foreground">{row.committeeName || 'بدون حلقة'}</div>
                </div>
                <div className="shrink-0 text-left">
                  <div className="text-[10px] font-black text-muted-foreground">نسبة الإنجاز</div>
                  <div className="text-lg font-black text-primary">{percent(row.overallPercentage)}</div>
                </div>
              </div>
              <div className="mt-2 grid gap-2 text-xs font-bold">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">الحضور</span>
                  {isDaily ? (
                    <span className={attendanceClasses[todayDetails?.attendanceStatus] || 'text-muted-foreground'}>
                      {attendanceLabels[todayDetails?.attendanceStatus] || '-'}
                    </span>
                  ) : <RatioValue done={row.attendance?.attended} expected={row.attendance?.expected} />}
                </div>
                <TaskAmount summary={review} label="المراجعة" />
                <TaskAmount summary={link} label="الربط" />
                {mastery.hasItems && <TaskAmount summary={mastery} label="الإتقان" />}
                {isDaily && (
                  <>
                    <div><span className="text-muted-foreground">التكرار:</span> {todayDetails?.repeat == null ? '-' : `${formatNumber(todayDetails.repeat)} مرة`}</div>
                    <div><span className="text-muted-foreground">السماع:</span> {formatListening(todayDetails?.listening)}</div>
                  </>
                )}
                {!row.nazemManaged && <div><span className="text-muted-foreground">النقص الحالي:</span> {formatNumber(row.planProgress?.shortageFaces)} وجه</div>}
              </div>
              {!isDaily && row.dailyDetails?.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full border-primary/20"
                  onClick={() => setSelectedDetails(row)}
                >
                  التفاصيل اليومية
                </Button>
              )}
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-primary/20 md:block">
        <div className="overflow-x-auto [scrollbar-color:hsl(var(--primary)/0.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/30 [&::-webkit-scrollbar-track]:bg-transparent">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(240px,1.7fr)_105px_minmax(170px,1.2fr)_minmax(170px,1.2fr)_110px] bg-background/80">
              <HeaderCell>الطالب</HeaderCell>
              <HeaderCell>الحضور</HeaderCell>
              <HeaderCell>المراجعة</HeaderCell>
              <HeaderCell>الربط</HeaderCell>
              <HeaderCell>نسبة الإنجاز</HeaderCell>
            </div>

            {rows.map((row) => {
              const todayDetails = row.dailyDetails?.[0];
              const memorization = getTaskSummary(row, 'memorization', isDaily, period, 'memorization');
              const mastery = getTaskSummary(row, 'memorization', isDaily, period, 'mastery');
              const review = getTaskSummary(row, 'review', isDaily, period);
              const link = getTaskSummary(row, 'link', isDaily, period);
              const hasDetails = !isDaily && row.dailyDetails?.length > 0;
              return (
                <div key={row.id} className="border-t border-primary/10 bg-card/35">
                  <div className="grid grid-cols-[minmax(240px,1.7fr)_105px_minmax(170px,1.2fr)_minmax(170px,1.2fr)_110px] items-center">
                    <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-foreground">{row.name}</div>
                        <div className="line-clamp-2 text-[11px] font-bold leading-5">
                          <TaskAmount summary={memorization} label="مقدار الحفظ" />
                        </div>
                        <div className="truncate text-[11px] font-bold text-muted-foreground">{row.committeeName || 'بدون حلقة'}</div>
                        {mastery.hasItems && <div className="text-[11px] font-bold"><TaskAmount summary={mastery} label="الإتقان" /></div>}
                        {isDaily && <div className="text-[10px] font-bold text-muted-foreground">التكرار: {todayDetails?.repeat == null ? '-' : `${formatNumber(todayDetails.repeat)} مرة`}، السماع: {formatListening(todayDetails?.listening)}</div>}
                        {!row.nazemManaged && <div className="text-[10px] font-black text-amber-600">النقص: {formatNumber(row.planProgress?.shortageFaces)} وجه</div>}
                      </div>
                      {hasDetails && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mr-auto h-8 shrink-0 px-2 text-[11px]"
                          onClick={() => setSelectedDetails(row)}
                        >
                          التفاصيل اليومية
                        </Button>
                      )}
                    </div>
                    <ValueCell className={isDaily ? (attendanceClasses[todayDetails?.attendanceStatus] || 'text-muted-foreground') : ''}>
                      {isDaily
                        ? (attendanceLabels[todayDetails?.attendanceStatus] || '-')
                        : <RatioValue done={row.attendance?.attended} expected={row.attendance?.expected} />}
                    </ValueCell>
                    <ValueCell className="text-right leading-5"><TaskAmount summary={review} /></ValueCell>
                    <ValueCell className="text-right leading-5"><TaskAmount summary={link} /></ValueCell>
                    <ValueCell className="text-primary">{percent(row.overallPercentage)}</ValueCell>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      <Dialog open={Boolean(selectedDetails)} onOpenChange={(open) => !open && setSelectedDetails(null)}>
        <DialogContent className="max-w-4xl p-0" dir="rtl">
          <DialogHeader className="border-b border-primary/15 px-4 py-4 sm:px-6">
            <DialogTitle>
              التفاصيل اليومية{selectedDetails?.name ? ` - ${selectedDetails.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[75dvh] overflow-y-auto">
            <DailyDetails
              row={selectedDetails}
              items={selectedDetails?.dailyDetails || []}
              nazemManaged={selectedDetails?.nazemManaged}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReportsProgress;
