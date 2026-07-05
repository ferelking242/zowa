export interface EmailProvider {
  id: string;
  name: string;
  baseUrl: string;
  domains: string[];
  features: {
    freeApi: boolean;
    unlimited: boolean;
    customDomains: boolean;
  };
  description: string;
  apiType?: 'devtai' | 'guerrilla' | 'mailtm';
}

export const EMAIL_PROVIDERS: EmailProvider[] = [
  {
    id: 'devtai',
    name: 'DevTai Email',
    baseUrl: 'https://email.devtai.net/api',
    domains: ['epmtyfl.me', 'antdev.org', 'sptech.io.vn', 'stackfl.site'],
    features: {
      freeApi: true,
      unlimited: true,
      customDomains: false,
    },
    description: 'Service principal — API gratuite et illimitée ✅',
    apiType: 'devtai',
  },
  {
    id: 'guerrilla',
    name: 'Guerrilla Mail',
    baseUrl: 'https://api.guerrillamail.com',
    domains: ['guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'spam4.me', 'grr.la'],
    features: {
      freeApi: true,
      unlimited: true,
      customDomains: false,
    },
    description: '100% gratuit — emails valables 60 minutes ✅',
    apiType: 'guerrilla',
  },
  {
    id: 'mailtm',
    name: 'Mail.tm',
    baseUrl: 'https://api.mail.tm',
    domains: ['web-library.net'],
    features: {
      freeApi: true,
      unlimited: false,
      customDomains: false,
    },
    description: 'Service moderne et sécurisé — API REST officielle ✅',
    apiType: 'mailtm',
  },
];

export const getAllDomains = (): string[] => {
  return EMAIL_PROVIDERS.flatMap(provider => provider.domains);
};

export const getProviderByDomain = (domain: string): EmailProvider | undefined => {
  return EMAIL_PROVIDERS.find(provider => provider.domains.includes(domain));
};

export const getFreeProviders = (): EmailProvider[] => {
  return EMAIL_PROVIDERS.filter(provider => provider.features.freeApi);
};

export const DEFAULT_DOMAIN = EMAIL_PROVIDERS[0].domains[0]; // 'epmtyfl.me'
