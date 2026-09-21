import React from 'react';
import { createRoot } from 'react-dom/client';
import TeacherRecitationRetries from '../../src/components/portal/TeacherRecitationRetries';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
createRoot(document.getElementById('root')).render(<main className="p-3"><TeacherRecitationRetries supervisorId={11} /></main>);
