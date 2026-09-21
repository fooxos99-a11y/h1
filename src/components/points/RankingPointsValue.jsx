import React from 'react';
import PointIcon from '@/components/points/PointIcon';
import { cn } from '@/lib/utils';

const RankingPointsValue = ({ value = 0, className, iconClassName, wholeNumber = false }) => (
  <span className={cn('inline-flex items-center gap-1 font-black text-primary', className)}>
    <span>{Number(value || 0).toLocaleString('ar-SA-u-nu-latn', wholeNumber ? { maximumFractionDigits: 0, useGrouping: false } : undefined)}</span>
    <PointIcon className={iconClassName} />
  </span>
);

export default RankingPointsValue;
