import React from 'react';
import { ClipboardCheck, Map, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveAssetUrl } from '@/lib/assetUrl';

const RawasiPublicHero = ({
  site,
  showStudentExecution,
  onOpenExecution,
  showPath,
  showDailyChallenge,
  onOpenPath,
  onOpenDailyChallenge,
}) => (
  <section id="rawasi-home" className="relative grid min-h-[82svh] place-items-center overflow-hidden border-b border-border bg-background px-4 pb-16 pt-28 [font-family:var(--font-ui)] sm:min-h-[88svh] sm:px-6 sm:pb-20 sm:pt-32 lg:px-8" dir="rtl">
      <div className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-45" aria-hidden="true">
        <div className="absolute -right-32 top-10 h-80 w-80 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/.14),transparent_70%)]" />
        <div className="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,hsl(var(--accent)/.18),transparent_70%)]" />
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.08] dark:opacity-[0.12]" />
      </div>

      <div className="rawasi-hero-enter relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/.12),transparent_70%)]" aria-hidden="true" />
        {site.showPublicHeroLogo !== false && (
          <div className="relative flex min-h-60 w-full items-center justify-center px-6 sm:min-h-72">
            <img
              src={resolveAssetUrl(site.logo)}
              srcSet={site.logoSmall
                ? `${resolveAssetUrl(site.logoSmall)} 320w, ${resolveAssetUrl(site.logo)} 640w`
                : undefined}
              sizes="min(72vw, 320px)"
              alt={`هوية ${site.name}`}
              className="h-auto w-[min(72vw,20rem)] object-contain"
              width="640"
              height="640"
              decoding="async"
              fetchPriority="high"
            />
          </div>
        )}
        {site.organizationName && (
          <h1 className={`relative font-black tracking-wide text-foreground ${site.showPublicHeroLogo === false ? 'text-4xl sm:text-5xl' : 'mt-2 text-2xl sm:text-3xl'}`}>
            {site.organizationName}
          </h1>
        )}

        <div className="relative mt-8 flex w-full max-w-xl flex-nowrap justify-center gap-2 sm:gap-3" data-public-primary-actions>
          {showPath && (
            <Button type="button" variant="outline" onClick={onOpenPath} className="min-h-12 min-w-0 flex-1 gap-1 rounded-xl border-border bg-card px-1 text-xs text-foreground hover:bg-secondary sm:gap-2 sm:px-4 sm:text-base">
              <Map className="h-4 w-4 shrink-0" />
              الخريطة
            </Button>
          )}
          {showStudentExecution && (
            <Button type="button" variant="outline" onClick={onOpenExecution} className="min-h-12 min-w-0 flex-1 gap-1 rounded-xl border-border bg-card px-1 text-xs text-foreground hover:bg-secondary sm:gap-2 sm:px-4 sm:text-base">
              <ClipboardCheck className="h-4 w-4 shrink-0" />
              التنفيذ
            </Button>
          )}
          {showDailyChallenge && (
            <Button type="button" variant="outline" onClick={onOpenDailyChallenge} className="min-h-12 min-w-0 flex-1 gap-1 rounded-xl border-border bg-card px-1 text-xs text-foreground hover:bg-secondary sm:gap-2 sm:px-4 sm:text-base">
              <Trophy className="h-4 w-4 shrink-0" />
              التحدي اليومي
            </Button>
          )}
        </div>
      </div>
    </section>
);

export default RawasiPublicHero;
