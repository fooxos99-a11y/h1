import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ProgramEditorDialog from '@/components/dashboard/ProgramEditorDialog';
import useRewardUnits from '@/hooks/useRewardUnits';

export default function ProgramSectionsEditor({ sections, onChange }) {
  const [editing, setEditing] = useState(null);
  const units = useRewardUnits();
  return <div className="space-y-3 [font-family:var(--font-ui)]">
    {sections.map((section, index) => <Card key={section.id || index}><CardContent className="flex flex-wrap items-center gap-3 p-4">
      <span className="min-w-0 flex-1 break-words font-bold">{section.title}</span>
      <span>{units.format(section.pointsReward)}</span>
      <Button variant="outline" onClick={() => setEditing(index)}>تعديل</Button>
      <Button variant="outline" onClick={() => onChange(sections.filter((_, itemIndex) => itemIndex !== index))}>حذف</Button>
    </CardContent></Card>)}
    <Button variant="outline" onClick={() => setEditing(sections.length)}>إضافة قسم</Button>
    <ProgramEditorDialog open={editing !== null} program={sections[editing] || null} sectionMode saving={false}
      onOpenChange={open => { if (!open) setEditing(null); }}
      onSave={section => {
        const next = [...sections];
        next[editing] = { ...section, id: sections[editing]?.id };
        onChange(next); setEditing(null);
      }} />
  </div>;
}
