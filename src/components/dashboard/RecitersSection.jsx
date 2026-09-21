import React from 'react';
import CommitteeStaffSection from '@/components/dashboard/CommitteeStaffSection';
import { studentsApi } from '@/services/studentsApi';

const RecitersSection = () => (
  <CommitteeStaffSection
    singularLabel="المقرئ"
    pluralLabel="مقرئون"
    loadStaff={studentsApi.getReciters}
    createStaff={studentsApi.createReciter}
    updateStaff={studentsApi.updateReciter}
    setStaffActive={studentsApi.setReciterActive}
  />
);

export default RecitersSection;
