import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const getStudentName = (row) => row?.studentName || row?.student?.name || '';

const QuranTestAppointmentsDialog = ({ open, onOpenChange, rows, onOpenTest }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col border-primary/30 bg-card p-4 text-foreground sm:p-5" dir="rtl">
      <DialogHeader>
        <DialogTitle className="text-primary neon-text">مواعيد الاختبارات</DialogTitle>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-primary/20 p-8 text-center text-muted-foreground">
            لا توجد مواعيد مطابقة للاختيارات الحالية.
          </div>
        ) : rows.map((row) => (
          <div key={`${row.studentId}:${row.juz}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-primary/15 bg-background/70 p-3">
            <div className="min-w-0">
              <div className="truncate text-base font-black text-foreground">{getStudentName(row)}</div>
              <div className="truncate text-sm font-black text-primary">{row.juzLabel}</div>
              <div className="text-xs font-bold text-muted-foreground">
                الأجزاء غير المختبرة: {row.student?.availableJuzs?.length || 0}
              </div>
            </div>
            <Button
              size="icon"
              variant="outline"
              className="shrink-0"
              onClick={() => onOpenTest(row.student, row)}
              title="اختبار"
              aria-label={`اختبار ${getStudentName(row)}`}
            >
              <ClipboardCheck className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </DialogContent>
  </Dialog>
);

export default QuranTestAppointmentsDialog;
