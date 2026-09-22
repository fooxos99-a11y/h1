import React from 'react';
import { MapPin } from 'lucide-react';
import SummitSceneImage from './SummitSceneImage';

export default function SummitGatheringStation({ station, embedded }) {
  return <section aria-label={`محطة التجمع: ${station.name}`} dir="rtl"
    className={`flex w-full flex-col items-center justify-center gap-5 overflow-hidden bg-slate-800 px-4 pb-6 pt-20 text-white [font-family:var(--font-ui)] ${embedded ? 'h-full' : 'h-dvh'}`}>
    {station.imageId ? <SummitSceneImage imageId={station.imageId} alt={station.name}
      className="min-h-0 w-full max-w-5xl flex-1 rounded-2xl object-contain" />
      : <MapPin className="h-20 w-20 text-teal-200" aria-hidden="true" />}
  </section>;
}
