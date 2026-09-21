import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsPresent } from 'framer-motion';

export default function DashboardHeaderFilters({ children }) {
  const [target, setTarget] = useState(null);
  const present = useIsPresent();
  useEffect(() => { setTarget(document.getElementById('dashboard-header-filters')); }, []);
  return target && present ? createPortal(children, target) : null;
}
