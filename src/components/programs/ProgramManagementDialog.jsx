import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function ProgramManagementDialog({ program, onClose, onGrade, onEdit }) {
  const singleProgram = program ? [program] : [];
  const items = program?.sectionsEnabled ? program.sections || [] : singleProgram;
  return <Dialog open={Boolean(program)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent dir="rtl" className="max-w-2xl [font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>{program?.title}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">{items.map(item => (
        <Card key={item.id}><CardContent className="space-y-3 p-4">
          <h3 className="break-words font-bold">{item.title}</h3>
          {!item.questions?.length
            ? <Button className="min-h-11 w-full" onClick={() => onGrade(item)}>تسجيل النقاط</Button>
            : <Button variant="outline" className="min-h-11 w-full" onClick={() => onEdit(program)}>تعديل</Button>}
        </CardContent></Card>
      ))}</div>
    </DialogContent>
  </Dialog>;
}
