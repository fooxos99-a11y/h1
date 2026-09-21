import React, { lazy, Suspense, useState } from 'react';
import { Link } from '@/lib/router';

const PublicContactDialog = lazy(() => import('@/components/public/PublicContactDialog'));

const legalLinkClass = 'inline-flex min-h-11 items-center justify-center text-[11px] font-black text-white/70 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4';

const PublicLegalFooter = ({ onDeleteAccount, showContact = false, hasSession = false, accountName = '' }) => {
  const [contactOpen, setContactOpen] = useState(false);
  return (
    <footer className="border-t border-[#d7a43b]/20 bg-[#052e41] px-4 py-6 [font-family:var(--font-ui)]" dir="rtl">
      <div className="mx-auto w-full max-w-5xl">
        <nav className="flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-1" aria-label="الروابط النظامية">
          <Link className={legalLinkClass} to="/terms">شروط الاستخدام</Link>
          <Link className={legalLinkClass} to="/privacy">سياسة الخصوصية</Link>
          <button type="button" className={legalLinkClass} onClick={onDeleteAccount}>طلب حذف الحساب</button>
          {showContact && (
            <button type="button" className={legalLinkClass} onClick={() => setContactOpen(true)}>
              للتواصل مع المجمع اضغط هنا
            </button>
          )}
        </nav>
      </div>
      {showContact && (
        contactOpen && (
          <Suspense fallback={null}>
            <PublicContactDialog
              open={contactOpen}
              onOpenChange={setContactOpen}
              hasSession={hasSession}
              accountName={accountName}
            />
          </Suspense>
        )
      )}
    </footer>
  );
};

export default PublicLegalFooter;
