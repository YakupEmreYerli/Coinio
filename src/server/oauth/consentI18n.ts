export type ConsentLocale = 'en' | 'tr';

/** The first language in Accept-Language (by q, then order) that is English or Turkish; English otherwise. */
export function localeFromAcceptLanguage(header: string | undefined): ConsentLocale {
  if (!header) return 'en';
  const ranked = header
    .split(',')
    .map((part, i) => {
      const [tag = '', ...params] = part.trim().toLowerCase().split(';');
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      return { lang: tag.split('-')[0], q: q === undefined ? 1 : Number(q), i };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  const hit = ranked.find((x) => x.lang === 'en' || x.lang === 'tr');
  return hit?.lang === 'tr' ? 'tr' : 'en';
}

type Strings = {
  signInTitle: string;
  signInLead: string;
  signInLeadConnect: string;
  username: string;
  password: string;
  showPassword: string;
  hidePassword: string;
  signIn: string;
  signingIn: string;
  wrongCredentials: string;
  tooManyAttempts: string;
  networkError: string;
  consentTitle: string;
  wantsAccess: (client: string) => string;
  signedInAs: (user: string) => string;
  willBeAbleTo: string;
  scopeRead: string;
  scopeWrite: string;
  scopeReadTag: string;
  scopeWriteTag: string;
  returnTo: (host: string) => string;
  deny: string;
  allow: string;
  revokeHint: string;
  expiredTitle: string;
  expiredBody: string;
  signedOutTitle: string;
  signedOutBody: string;
  invalidTitle: string;
  invalidBody: string;
  openApp: string;
};

// The client name and username are inserted already escaped, so these stay plain string templates.
export const STRINGS: Record<ConsentLocale, Strings> = {
  en: {
    signInTitle: 'Sign in to Coinio',
    signInLead: 'Welcome back. Sign in with your Coinio account.',
    signInLeadConnect: 'Sign in to continue connecting an app to your Coinio.',
    username: 'Username',
    password: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    wrongCredentials: 'Wrong username or password.',
    tooManyAttempts: 'Too many attempts. Try again in a few minutes.',
    networkError: 'Couldn’t reach Coinio. Check your connection and try again.',
    consentTitle: 'Allow access',
    wantsAccess: (client) => `${client} wants access to your Coinio`,
    signedInAs: (user) => `Signed in as <strong>${user}</strong>`,
    willBeAbleTo: 'It will be able to',
    scopeRead: 'See your subscriptions and payments',
    scopeWrite: 'Add, change and delete subscriptions and record payments',
    scopeReadTag: 'Read only',
    scopeWriteTag: 'Can make changes',
    returnTo: (host) => `You’ll return to <strong>${host}</strong>`,
    deny: 'Deny',
    allow: 'Allow access',
    revokeHint: 'You can revoke access anytime in Settings › Integrations.',
    expiredTitle: 'This request expired',
    expiredBody: 'Go back to the app you were connecting and start again.',
    signedOutTitle: 'You’re signed out',
    signedOutBody: 'Go back to the app you were connecting and start again.',
    invalidTitle: 'Invalid request',
    invalidBody: 'Reload the page and try again.',
    openApp: 'Open Coinio',
  },
  tr: {
    signInTitle: 'Coinio’ya giriş yap',
    signInLead: 'Tekrar hoş geldin. Coinio hesabınla giriş yap.',
    signInLeadConnect: 'Bir uygulamayı Coinio hesabına bağlamaya devam etmek için giriş yap.',
    username: 'Kullanıcı adı',
    password: 'Parola',
    showPassword: 'Parolayı göster',
    hidePassword: 'Parolayı gizle',
    signIn: 'Giriş yap',
    signingIn: 'Giriş yapılıyor…',
    wrongCredentials: 'Kullanıcı adı ya da parola yanlış.',
    tooManyAttempts: 'Çok fazla deneme yaptın. Birkaç dakika sonra yeniden dene.',
    networkError: 'Coinio’ya ulaşılamadı. Bağlantını kontrol edip yeniden dene.',
    consentTitle: 'Erişim izni',
    wantsAccess: (client) => `${client}, Coinio hesabına erişmek istiyor`,
    signedInAs: (user) => `<strong>${user}</strong> olarak giriş yaptın`,
    willBeAbleTo: 'İstediği izinler',
    scopeRead: 'Abonelikleri ve ödemeleri görme',
    scopeWrite: 'Abonelik ekleme, değiştirme, silme ve ödeme kaydetme',
    scopeReadTag: 'Yalnız okuma',
    scopeWriteTag: 'Değişiklik yapabilir',
    returnTo: (host) => `Ardından <strong>${host}</strong> adresine döneceksin`,
    deny: 'Reddet',
    allow: 'İzin ver',
    revokeHint: 'Erişimi istediğin zaman Ayarlar › Entegrasyonlar bölümünden kaldırabilirsin.',
    expiredTitle: 'Bu isteğin süresi doldu',
    expiredBody: 'Bağlamak istediğin uygulamaya dön ve yeniden başlat.',
    signedOutTitle: 'Oturumun kapalı',
    signedOutBody: 'Bağlamak istediğin uygulamaya dön ve yeniden başlat.',
    invalidTitle: 'Geçersiz istek',
    invalidBody: 'Sayfayı yenile ve yeniden dene.',
    openApp: 'Coinio’yu aç',
  },
};
