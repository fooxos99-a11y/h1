import React, { useEffect, useState } from 'react';
import { FileDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { prepareProgramAttachment } from '@/lib/programAttachment';
import { downloadProgramAttachment, resolveAttachmentUrl } from '@/services/programAttachmentService';
import ProgramPdfPreview from './ProgramPdfPreview';

export default function ProgramAttachment({ attachment }) {
  const [source, setSource] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    setOpen(false); setError(''); setSource(null);
    if (!attachment) return;
    let url;
    try {
      const prepared = prepareProgramAttachment(attachment);
      url = prepared.blob ? URL.createObjectURL(prepared.blob) : resolveAttachmentUrl(prepared.url);
      setSource({ ...prepared, url });
    } catch (error) { setError(error.message); }
    return () => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); };
  }, [attachment]);
  if (!attachment) return null;
  const name = attachment.fileName || 'ملف مرفق';
  const download = async () => {
    if (!source || downloading) return;
    setError(''); setDownloading(true);
    try { await downloadProgramAttachment(source, name); }
    catch { setError('تعذر تحميل الملف. حاول مرة أخرى.'); }
    finally { setDownloading(false); }
  };
  return <div className="min-w-0 [font-family:var(--font-ui)]" dir="rtl">
    <Dialog open={open} onOpenChange={setOpen}>
    {source && (source.kind === 'file'
      ? <Button type="button" variant="outline" disabled={downloading} aria-busy={downloading} onClick={download} className="h-auto min-h-12 w-full justify-start whitespace-normal text-start"><FileDown className="h-5 w-5 shrink-0" /><span className="min-w-0 break-words">{name}</span></Button>
      : <DialogTrigger asChild><Button type="button" variant="outline" className="h-auto min-h-12 w-full justify-start whitespace-normal text-start"><FileDown className="h-5 w-5 shrink-0" /><span className="min-w-0 break-words">{name}</span></Button></DialogTrigger>)}
    {!open && error && <p role="alert" className="text-sm font-bold text-destructive">{error}</p>}
      <DialogContent className="max-w-4xl touch-auto [font-family:var(--font-ui)]" dir="rtl" aria-describedby={undefined}>
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <DialogTitle className="min-w-0 break-words">{name}</DialogTitle>
          <Button type="button" variant="ghost" size="icon" aria-label="إغلاق" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
        </DialogHeader>
        {error && <p role="alert" className="text-sm font-bold text-destructive">{error}</p>}
        {open && source?.kind === 'image' && <img className="mx-auto max-h-[70dvh] max-w-full object-contain" src={source.url} alt={name} onError={() => setError('تعذر عرض الصورة.')} onLoad={() => setError('')} />}
        {open && source?.kind === 'pdf' && <ProgramPdfPreview key={source.url} source={source} name={name} />}
        <Button type="button" variant="outline" disabled={!source || downloading} aria-busy={downloading} onClick={download} className="min-h-12 w-fit max-w-full whitespace-normal break-words"><FileDown className="h-4 w-4 shrink-0" />{downloading ? 'جارٍ تحميل الملف' : 'تحميل الملف'}</Button>
      </DialogContent>
    </Dialog>
  </div>;
}
