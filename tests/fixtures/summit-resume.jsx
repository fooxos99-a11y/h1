import React from 'react';
import { createRoot } from 'react-dom/client';
import SummitJourneySection from '../../src/components/portal/SummitJourneySection';
import { studentsApi } from '../../src/services/studentsApi';
import { normalizeSummitMapConfig } from '../../shared/summit-map';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const station = { id: 'resume-zero', name: 'محطة البداية', points: 0, kilometer: 0,
  locationType: 'station', notificationEnabled: true, notificationText: 'متابعة الاختبار', challengeEnabled: false };
globalThis.summitResume = { saved: null, acknowledged: false };
studentsApi.getSummitJourney = async () => ({
  points: 120, displayedKilometers: 0, totalKilometers: 8000, activeStation: null,
  stages: [{ ...station, completed: globalThis.summitResume.acknowledged }],
  mapConfig: normalizeSummitMapConfig({ stations: [], cities: [] }),
});
studentsApi.acknowledgeSummitStage = async () => { globalThis.summitResume.acknowledged = true; };
studentsApi.updateSummitProgress = async (value) => { globalThis.summitResume.saved = value; };
createRoot(document.getElementById('root')).render(<SummitJourneySection onBack={() => {}} />);
