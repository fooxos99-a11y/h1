import React from 'react';
import NazemIssueDate from '@/components/dashboard/NazemIssueDate';
import { Button } from '@/components/ui/button';

const parseSnapshot = (value) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
};

const planItemText = (plan) => (
  `${plan?.tab || 'الخطة'}: من ${plan?.startSurah || '—'} ${plan?.startAyah || '—'} إلى ${plan?.endSurah || '—'} ${plan?.endAyah || '—'}`
);

const planSnapshotText = (snapshot) => {
  const value = parseSnapshot(snapshot);
  const items = value.primary ? [value.primary, value.revision].filter(Boolean) : [value];
  return items.map(planItemText).join(' · ');
};

const recitationSnapshotText = (snapshot) => {
  const value = parseSnapshot(snapshot);
  if (value.errorCode) return value.message || value.errorCode;
  const start = `${value.fromSurah || value.surah_from_name || '—'} ${value.fromAyah || value.verse_from || '—'}`;
  const end = `${value.toSurah || value.actual_surah_to_name || '—'} ${value.toAyah || value.actual_verse_to || '—'}`;
  const _resolveResult = () => {
    if (value.completed === true || (value.status && value.status !== 'not_completed')) {
      return 'تم';
    }
    if (value.completed === false || value.status === 'not_completed') {
      return 'لم يتم';
    }
    return '';
  };
  const result = _resolveResult();
  const mistakes = Number(value.mistakeCount ?? value.remoteMistakeCount ?? value.mistake ?? 0)
    + Number(value.tune ?? 0);
  return `${start} — ${end}${result ? ` · ${result}` : ''} · ${mistakes} خطأ`;
};

const snapshotText = (row, snapshot) => (
  ['recitation', 'recitation_day'].includes(row.entityType)
    ? recitationSnapshotText(snapshot)
    : planSnapshotText(snapshot)
);

const NazemConflictCard = ({ row, busy = false, onResolve, onLeave }) => {
  const isRecitation = ['recitation', 'recitation_day'].includes(row.entityType);
  const remoteResolution = ['plan', 'recitation_day'].includes(row.entityType) ? 'use_nazem' : 'ignore_remote';
  const _resolveNazemConflictCard = () => {
    if (busy) {
      return 'جاري الحفظ...';
    }
    if (isRecitation) {
      return 'اعتماد تقييم المنصة';
    }
    return 'اعتماد خطة المنصة';
  };
  const _resolveNazemConflictCard2 = () => {
    if (row.entityType === 'plan') {
      return 'اعتماد خطة ناظم';
    }
    if (row.entityType === 'recitation_day') {
      return 'اعتماد تقييم ناظم';
    }
    return 'اعتماد الوضع الحالي في ناظم';
  };
  return (
    <div className="space-y-3 rounded-xl border border-amber-400/40 bg-amber-500/5 p-3 [font-family:var(--font-ui)] sm:p-4" dir="rtl">
      <div className="font-black text-amber-700">تعارض بين المنصة وناظم</div>
      <NazemIssueDate value={row.createdAt} label="تاريخ الخطأ" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs font-black text-primary">{isRecitation ? 'تقييم المنصة' : 'خطة المنصة'}</div>
          <div className="mt-2 text-sm font-bold">{snapshotText(row, row.localSnapshot)}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs font-black text-primary">{isRecitation ? 'تقييم ناظم' : 'خطة ناظم'}</div>
          <div className="mt-2 text-sm font-bold">{snapshotText(row, row.remoteSnapshot)}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={busy} onClick={() => onResolve(row.id, 'use_ruwasi')}>
          {_resolveNazemConflictCard()}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => onResolve(row.id, remoteResolution)}>
          {_resolveNazemConflictCard2()}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={() => onLeave(row.id)}>
          تركه دون تغيير
        </Button>
      </div>
    </div>
  );
};

export default NazemConflictCard;
