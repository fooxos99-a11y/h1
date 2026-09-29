import React from 'react';
import { createRoot } from 'react-dom/client';
import RankingsSection from '../../src/components/dashboard/RankingsSection';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
createRoot(document.getElementById('root')).render(<RankingsSection />);
