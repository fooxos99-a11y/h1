import React from 'react';
import { DEFAULT_NEWS_BACKGROUND_COLOR, DEFAULT_NEWS_TEXT_COLOR } from '../../../../shared/student-news';

// Kept short so the news does not dominate the home. "phone" pins the mobile sizes for the admin preview.
const CARD_SIZES = {
  responsive: { height: 'h-[180px] sm:h-[200px]', title: 'text-base leading-7 sm:text-lg', padding: 'p-4 sm:px-5' },
  phone: { height: 'h-[180px]', title: 'text-base leading-7', padding: 'p-4' },
};
export const newsCardSize = phone => CARD_SIZES[phone ? 'phone' : 'responsive'];

export default function StudentNewsArtwork({ entry, expanded = false, phone = false }) {
  const size = newsCardSize(phone);
  const textLayout = expanded ? 'space-y-3 p-5 sm:p-6' : `flex h-full flex-col justify-center space-y-1.5 ${size.padding}`;
  const titleLayout = expanded ? 'text-lg leading-relaxed sm:text-xl' : `line-clamp-2 ${size.title}`;
  return <div className={`relative isolate overflow-hidden [font-family:var(--font-ui)] ${expanded ? 'min-h-[280px] rounded-xl' : size.height}`}
    style={{ backgroundColor: entry.backgroundColor || DEFAULT_NEWS_BACKGROUND_COLOR }}>
    {entry.image && <>
      <img src={entry.image} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 -z-10 bg-black/35" />
    </>}
    <div data-news-text="" className={`pointer-events-none text-start ${textLayout}`} style={{ color: entry.textColor || DEFAULT_NEWS_TEXT_COLOR }}>
      <h3 className={`break-words font-bold ${titleLayout}`}>{entry.title}</h3>
      {entry.body && <p className={`whitespace-pre-wrap break-words text-sm leading-7 ${expanded ? '' : 'line-clamp-2'}`}>{entry.body}</p>}
    </div>
  </div>;
}
