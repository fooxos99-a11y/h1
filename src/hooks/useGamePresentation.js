import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from '@/lib/router';
import useGamePresenterOrigin from '@/hooks/useGamePresenterOrigin';
import { secureRandomId } from '../../shared/secure-random.js';

const SESSION_API = '/api/cultural-games/sessions';

const readJson = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'تعذر الاتصال بجولة العرض.');
  return data;
};

const useGamePresentation = ({ gameKey, gamePath, initialState, onRemoteState, enabled = true }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const presenterOrigin = useGamePresenterOrigin(enabled);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const querySessionId = params.get('game') || '';
  const queryControlToken = params.get('control') || '';
  const role = params.get('role') || 'setup';
  const isHost = role === 'host';
  const isScreen = role === 'screen';
  const [sessionId, setSessionId] = useState(querySessionId);
  const [controlToken, setControlToken] = useState(queryControlToken);
  const [remoteStarted, setRemoteStarted] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const initialStateRef = useRef(initialState);
  const onRemoteStateRef = useRef(onRemoteState);

  onRemoteStateRef.current = onRemoteState;

  const createSession = useCallback(async (state = initialStateRef.current) => {
    if (!enabled) return { id: '', controlToken: '' };
    const id = secureRandomId(gameKey);
    const data = await fetch(SESSION_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, gameType: gameKey, state }),
    }).then(readJson);
    setSessionId(data.id);
    setControlToken(data.controlToken);
    setSessionError('');
    return data;
  }, [enabled, gameKey]);

  const publish = useCallback(async (state, explicitId = '', explicitControlToken = '') => {
    if (!enabled) return;
    const id = explicitId || sessionId;
    const token = explicitControlToken || controlToken;
    if (!id) return;
    await fetch(`${SESSION_API}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-game-control-token': token,
      },
      body: JSON.stringify({ state }),
    }).then(readJson);
  }, [controlToken, enabled, sessionId]);

  const startScreen = useCallback(async (state) => {
    if (!enabled) {
      setRemoteStarted(true);
      return true;
    }
    try {
      const session = sessionId
        ? { id: sessionId, controlToken }
        : await createSession(state);
      await publish(state, session.id, session.controlToken);
      setRemoteStarted(true);
      navigate(`${gamePath}?game=${encodeURIComponent(session.id)}&role=screen`, { replace: true });
      return true;
    } catch (error) {
      setSessionError(error.message || 'تعذر بدء شاشة العرض.');
      return false;
    }
  }, [controlToken, createSession, enabled, gamePath, navigate, publish, sessionId]);

  useEffect(() => {
    if (!enabled || querySessionId || sessionId || isHost || isScreen) return undefined;
    let alive = true;
    let retryTimer;

    const prepareSession = () => {
      createSession().catch((error) => {
        if (!alive) return;
        setSessionError(error.message || 'تعذر تجهيز باركود المقدم. جاري إعادة المحاولة…');
        retryTimer = window.setTimeout(prepareSession, 2500);
      });
    };

    prepareSession();
    return () => {
      alive = false;
      window.clearTimeout(retryTimer);
    };
  }, [createSession, enabled, isHost, isScreen, querySessionId, sessionId]);

  useEffect(() => {
    if (!enabled || !querySessionId || (!isScreen && !isHost)) return undefined;
    let alive = true;
    let timer;

    const load = async () => {
      try {
        const data = await fetch(`${SESSION_API}/${querySessionId}`, { cache: 'no-store' }).then(readJson);
        if (!alive) return;
        setSessionId(querySessionId);
        setRemoteStarted(Boolean(data.state?.started));
        setSessionError('');
        onRemoteStateRef.current?.(data.state || {});
        if (isHost && data.state?.started && timer) clearInterval(timer);
      } catch (error) {
        if (alive) setSessionError(error.message || 'تعذر تحميل الجولة.');
      }
    };

    void load();
    timer = setInterval(load, 800);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled, isHost, isScreen, querySessionId]);

  const presenterUrl = enabled && sessionId
    ? `${presenterOrigin}${gamePath}?game=${encodeURIComponent(sessionId)}&role=host&control=${encodeURIComponent(controlToken)}`
    : '';

  return {
    isHost: enabled && isHost,
    isScreen: enabled && isScreen,
    presenterUrl,
    publish,
    remoteStarted,
    sessionError,
    startScreen,
  };
};

export default useGamePresentation;
