import React, { useEffect, useState } from 'react';
import ErrorState from '@/components/ui/error-state';
import { useSiteConfig } from '@/site/SiteProvider';
import { resolveAssetUrl } from '@/lib/assetUrl';
import './startup.css';

export function StartupLines() {
  return <svg className="startup-lines" viewBox="0 0 800 800" aria-hidden="true">
    {[0, 60, 120, 180, 240, 300].map(angle => <path key={angle} transform={`rotate(${angle} 400 400)`} d="M 0 180 L 180 180 L 340 365" />)}
  </svg>;
}

export default function StartupVisual() {
  const site = useSiteConfig();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 15000);
    return () => window.clearTimeout(timer);
  }, []);
  if (timedOut) return <div className="startup-scene p-5"><ErrorState message="تعذر إكمال التحميل. تحقق من الاتصال ثم أعد المحاولة." onRetry={() => window.location.reload()} /></div>;
  return <div className="startup-scene startup-waiting" role="status" aria-label="جاري التحميل">
    <StartupLines />
    <div className="startup-hexagon">{site.logo && <img src={resolveAssetUrl(site.logo)} alt={site.name} />}</div>
  </div>;
}
