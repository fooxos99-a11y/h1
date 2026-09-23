import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SummitMapEditor from '../../src/components/dashboard/SummitMapEditor';
import SummitJourneyMap from '../../src/components/summit/SummitJourneyMap';
import { normalizeSummitMapConfig } from '../../shared/summit-map';
import { Button } from '../../src/components/ui/button';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
function Preview() {
  const [value, setValue] = useState({ cities: [{ id: 'start', name: 'الموطا', kilometer: 0 }, { id: 'next', name: 'عنيزة', kilometer: 1000 }] });
  return <main className="mx-auto max-w-5xl p-3"><SummitMapEditor value={value} onChange={setValue} /></main>;
}
function GatheringPreview() {
  const [active, setActive] = useState(true);
  const station = { id: 'gathering', name: 'ملتقى الطلاب', kilometer: 2500, imageId: 'a'.repeat(64) };
  const config = normalizeSummitMapConfig({ stations: [station], activeStationId: active ? station.id : null });
  return <><SummitJourneyMap journey={{ points: active ? 2500 : 100, stages: [], mapConfig: config, activeStation: active ? station : null, totalKilometers: 8000 }} />
    <Button className="absolute left-2 top-2 z-[100]" onClick={() => setActive(false)}>إلغاء التفعيل للاختبار</Button></>;
}
createRoot(document.getElementById('root')).render(location.search.includes('gathering') ? <GatheringPreview /> : <Preview />);
