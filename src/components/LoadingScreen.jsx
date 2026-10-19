import React from 'react';
import LoadingIndicator from '@/components/ui/loading-indicator';

// Suspense is still waiting; only a rejected import or request is a failure.
const LoadingScreen = () => <LoadingIndicator mode="screen" delayMs={0} />;

export default LoadingScreen;
