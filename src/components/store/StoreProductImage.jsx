import React from 'react';
import { cn } from '@/lib/utils';

const StoreProductImage = ({ src, alt, className }) => (
  <div className={cn('relative aspect-square w-full shrink-0 overflow-hidden bg-background p-2', className)}>
    <img src={src} alt={alt} className="absolute inset-0 block h-full w-full select-none object-contain p-3" />
  </div>
);

export default StoreProductImage;
