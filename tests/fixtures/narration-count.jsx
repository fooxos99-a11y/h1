import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import NarrationStudentPanel from '@/components/dashboard/NarrationStudentPanel';
import { studentsApi } from '@/services/studentsApi';
import '@/index.css';
globalThis.narrationFixture = { saves: [], loads: [], fail: false };
studentsApi.getNarrationPartAyahs = async (eventId, partId) => { globalThis.narrationFixture.loads.push({ eventId, partId }); return { pages: [] }; };
function Fixture() {
 const [parts,setParts]=useState([{id:51,juzNumber:5,rangeLabel:'الجزء 5',score:null,warningCount:0,mistakeCount:0}]);
 return <NarrationStudentPanel eventId={7} student={{id:4,studentName:'طالب تجريبي',committeeName:'حلقة تجريبية',status:'active',totalFaces:20,parts}} archived={false} onStart={()=>{}} onSavePart={async(id,payload)=>{if(globalThis.narrationFixture.fail){throw new Error('حفظ غير متاح');}globalThis.narrationFixture.saves.push({id,...payload});setParts(rows=>rows.map(row=>({...row,...payload,score:90})));return {};}} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
