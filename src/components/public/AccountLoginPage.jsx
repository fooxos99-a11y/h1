import React from 'react';
import { resolveAssetUrl } from '@/lib/assetUrl';
import LoadingIndicator from '@/components/ui/loading-indicator';
import AccountLoginForm from './AccountLoginForm';

export default function AccountLoginPage({ site, onLogin, loading }) {
  if (loading) return <LoadingIndicator mode="screen" delayMs={0} />;
  return <main className="grid min-h-[100svh] place-items-center bg-background px-5 py-10 [font-family:var(--font-ui)]" dir="rtl">
    <section className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8" aria-labelledby="login-title">
      <header className="mb-8 flex flex-col items-center gap-3 text-center">
        {site.logo && <img src={resolveAssetUrl(site.logo)} alt={site.name} className="h-20 w-20 object-contain" />}
        <h1 id="login-title" className="text-2xl font-black text-foreground">تسجيل الدخول</h1>
      </header>
      <AccountLoginForm onLogin={onLogin} loading={loading} />
    </section>
  </main>;
}
