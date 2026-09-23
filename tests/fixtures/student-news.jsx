import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentNewsEditor from '../../src/components/dashboard/StudentNewsEditor';
import StudentNewsCard from '../../src/components/portal/home/StudentNewsCard';
import { studentNewsService } from '../../src/services/studentNewsService';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
function Fixture() {
  const [news, setNews] = useState(null);
  useEffect(() => { studentNewsService.load().then(setNews); }, []);
  return <main className="p-4" dir="rtl">{location.search.includes('editor') ? <StudentNewsEditor /> : <StudentNewsCard news={news} />}</main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
