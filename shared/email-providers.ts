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
  apiType?: 'devtai' | 'guerrilla' | 'onesecmail' | 'maildrop' | 'tempmail';
}

export const EMAIL_PROVIDERS: EmailProvider[] = [
  {
    id: 'tempmail',
    name: 'TempMail Official',
    baseUrl: 'https://api.temp-mail.org/request',
    domains: ['homephit.com'],
    features: {
      freeApi: true,
      unlimited: true,
      customDomains: false,
    },
    description: 'The Official TempMail — top#1 temp email service. Domains fiables, non bloqués.',
    apiType: 'tempmail',
  },
  {
    id: 'devtai',
    name: 'DevTai Email',
    baseUrl: 'https://email.devtai.net/api',
    domains: ['antdev.org', 'epmtyfl.me', 'sptech.io.vn', 'stackfl.site'],
    features: {
      freeApi: true,
      unlimited: true,
      customDomains: false,
    },
    description: 'Service principal avec API gratuite et illimitée',
    apiType: 'devtai',
  },
  {
    id: 'guerrilla',
    name: 'Guerrilla Mail',
    baseUrl: 'https://api.guerrillamail.com',
    domains: ['guerrillamail.com', 'guerrillamail.net', 'guerrillamailblock.com'],
    features: {
      freeApi: true,
      unlimited: true,
      customDomains: false,
    },
    description: '100% gratuit, API publique et ouverte, emails valables 60 minutes',
    apiType: 'guerrilla',
  },
  {
    id: 'onesecmail',
    name: '1SecMail',
    baseUrl: 'https://www.1secmail.com/api',
    domains: ['1secmail.com', '1secmail.org', '1secmail.net'],
    features: {
      freeApi: true,
      unlimited: true,
      customDomains: false,
    },
    description: 'API simple et gratuite, emails actifs pendant 2 jours',
    apiType: 'onesecmail',
  },
  {
    id: 'maildrop',
    name: 'Maildrop',
    baseUrl: 'https://maildrop.cc/api/graphql',
    domains: ['maildrop.cc'],
    features: {
      freeApi: true,
      unlimited: true,
      customDomains: false,
    },
    description: 'API GraphQL moderne avec filtrage spam intégré',
    apiType: 'maildrop',
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
