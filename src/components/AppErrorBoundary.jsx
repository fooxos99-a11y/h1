import React from 'react';
import ErrorState from '@/components/ui/error-state';
import { recoverFromStaleAppAsset } from '@/lib/appVersionRecovery';
import { Capacitor } from '@capacitor/core';
import { markNativeStartupFailed } from '@/lib/nativeOta';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    document.documentElement.classList.add('app-ready');
    if (Capacitor.isNativePlatform()) markNativeStartupFailed();
    else recoverFromStaleAppAsset(error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main data-app-error className="grid min-h-dvh place-items-center bg-background p-4 text-foreground [font-family:var(--font-ui)]" dir="rtl">
        <ErrorState
          className="w-full max-w-lg bg-card"
          message="تعذر فتح الصفحة"
          retryLabel="تحديث"
          onRetry={() => window.location.reload()}
        />
      </main>
    );
  }
}

export default AppErrorBoundary;
