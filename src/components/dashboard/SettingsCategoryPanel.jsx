import React from 'react';

const SettingsCategoryPanel = ({ category, activeCategory, title, children }) => {
  if (category !== activeCategory) return null;

  return (
    <section aria-label={title} className="divide-y divide-primary/15 bg-card/40">
      {children}
    </section>
  );
};

export default SettingsCategoryPanel;
