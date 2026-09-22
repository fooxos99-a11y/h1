import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/** Require the existing explicit confirmation before requesting term closure. */
export default function EndTermDialog({ endTermOpen, setEndTermOpen, rewardUnits, termClosureSummary, endTermConfirmText, setEndTermConfirmText, endTerm, isEndingTerm }) {
  return (<Dialog open={endTermOpen} onOpenChange={setEndTermOpen}>
    <DialogContent className="max-w-md border-primary/30 bg-card text-foreground" dir="rtl">
      <DialogHeader>
        <DialogTitle className="text-primary">تأكيد إنهاء الفصل</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <p className="text-sm font-bold leading-7 text-muted-foreground">
          {rewardUnits.text(`${termClosureSummary} اكتب إنهاء الفصل للتأكيد.`)}
        </p>
        <Input
          aria-label="تأكيد إنهاء الفصل"
          value={endTermConfirmText}
          onChange={(event) => setEndTermConfirmText(event.target.value)}
          placeholder="إنهاء الفصل"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => setEndTermOpen(false)}>
          إغلاق
        </Button>
        <Button
          type="button"
          onClick={endTerm}
          disabled={isEndingTerm || endTermConfirmText.trim() !== 'إنهاء الفصل'}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isEndingTerm ? 'جاري التنفيذ...' : 'تأكيد'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>);
}
