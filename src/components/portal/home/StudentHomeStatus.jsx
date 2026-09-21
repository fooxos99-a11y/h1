import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StudentHomeStatus({ message, onRetry }) {
  return <div className="student-home-status" role="status"><span>{message}</span><Button variant="ghost" onClick={onRetry}><RotateCcw size={15} />إعادة المحاولة</Button></div>;
}
