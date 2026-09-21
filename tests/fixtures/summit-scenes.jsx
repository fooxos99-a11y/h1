import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SummitMapEditor from '../../src/components/dashboard/SummitMapEditor';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
function Preview() {
  const [value, setValue] = useState({ cities: [{ id: 'start', name: 'الموطا', kilometer: 0 }, { id: 'next', name: 'عنيزة', kilometer: 1000 }] });
  return <main className="mx-auto max-w-5xl p-3"><SummitMapEditor value={value} onChange={setValue} /></main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
