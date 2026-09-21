const madarijSiteConfig = {
  key: 'madarij',
  registrationNumber: 'platform',
  name: 'الحبيب ماب',
  shortName: 'الحبيب ماب',
  description: 'تطبيق الحبيب ماب',
  logo: 'branding/rawasi/alhabib-map-color.png',
  squareLogo: 'branding/rawasi/icon-512.png',
  whatsappUrl: '',
  themeColor: '#003D52',
  appUrl: 'https://161.97.171.108.sslip.io/mdarj',
  apiUrl: 'https://161.97.171.108.sslip.io/mdarj/api',
  features: { store: true, dailyChallenge: true, summit: true, studentHome: true, nazemAutomaticAttendance: true },
};


const siteConfigs = {
  madarij: madarijSiteConfig,
  rawasi: madarijSiteConfig,
};

const configuredSiteKey = String(process.env.SITE_KEY || 'madarij').trim().toLowerCase();
export const siteKey = siteConfigs[configuredSiteKey] ? configuredSiteKey : 'madarij';
export const siteName = siteConfigs[siteKey].name;

export function getSiteConfig() {
  return {
    ...siteConfigs[siteKey],
    registrationNumber: process.env.SITE_REGISTRATION_NUMBER ?? siteConfigs[siteKey].registrationNumber,
    whatsappUrl: process.env.PUBLIC_WHATSAPP_URL ?? siteConfigs[siteKey].whatsappUrl,
  };
}
