import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Capacitor } from '@capacitor/core';
import { loadProgramAttachment } from '@/services/programAttachmentService';
import { assertPdfAttachment } from '@/lib/programAttachment';
import NativePdfPreview from './NativePdfPreview';
import { resolveAssetUrl } from '@/lib/assetUrl';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export default function ProgramPdfPreview({ source, name }) {
  const [nativeFailed, setNativeFailed] = useState(false);
  const showInline = useCallback(() => setNativeFailed(true), []);
  useEffect(() => setNativeFailed(false), [source]);
  return Capacitor.isNativePlatform() && !nativeFailed
    ? <NativePdfPreview source={source} name={name} onUnavailable={showInline} />
    : <BrowserPdfPreview source={source} name={name} />;
}

function BrowserPdfPreview({ source, name }) {
  const host = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  useEffect(() => {
    let cancelled = false;
    let task;
    let worker;
    const load = async () => {
      const { getDocument, PDFWorker, GlobalWorkerOptions, version } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (cancelled) return;
      const blob = await loadProgramAttachment(source);
      await assertPdfAttachment(blob);
      const data = new Uint8Array(await blob.arrayBuffer());
      if (cancelled) return;
      // Let PDF.js initialize its worker and fall back to its bundled parser when WebKit blocks workers.
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      worker = new PDFWorker();
      const assets = new URL(resolveAssetUrl(`pdfjs/${version}/`), document.baseURI).href;
      task = getDocument({ data, worker, isEvalSupported: false, enableScripting: false,
        cMapUrl: `${assets}cmaps/`, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/`, iccUrl: `${assets}iccs/` });
      const loadedPdf = await task.promise;
      if (!cancelled) setPdf(loadedPdf);
    };
    load().catch(() => { if (!cancelled) { setError('تعذر عرض PDF. يمكنك تحميل الملف.'); setBusy(false); } });
    return () => {
      cancelled = true;
      const release = () => { worker?.destroy(); };
      if (task) void task.destroy().then(release, release);
      else release();
    };
  }, [source]);
  useEffect(() => {
    const element = host.current;
    const observer = new ResizeObserver(() => setWidth(Math.floor(element.clientWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !width) return;
    let cancelled = false;
    let renderTask;
    setError('');
    setBusy(true);
    const render = async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const scale = width / page.getViewport({ scale: 1 }).width;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * ratio });
      // Each render owns its canvas, so rapid navigation and resizes cannot draw over one another.
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      canvas.style.width = '100%'; canvas.style.height = 'auto';
      canvas.setAttribute('aria-hidden', 'true');
      renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      await renderTask.promise;
      const content = await page.getTextContent();
      if (cancelled) return;
      host.current.replaceChildren(canvas);
      setText(content.items.map(item => item.str || '').join(' '));
      setBusy(false);
    };
    render().catch(() => { if (!cancelled) { setError('تعذر عرض PDF. يمكنك تحميل الملف.'); setBusy(false); } });
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pdf, pageNumber, width]);
  return <div className="min-w-0 space-y-3 [font-family:var(--font-ui)]" dir="rtl" aria-label={name} aria-busy={busy}>
    {error && <p role="alert" className="text-sm font-bold text-destructive">{error}</p>}
    {pdf && pdf.numPages > 1 && <div className="flex items-center justify-center gap-3">
      <Button type="button" variant="outline" size="icon" aria-label="الصفحة السابقة" disabled={busy || pageNumber === 1} onClick={() => setPageNumber(pageNumber - 1)}><ChevronRight className="h-5 w-5" /></Button>
      <output className="tabular-nums" aria-live="polite">{pageNumber} / {pdf.numPages}</output>
      <Button type="button" variant="outline" size="icon" aria-label="الصفحة التالية" disabled={busy || pageNumber === pdf.numPages} onClick={() => setPageNumber(pageNumber + 1)}><ChevronLeft className="h-5 w-5" /></Button>
    </div>}
    {busy && <div className="flex min-h-16 items-center justify-center" role="status" aria-label="جارٍ عرض الملف"><LoadingSpinner size="md" /></div>}
    <div ref={host} className="min-w-0" />
    <p className="sr-only">{text}</p>
  </div>;
}
