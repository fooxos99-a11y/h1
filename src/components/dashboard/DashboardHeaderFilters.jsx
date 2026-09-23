import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsPresent } from 'framer-motion';

export default function DashboardHeaderFilters({ children, aboveTitle = false }) {
  const [target, setTarget] = useState(null);
  const present = useIsPresent();
  useEffect(() => { setTarget(document.getElementById('dashboard-header-filters')); }, []);
  return target && present ? createPortal(aboveTitle ? <div data-filters-above-title>{children}</div> : children, target) : null;
}
