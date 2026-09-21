import React, { lazy, Suspense, useState } from 'react';
import DeferredPublicRankings from '@/components/public/rawasi/DeferredPublicRankings';
import PublicLegalFooter from '@/components/public/PublicLegalFooter';
import RawasiPublicHeader from '@/components/public/rawasi/RawasiPublicHeader';
import RawasiPublicHero from '@/components/public/rawasi/RawasiPublicHero';

const QuranExecutionDialog = lazy(() => import('@/components/portal/QuranExecutionDialog'));

const RawasiPublicHome = ({
  site,
  hasSession,
  accountName,
  showStudentExecution,
  studentId,
  showPath,
  showDailyChallenge,
  onOpenAccount,
  onOpenPath,
  onOpenDailyChallenge,
  onDeleteAccount,
}) => {
  const [executionOpen, setExecutionOpen] = useState(false);
  return (
    <>
      <RawasiPublicHeader
        site={site}
        hasSession={hasSession}
        onOpenAccount={onOpenAccount}
      />
      <main>
        <RawasiPublicHero
          site={site}
          hasSession={hasSession}
          showStudentExecution={showStudentExecution}
          onOpenExecution={() => setExecutionOpen(true)}
          showPath={showPath}
          showDailyChallenge={showDailyChallenge}
          onOpenPath={onOpenPath}
          onOpenDailyChallenge={onOpenDailyChallenge}
          onOpenAccount={onOpenAccount}
        />
        <DeferredPublicRankings />
      </main>
      <PublicLegalFooter
        onDeleteAccount={onDeleteAccount}
        showContact
        hasSession={hasSession}
        accountName={accountName}
      />
      {showStudentExecution && <Suspense fallback={null}>
        <QuranExecutionDialog studentId={studentId} open={executionOpen} onOpenChange={setExecutionOpen} />
      </Suspense>}
    </>
  );
};

export default RawasiPublicHome;
