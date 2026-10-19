import { useEffect } from 'react';
import NativeUpdateDialog from '@/components/native/NativeUpdateDialog';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { useLocation, useNavigate } from '@/lib/router';
import useNativeSystemBars from '@/hooks/useNativeSystemBars';
import { appResumeEvent } from '@/lib/recitationResume';

const NativeAppBridge = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useNativeSystemBars();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let active = true;
    let listener;
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) window.dispatchEvent(new Event(appResumeEvent));
    }).then((handle) => {
      if (active) listener = handle;
      else void handle.remove();
    });
    return () => { active = false; void listener?.remove(); };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    SplashScreen.hide().catch(() => {});

    let backButtonListener;
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (!window.dispatchEvent(new Event('madarij-student-back', { cancelable: true }))) return;
      if (canGoBack && location.pathname !== '/') {
        navigate(-1);
        return;
      }
      CapacitorApp.exitApp();
    }).then((listener) => {
      backButtonListener = listener;
    });

    return () => {
      backButtonListener?.remove();
    };
  }, [location.pathname, navigate]);

  return <NativeUpdateDialog />;
};

export default NativeAppBridge;
