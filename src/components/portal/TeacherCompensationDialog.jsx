import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatContinuousRecitationRange, sortRecitationTasks } from '@/lib/recitationTaskRanges';
import { getQuranTaskLabel } from '@/lib/quranTaskLabels';

const dateLabel = date => date.split('-').reverse().join('/');

export default function TeacherCompensationDialog({ student, groups, onClose, onRecite }) {
  return <Dialog open={Boolean(student)} onOpenChange={open => !open && onClose()}>
    <DialogContent dir="rtl" className="max-w-sm [font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>{`تعويض ${student?.studentName || ''}`}</DialogTitle></DialogHeader>
      <div className="max-h-[60dvh] space-y-2 overflow-y-auto">
        {groups.map(group => <Button key={group.key} type="button" variant="outline"
          className="h-auto min-h-11 w-full flex-col items-stretch gap-1 whitespace-normal p-3 text-start"
          onClick={() => { onClose(); onRecite({ ...student, tasks: sortRecitationTasks(group.tasks), compensation: true }); }}>
          <span className="flex items-center justify-between gap-2"><span>{getQuranTaskLabel(group.tasks[0])}</span><span className="text-xs" dir="ltr">{dateLabel(group.taskDate)}</span></span>
          <span className="text-xs font-normal">{formatContinuousRecitationRange(group.tasks)}</span>
        </Button>)}
      </div>
    </DialogContent>
  </Dialog>;
}
