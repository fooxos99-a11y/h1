import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SummitSceneImage from '@/components/summit/SummitSceneImage';
import { uploadSummitImage } from '@/services/summitImageService';

export default function SummitImagePicker({ imageId, onChange, label, fallback, portrait = false }) {
  const input = useRef(null);
  const currentChange = useRef(onChange);
  const mounted = useRef(true);
  currentChange.current = onChange;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const select = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const id = await uploadSummitImage(file);
      if (mounted.current) currentChange.current(id);
    } catch (cause) { if (mounted.current) setError(cause.message || 'تعذر تحميل الصورة.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <div className="space-y-2 [font-family:var(--font-ui)]">
    <SummitSceneImage imageId={imageId} fallback={fallback} alt={label} className={portrait ? 'h-64 w-full rounded-xl bg-muted/30 object-contain' : 'h-36 w-full rounded-xl object-cover'} />
    <input ref={input} type="file" className="sr-only" tabIndex={-1} accept="image/jpeg,image/png,image/webp" aria-label={label} onChange={(event) => { select(event.target.files?.[0]); event.target.value = ''; }} />
    <Button type="button" variant="outline" className="min-h-11 w-full" disabled={busy} onClick={() => input.current?.click()}><ImagePlus className="h-4 w-4" />{busy ? 'تحميل الصورة…' : label}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
