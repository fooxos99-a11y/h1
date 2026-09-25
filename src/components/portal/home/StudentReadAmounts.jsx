import React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StudentReadAmounts({ groups, onRead }) {
  if (!groups.length) return null;
  return <div className="student-home-task-grid">{groups.map((group) => (
    <Button key={group.type} variant="outline" className="student-home-task" disabled={!group.target} onClick={() => onRead(group.target)}>
      <span>{group.label}{group.complete && <Check size={15} aria-label="مكتمل" />}</span>
      {!group.complete && <small>{group.amount}</small>}
    </Button>
  ))}</div>;
}
