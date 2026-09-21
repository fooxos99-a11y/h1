const rawasiColors = {
  dark: {
    background: '195 100% 8%',
    foreground: '195 20% 96%',
    card: '195 72% 12%',
    primaryLight: '40 78% 66%',
    primary: '40 65% 54%',
    primaryDark: '40 72% 45%',
    primaryForeground: '195 100% 10%',
    secondary: '195 48% 18%',
    muted: '195 34% 20%',
    mutedForeground: '195 18% 72%',
    accent: '40 46% 26%',
    border: '195 35% 25%',
  },
  light: {
    background: '195 24% 97%',
    foreground: '195 100% 14%',
    card: '0 0% 100%',
    primaryLight: '195 72% 25%',
    primary: '195 100% 16%',
    primaryDark: '195 100% 11%',
    primaryForeground: '0 0% 100%',
    secondary: '195 32% 92%',
    muted: '195 20% 94%',
    mutedForeground: '195 16% 42%',
    accent: '40 72% 90%',
    border: '195 24% 86%',
  },
};


const madarijSiteConfig = Object.freeze({
  key: 'madarij',
  name: 'الحبيب ماب',
  publicUrl: 'https://mdarj.net/',
  shortName: 'الحبيب ماب',
  organizationName: 'مجمع الحبيّب',
  description: 'تطبيق الحبيب ماب',
  logo: 'branding/rawasi/alhabib-map-color-640.webp',
  logoSmall: 'branding/rawasi/alhabib-map-color-320.webp',
  whiteLogo: 'branding/rawasi/alhabib-map-white-640.webp',
  whiteLogoSmall: 'branding/rawasi/alhabib-map-white-320.webp',
  lockupLogo: 'branding/rawasi/alhabib-map-color-640.webp',
  squareLogo: 'branding/rawasi/icon-512.png',
  markLogo: 'branding/rawasi/alhabib-map-color-320.webp',
  icon192: 'branding/rawasi/icon-192.png',
  favicon: 'branding/rawasi/icon-192.png?v=28',
  appleTouchIcon: 'branding/rawasi/icon-192.png?v=28',
  registrationNumber: 'platform',
  whatsappUrl: '',
  themeColor: '#003D52',
  colors: rawasiColors,
  navigation: {
    background: '#052e41',
    accent: '#f0bd55',
    highlight: '#d7a43b',
  },
  secureStoragePrefix: 'sa.madarij.app.',
  backgroundRunnerLabel: 'sa.madarij.app.offline-recitation',
  androidDownloadUrl: '/downloads/rawasi-android-1.0.24.apk',
  appStoreUrl: 'https://apps.apple.com/sa/app/id6798071538',
  features: Object.freeze({
    store: true,
    studentHome: true,
    dailyChallenge: true,
    summit: true,
  }),
});


const siteConfigs = Object.freeze({
  madarij: madarijSiteConfig,
  rawasi: madarijSiteConfig,
});

const configuredSiteKey = String(import.meta.env?.VITE_SITE_KEY || 'madarij').trim().toLowerCase();

export const defaultSiteKey = siteConfigs[configuredSiteKey] ? configuredSiteKey : 'madarij';

export function getSiteConfig(key = defaultSiteKey) {
  return siteConfigs[String(key || '').trim().toLowerCase()] || madarijSiteConfig;
}
