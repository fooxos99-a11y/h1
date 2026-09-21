import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StudentHomeAction({ children, onClick }) {
  return <Button className="student-home-primary student-home-feature-action" onClick={onClick}>{children}<ArrowLeft size={18} aria-hidden="true" /></Button>;
}
