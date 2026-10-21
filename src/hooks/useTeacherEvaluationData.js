import { useCallback, useEffect, useRef, useState } from 'react';
import { studentsApi } from '@/services/studentsApi';
import { cacheTeacherEvaluation, getCachedTeacherEvaluation, mergeLocalTeacherEvaluation } from '@/services/offlineRecitationService';
import { getAuthSessionVersion } from '@/lib/authSession';
import { getTenantRegistrationNumber } from '@/services/apiBase';
import { recitationErrorMessage } from '@/lib/recitationErrorMessage';
import { retryTemporaryRead, withinTimeout } from '@/lib/asyncRecovery';

export default function useTeacherEvaluationData(supervisorId, enabled, onLoaded) {
  const scope = JSON.stringify([getTenantRegistrationNumber(), getAuthSessionVersion(), supervisorId]);
  const [state, setState] = useState({ scope, data: null, loading: enabled, error: '' });
  const revision = useRef(0);
  const pending = useRef(null);
  const retryDeadline = useRef(0);
  const invalidatedTransport = useRef(false);
  const setData = useCallback((update) => {
    // A response started before a local save must not undo that save in the UI.
    revision.current += 1;
    pending.current = null;
    invalidatedTransport.current = true;
    setState((current) => current.scope === scope
      ? { ...current, data: typeof update === 'function' ? update(current.data) : update }
      : current);
  }, [scope]);

  const load = useCallback(({ fresh = false, silent = false } = {}) => {
    if (!enabled || !supervisorId) return Promise.resolve();
    fresh = fresh || invalidatedTransport.current;
    if (fresh) {
      revision.current += 1;
      pending.current = null;
    }
    if (pending.current) return pending.current;
    if (Date.now() < retryDeadline.current) return Promise.resolve();
    const version = revision.current;
    const isCurrent = () => version === revision.current
      && scope === JSON.stringify([getTenantRegistrationNumber(), getAuthSessionVersion(), supervisorId]);
    const update = (patch) => {
      if (isCurrent()) setState((current) => ({ ...current, ...patch, scope }));
    };
    // A fresh transport need not unmount this account's already loaded list.
    const clearVisibleData = fresh && !silent;
    setState((current) => ({ ...current, ...(clearVisibleData ? { data: null } : {}),
      loading: clearVisibleData || !current.data, error: '' }));
    const request = (async () => {
      if (navigator.onLine === false) {
        let cached;
        try {
          cached = await withinTimeout(() => getCachedTeacherEvaluation(supervisorId), 3_000, 'تعذر قراءة الجلسة المحفوظة.');
        } catch {
          // An unreadable offline snapshot must leave an actionable error.
          cached = null;
        }
        update({ ...(cached ? { data: cached } : {}), loading: false, error: cached ? '' : 'لا توجد جلسة محفوظة على الجهاز. اتصل بالإنترنت ثم أعد المحاولة.' });
        return;
      }
      try {
        invalidatedTransport.current = false;
        const evaluation = await retryTemporaryRead(async () => {
          const evaluation = await studentsApi.getSupervisorQuranEvaluation(supervisorId, { fresh });
          return evaluation;
        }, { isCurrent });
        if (!Array.isArray(evaluation?.tasks) || !Array.isArray(evaluation?.students)) throw new Error('تعذر قراءة بيانات جلسة التسميع. أعد المحاولة.');
        if (!isCurrent()) return;
        // Merge durable local outcomes before display; snapshot writes are not on the rendering path.
        const resolvedEvaluation = await withinTimeout(() => mergeLocalTeacherEvaluation(supervisorId, evaluation),
          5_000, 'تعذر قراءة التقييمات المحفوظة على الجهاز. أعد المحاولة قبل التسميع.');
        if (!isCurrent()) return;
        update({ data: resolvedEvaluation, loading: false, error: '', retryAt: 0 });
        void cacheTeacherEvaluation(supervisorId, evaluation).catch(() => {
          update({ error: 'الجلسة متاحة، لكن تعذر حفظ نسختها على الجهاز للعمل دون اتصال.' });
        });
        if (isCurrent()) onLoaded(evaluation);
      } catch (error) {
        if (!isCurrent()) return;
        retryDeadline.current = error.status === 429 ? Date.now() + Math.max(Number(error.retryAfterMs) || 0, 1000) : 0;
        update({ ...(error.status === 401 || error.status === 403 ? { data: null } : {}),
          loading: false, retryAt: retryDeadline.current,
          error: recitationErrorMessage(error, 'تعذر تحميل جلسة التسميع. أعد المحاولة.') });
      }
    })().finally(() => {
      if (pending.current === request) pending.current = null;
    });
    pending.current = request;
    return request;
  }, [enabled, onLoaded, scope, supervisorId]);

  useEffect(() => {
    revision.current += 1;
    retryDeadline.current = 0;
    pending.current = null;
    setState({ scope, data: null, loading: enabled, error: '' });
    // The current entry may already have a server read from offline preparation.
    // Share that read; explicit refreshes and local mutations still force a new one.
    void load();
    return () => { revision.current += 1; pending.current = null; };
  }, [enabled, load, scope]);

  return { data: state.scope === scope ? state.data : null, setData, load,
    isLoading: state.scope === scope ? state.loading : enabled,
    retryAt: state.scope === scope ? state.retryAt || 0 : 0,
    loadError: state.scope === scope ? state.error : '' };
}
