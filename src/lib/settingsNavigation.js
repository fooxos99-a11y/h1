import {
  ArchiveX,
  Newspaper,
  BookOpenCheck,
  CalendarCheck2,
  Link2,
  Map,
  Trophy,
} from 'lucide-react';
import { getSiteConfig } from '@/site/siteConfigs';

const allSettingsNavigationItems = [
  { key: 'settingsAttendance', slug: 'settings-attendance', label: 'التحضير وجلسات التسميع', icon: CalendarCheck2 },
  { key: 'settingsNews', slug: 'settings-news', label: 'الأخبار', icon: Newspaper },
  { key: 'settingsNarration', slug: 'settings-narration', label: 'يوم السرد والاختبار', icon: BookOpenCheck },
  { key: 'settingsPoints', slug: 'settings-points', label: 'الكيلومترات والترتيب', icon: Trophy },
  { key: 'settingsMap', slug: 'settings-map', label: 'الخريطة والتحدي اليومي', icon: Map },
  { key: 'settingsNazem', slug: 'settings-nazem', label: 'ناظم', icon: Link2 },
  { key: 'settingsTerm', slug: 'settings-term', label: 'إنهاء الفصل وطلبات الحذف', icon: ArchiveX },
];

const siteFeatures = getSiteConfig().features || {};

export const settingsNavigationItems = Object.freeze(allSettingsNavigationItems.filter((item) => (
  item.key !== 'settingsMap' || (siteFeatures.summit !== false || siteFeatures.dailyChallenge !== false)
)));

export const defaultSettingsNavigationKey = settingsNavigationItems[0].key;

export const isSettingsNavigationKey = (key) => (
  settingsNavigationItems.some((item) => item.key === key)
);
