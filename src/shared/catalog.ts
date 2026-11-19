// Built-in list of popular services for quick adding. No prices: they differ by country and go stale.
// To add one: keep the id unique, the domain bare (it drives the logo), and use an existing category.

export type CategoryKey =
  | 'streaming'
  | 'music'
  | 'books'
  | 'ai'
  | 'cloud'
  | 'productivity'
  | 'security'
  | 'email'
  | 'vpn'
  | 'design'
  | 'devtools'
  | 'hosting'
  | 'gaming'
  | 'social'
  | 'news'
  | 'education'
  | 'health'
  | 'shopping'
  | 'finance'
  | 'telecom'
  | 'bundle';

export const CATEGORY_LABELS: Record<CategoryKey, { en: string; tr: string }> = {
  streaming: { en: 'Streaming', tr: 'Dizi ve film' },
  music: { en: 'Music', tr: 'Müzik' },
  books: { en: 'Books & audio', tr: 'Kitap ve sesli kitap' },
  ai: { en: 'AI', tr: 'Yapay zekâ' },
  cloud: { en: 'Cloud storage', tr: 'Bulut depolama' },
  productivity: { en: 'Productivity', tr: 'Verimlilik' },
  security: { en: 'Passwords & security', tr: 'Parola ve güvenlik' },
  email: { en: 'Email', tr: 'E-posta' },
  vpn: { en: 'VPN', tr: 'VPN' },
  design: { en: 'Design & photo', tr: 'Tasarım ve fotoğraf' },
  devtools: { en: 'Developer tools', tr: 'Geliştirici araçları' },
  hosting: { en: 'Hosting & domains', tr: 'Sunucu ve alan adı' },
  gaming: { en: 'Gaming', tr: 'Oyun' },
  social: { en: 'Social & community', tr: 'Sosyal ve topluluk' },
  news: { en: 'News & reading', tr: 'Haber ve okuma' },
  education: { en: 'Learning', tr: 'Eğitim' },
  health: { en: 'Health & fitness', tr: 'Sağlık ve spor' },
  shopping: { en: 'Shopping & delivery', tr: 'Alışveriş ve teslimat' },
  finance: { en: 'Finance', tr: 'Finans' },
  telecom: { en: 'Phone & internet', tr: 'Telefon ve internet' },
  bundle: { en: 'Bundles', tr: 'Paketler' },
};

export type CatalogEntry = { id: string; name: string; domain: string; category: CategoryKey; cycle: 'monthly' | 'yearly' };

export const CATALOG: CatalogEntry[] = [
  { id: 'netflix', name: 'Netflix', domain: 'netflix.com', category: 'streaming', cycle: 'monthly' },
  { id: 'disney', name: 'Disney+', domain: 'disneyplus.com', category: 'streaming', cycle: 'monthly' },
  { id: 'amazon-prime', name: 'Amazon Prime', domain: 'amazon.com', category: 'shopping', cycle: 'monthly' },
  { id: 'prime-video', name: 'Prime Video', domain: 'primevideo.com', category: 'streaming', cycle: 'monthly' },
  { id: 'hbo-max', name: 'HBO Max', domain: 'max.com', category: 'streaming', cycle: 'monthly' },
  { id: 'apple-tv', name: 'Apple TV+', domain: 'tv.apple.com', category: 'streaming', cycle: 'monthly' },
  { id: 'paramount', name: 'Paramount+', domain: 'paramountplus.com', category: 'streaming', cycle: 'monthly' },
  { id: 'hulu', name: 'Hulu', domain: 'hulu.com', category: 'streaming', cycle: 'monthly' },
  { id: 'peacock', name: 'Peacock', domain: 'peacocktv.com', category: 'streaming', cycle: 'monthly' },
  { id: 'crunchyroll', name: 'Crunchyroll', domain: 'crunchyroll.com', category: 'streaming', cycle: 'monthly' },
  { id: 'mubi', name: 'MUBI', domain: 'mubi.com', category: 'streaming', cycle: 'monthly' },
  { id: 'youtube-premium', name: 'YouTube Premium', domain: 'youtube.com', category: 'streaming', cycle: 'monthly' },
  { id: 'youtube-music', name: 'YouTube Music', domain: 'music.youtube.com', category: 'music', cycle: 'monthly' },
  { id: 'twitch-turbo', name: 'Twitch Turbo', domain: 'twitch.tv', category: 'streaming', cycle: 'monthly' },
  { id: 'exxen', name: 'Exxen', domain: 'exxen.com', category: 'streaming', cycle: 'monthly' },
  { id: 'blutv', name: 'BluTV', domain: 'blutv.com', category: 'streaming', cycle: 'monthly' },
  { id: 'gain', name: 'Gain', domain: 'gain.tv', category: 'streaming', cycle: 'monthly' },
  { id: 'tod', name: 'TOD', domain: 'tod.tv', category: 'streaming', cycle: 'monthly' },
  { id: 'tv-turk-telekom', name: 'TV+ (Türk Telekom)', domain: 'tvplus.com.tr', category: 'streaming', cycle: 'monthly' },
  { id: 'tabii', name: 'Tabii', domain: 'tabii.com', category: 'streaming', cycle: 'monthly' },
  { id: 'spotify', name: 'Spotify', domain: 'spotify.com', category: 'music', cycle: 'monthly' },
  { id: 'apple-music', name: 'Apple Music', domain: 'music.apple.com', category: 'music', cycle: 'monthly' },
  { id: 'tidal', name: 'Tidal', domain: 'tidal.com', category: 'music', cycle: 'monthly' },
  { id: 'deezer', name: 'Deezer', domain: 'deezer.com', category: 'music', cycle: 'monthly' },
  { id: 'soundcloud-go', name: 'SoundCloud Go', domain: 'soundcloud.com', category: 'music', cycle: 'monthly' },
  { id: 'fizy', name: 'Fizy', domain: 'fizy.com', category: 'music', cycle: 'monthly' },
  { id: 'amazon-music', name: 'Amazon Music', domain: 'music.amazon.com', category: 'music', cycle: 'monthly' },
  { id: 'audible', name: 'Audible', domain: 'audible.com', category: 'books', cycle: 'monthly' },
  { id: 'storytel', name: 'Storytel', domain: 'storytel.com', category: 'books', cycle: 'monthly' },
  { id: 'kindle-unlimited', name: 'Kindle Unlimited', domain: 'amazon.com', category: 'books', cycle: 'monthly' },
  { id: 'scribd', name: 'Scribd', domain: 'scribd.com', category: 'books', cycle: 'monthly' },
  { id: 'blinkist', name: 'Blinkist', domain: 'blinkist.com', category: 'books', cycle: 'monthly' },
  { id: 'chatgpt-plus', name: 'ChatGPT Plus', domain: 'chatgpt.com', category: 'ai', cycle: 'monthly' },
  { id: 'claude-pro', name: 'Claude Pro', domain: 'claude.ai', category: 'ai', cycle: 'monthly' },
  { id: 'claude-max', name: 'Claude Max', domain: 'claude.ai', category: 'ai', cycle: 'monthly' },
  { id: 'gemini-advanced', name: 'Gemini Advanced', domain: 'gemini.google.com', category: 'ai', cycle: 'monthly' },
  { id: 'grok-x-premium', name: 'Grok / X Premium', domain: 'x.com', category: 'ai', cycle: 'monthly' },
  { id: 'perplexity-pro', name: 'Perplexity Pro', domain: 'perplexity.ai', category: 'ai', cycle: 'monthly' },
  { id: 'midjourney', name: 'Midjourney', domain: 'midjourney.com', category: 'ai', cycle: 'monthly' },
  { id: 'github-copilot', name: 'GitHub Copilot', domain: 'github.com', category: 'devtools', cycle: 'monthly' },
  { id: 'cursor', name: 'Cursor', domain: 'cursor.com', category: 'devtools', cycle: 'monthly' },
  { id: 'windsurf', name: 'Windsurf', domain: 'windsurf.com', category: 'devtools', cycle: 'monthly' },
  { id: 'elevenlabs', name: 'ElevenLabs', domain: 'elevenlabs.io', category: 'ai', cycle: 'monthly' },
  { id: 'runway', name: 'Runway', domain: 'runwayml.com', category: 'ai', cycle: 'monthly' },
  { id: 'suno', name: 'Suno', domain: 'suno.com', category: 'ai', cycle: 'monthly' },
  { id: 'poe', name: 'Poe', domain: 'poe.com', category: 'ai', cycle: 'monthly' },
  { id: 'mistral-le-chat-pro', name: 'Mistral Le Chat Pro', domain: 'mistral.ai', category: 'ai', cycle: 'monthly' },
  { id: 'icloud', name: 'iCloud+', domain: 'icloud.com', category: 'cloud', cycle: 'monthly' },
  { id: 'google-one', name: 'Google One', domain: 'one.google.com', category: 'cloud', cycle: 'monthly' },
  { id: 'dropbox', name: 'Dropbox', domain: 'dropbox.com', category: 'cloud', cycle: 'monthly' },
  { id: 'onedrive', name: 'OneDrive', domain: 'onedrive.live.com', category: 'cloud', cycle: 'monthly' },
  { id: 'pcloud', name: 'pCloud', domain: 'pcloud.com', category: 'cloud', cycle: 'yearly' },
  { id: 'proton-drive', name: 'Proton Drive', domain: 'proton.me', category: 'cloud', cycle: 'monthly' },
  { id: 'backblaze', name: 'Backblaze', domain: 'backblaze.com', category: 'cloud', cycle: 'monthly' },
  { id: 'mega', name: 'Mega', domain: 'mega.io', category: 'cloud', cycle: 'monthly' },
  { id: 'box', name: 'Box', domain: 'box.com', category: 'cloud', cycle: 'monthly' },
  { id: 'microsoft-365', name: 'Microsoft 365', domain: 'microsoft.com', category: 'productivity', cycle: 'yearly' },
  { id: 'google-workspace', name: 'Google Workspace', domain: 'workspace.google.com', category: 'productivity', cycle: 'monthly' },
  { id: 'notion', name: 'Notion', domain: 'notion.so', category: 'productivity', cycle: 'monthly' },
  { id: 'obsidian-sync', name: 'Obsidian Sync', domain: 'obsidian.md', category: 'productivity', cycle: 'monthly' },
  { id: 'evernote', name: 'Evernote', domain: 'evernote.com', category: 'productivity', cycle: 'monthly' },
  { id: 'todoist', name: 'Todoist', domain: 'todoist.com', category: 'productivity', cycle: 'yearly' },
  { id: 'things', name: 'Things', domain: 'culturedcode.com', category: 'productivity', cycle: 'yearly' },
  { id: 'ticktick', name: 'TickTick', domain: 'ticktick.com', category: 'productivity', cycle: 'yearly' },
  { id: 'raycast-pro', name: 'Raycast Pro', domain: 'raycast.com', category: 'productivity', cycle: 'monthly' },
  { id: 'setapp', name: 'Setapp', domain: 'setapp.com', category: 'productivity', cycle: 'monthly' },
  { id: '1password', name: '1Password', domain: '1password.com', category: 'security', cycle: 'yearly' },
  { id: 'bitwarden', name: 'Bitwarden', domain: 'bitwarden.com', category: 'security', cycle: 'yearly' },
  { id: 'dashlane', name: 'Dashlane', domain: 'dashlane.com', category: 'security', cycle: 'yearly' },
  { id: 'nordpass', name: 'NordPass', domain: 'nordpass.com', category: 'security', cycle: 'yearly' },
  { id: 'proton-pass', name: 'Proton Pass', domain: 'proton.me', category: 'security', cycle: 'monthly' },
  { id: 'proton-mail', name: 'Proton Mail', domain: 'proton.me', category: 'email', cycle: 'monthly' },
  { id: 'fastmail', name: 'Fastmail', domain: 'fastmail.com', category: 'email', cycle: 'monthly' },
  { id: 'hey', name: 'Hey', domain: 'hey.com', category: 'email', cycle: 'yearly' },
  { id: 'nordvpn', name: 'NordVPN', domain: 'nordvpn.com', category: 'vpn', cycle: 'yearly' },
  { id: 'expressvpn', name: 'ExpressVPN', domain: 'expressvpn.com', category: 'vpn', cycle: 'monthly' },
  { id: 'surfshark', name: 'Surfshark', domain: 'surfshark.com', category: 'vpn', cycle: 'yearly' },
  { id: 'mullvad', name: 'Mullvad', domain: 'mullvad.net', category: 'vpn', cycle: 'monthly' },
  { id: 'proton-vpn', name: 'Proton VPN', domain: 'protonvpn.com', category: 'vpn', cycle: 'monthly' },
  { id: 'adobe-creative-cloud', name: 'Adobe Creative Cloud', domain: 'adobe.com', category: 'design', cycle: 'monthly' },
  { id: 'figma', name: 'Figma', domain: 'figma.com', category: 'design', cycle: 'monthly' },
  { id: 'canva-pro', name: 'Canva Pro', domain: 'canva.com', category: 'design', cycle: 'yearly' },
  { id: 'affinity', name: 'Affinity', domain: 'affinity.serif.com', category: 'design', cycle: 'yearly' },
  { id: 'sketch', name: 'Sketch', domain: 'sketch.com', category: 'design', cycle: 'yearly' },
  { id: 'framer', name: 'Framer', domain: 'framer.com', category: 'design', cycle: 'monthly' },
  { id: 'lightroom', name: 'Lightroom', domain: 'lightroom.adobe.com', category: 'design', cycle: 'monthly' },
  { id: 'capcut-pro', name: 'CapCut Pro', domain: 'capcut.com', category: 'design', cycle: 'monthly' },
  { id: 'jetbrains', name: 'JetBrains', domain: 'jetbrains.com', category: 'devtools', cycle: 'yearly' },
  { id: 'github-pro', name: 'GitHub Pro', domain: 'github.com', category: 'devtools', cycle: 'monthly' },
  { id: 'gitlab', name: 'GitLab', domain: 'gitlab.com', category: 'devtools', cycle: 'monthly' },
  { id: 'vercel', name: 'Vercel', domain: 'vercel.com', category: 'hosting', cycle: 'monthly' },
  { id: 'netlify', name: 'Netlify', domain: 'netlify.com', category: 'hosting', cycle: 'monthly' },
  { id: 'cloudflare', name: 'Cloudflare', domain: 'cloudflare.com', category: 'hosting', cycle: 'monthly' },
  { id: 'digitalocean', name: 'DigitalOcean', domain: 'digitalocean.com', category: 'hosting', cycle: 'monthly' },
  { id: 'hetzner', name: 'Hetzner', domain: 'hetzner.com', category: 'hosting', cycle: 'monthly' },
  { id: 'railway', name: 'Railway', domain: 'railway.com', category: 'hosting', cycle: 'monthly' },
  { id: 'fly-io', name: 'Fly.io', domain: 'fly.io', category: 'hosting', cycle: 'monthly' },
  { id: 'render', name: 'Render', domain: 'render.com', category: 'hosting', cycle: 'monthly' },
  { id: 'linode', name: 'Linode', domain: 'linode.com', category: 'hosting', cycle: 'monthly' },
  { id: 'aws', name: 'AWS', domain: 'aws.amazon.com', category: 'hosting', cycle: 'monthly' },
  { id: 'namecheap', name: 'Namecheap', domain: 'namecheap.com', category: 'hosting', cycle: 'yearly' },
  { id: 'godaddy', name: 'GoDaddy', domain: 'godaddy.com', category: 'hosting', cycle: 'yearly' },
  { id: 'squarespace', name: 'Squarespace', domain: 'squarespace.com', category: 'hosting', cycle: 'yearly' },
  { id: 'wix', name: 'Wix', domain: 'wix.com', category: 'hosting', cycle: 'yearly' },
  { id: 'webflow', name: 'Webflow', domain: 'webflow.com', category: 'hosting', cycle: 'monthly' },
  { id: 'shopify', name: 'Shopify', domain: 'shopify.com', category: 'hosting', cycle: 'monthly' },
  { id: 'xbox-game-pass', name: 'Xbox Game Pass', domain: 'xbox.com', category: 'gaming', cycle: 'monthly' },
  { id: 'playstation-plus', name: 'PlayStation Plus', domain: 'playstation.com', category: 'gaming', cycle: 'monthly' },
  { id: 'nintendo-switch-online', name: 'Nintendo Switch Online', domain: 'nintendo.com', category: 'gaming', cycle: 'yearly' },
  { id: 'ea-play', name: 'EA Play', domain: 'ea.com', category: 'gaming', cycle: 'monthly' },
  { id: 'ubisoft', name: 'Ubisoft+', domain: 'ubisoft.com', category: 'gaming', cycle: 'monthly' },
  { id: 'apple-arcade', name: 'Apple Arcade', domain: 'apple.com', category: 'gaming', cycle: 'monthly' },
  { id: 'discord-nitro', name: 'Discord Nitro', domain: 'discord.com', category: 'social', cycle: 'monthly' },
  { id: 'steam', name: 'Steam', domain: 'store.steampowered.com', category: 'gaming', cycle: 'monthly' },
  { id: 'telegram-premium', name: 'Telegram Premium', domain: 'telegram.org', category: 'social', cycle: 'monthly' },
  { id: 'x-premium', name: 'X Premium', domain: 'x.com', category: 'social', cycle: 'monthly' },
  { id: 'linkedin-premium', name: 'LinkedIn Premium', domain: 'linkedin.com', category: 'social', cycle: 'monthly' },
  { id: 'snapchat', name: 'Snapchat+', domain: 'snapchat.com', category: 'social', cycle: 'monthly' },
  { id: 'tinder', name: 'Tinder', domain: 'tinder.com', category: 'social', cycle: 'monthly' },
  { id: 'bumble', name: 'Bumble', domain: 'bumble.com', category: 'social', cycle: 'monthly' },
  { id: 'patreon', name: 'Patreon', domain: 'patreon.com', category: 'social', cycle: 'monthly' },
  { id: 'medium', name: 'Medium', domain: 'medium.com', category: 'news', cycle: 'monthly' },
  { id: 'substack', name: 'Substack', domain: 'substack.com', category: 'news', cycle: 'monthly' },
  { id: 'the-new-york-times', name: 'The New York Times', domain: 'nytimes.com', category: 'news', cycle: 'monthly' },
  { id: 'the-economist', name: 'The Economist', domain: 'economist.com', category: 'news', cycle: 'monthly' },
  { id: 'financial-times', name: 'Financial Times', domain: 'ft.com', category: 'news', cycle: 'monthly' },
  { id: 'bloomberg', name: 'Bloomberg', domain: 'bloomberg.com', category: 'news', cycle: 'monthly' },
  { id: 'the-washington-post', name: 'The Washington Post', domain: 'washingtonpost.com', category: 'news', cycle: 'monthly' },
  { id: 'duolingo', name: 'Duolingo', domain: 'duolingo.com', category: 'education', cycle: 'yearly' },
  { id: 'babbel', name: 'Babbel', domain: 'babbel.com', category: 'education', cycle: 'yearly' },
  { id: 'coursera-plus', name: 'Coursera Plus', domain: 'coursera.org', category: 'education', cycle: 'yearly' },
  { id: 'udemy', name: 'Udemy', domain: 'udemy.com', category: 'education', cycle: 'monthly' },
  { id: 'skillshare', name: 'Skillshare', domain: 'skillshare.com', category: 'education', cycle: 'yearly' },
  { id: 'masterclass', name: 'MasterClass', domain: 'masterclass.com', category: 'education', cycle: 'yearly' },
  { id: 'brilliant', name: 'Brilliant', domain: 'brilliant.org', category: 'education', cycle: 'yearly' },
  { id: 'headspace', name: 'Headspace', domain: 'headspace.com', category: 'health', cycle: 'yearly' },
  { id: 'calm', name: 'Calm', domain: 'calm.com', category: 'health', cycle: 'yearly' },
  { id: 'strava', name: 'Strava', domain: 'strava.com', category: 'health', cycle: 'yearly' },
  { id: 'peloton', name: 'Peloton', domain: 'onepeloton.com', category: 'health', cycle: 'monthly' },
  { id: 'fitbod', name: 'Fitbod', domain: 'fitbod.me', category: 'health', cycle: 'yearly' },
  { id: 'myfitnesspal', name: 'MyFitnessPal', domain: 'myfitnesspal.com', category: 'health', cycle: 'yearly' },
  { id: 'whoop', name: 'Whoop', domain: 'whoop.com', category: 'health', cycle: 'monthly' },
  { id: 'oura', name: 'Oura', domain: 'ouraring.com', category: 'health', cycle: 'monthly' },
  { id: 'apple-one', name: 'Apple One', domain: 'apple.com', category: 'bundle', cycle: 'monthly' },
  { id: 'uber-one', name: 'Uber One', domain: 'uber.com', category: 'shopping', cycle: 'monthly' },
  { id: 'doordash-dashpass', name: 'DoorDash DashPass', domain: 'doordash.com', category: 'shopping', cycle: 'monthly' },
  { id: 'trendyol-plus', name: 'Trendyol Plus', domain: 'trendyol.com', category: 'shopping', cycle: 'monthly' },
  { id: 'hepsiburada-premium', name: 'Hepsiburada Premium', domain: 'hepsiburada.com', category: 'shopping', cycle: 'monthly' },
  { id: 'getir', name: 'Getir', domain: 'getir.com', category: 'shopping', cycle: 'monthly' },
  { id: 'yemeksepeti-club', name: 'Yemeksepeti Club', domain: 'yemeksepeti.com', category: 'shopping', cycle: 'monthly' },
  { id: 'walmart', name: 'Walmart+', domain: 'walmart.com', category: 'shopping', cycle: 'monthly' },
  { id: 'costco', name: 'Costco', domain: 'costco.com', category: 'shopping', cycle: 'yearly' },
  { id: 'revolut', name: 'Revolut', domain: 'revolut.com', category: 'finance', cycle: 'monthly' },
  { id: 'ynab', name: 'YNAB', domain: 'ynab.com', category: 'finance', cycle: 'yearly' },
  { id: 'monarch-money', name: 'Monarch Money', domain: 'monarchmoney.com', category: 'finance', cycle: 'yearly' },
  { id: 'turkcell', name: 'Turkcell', domain: 'turkcell.com.tr', category: 'telecom', cycle: 'monthly' },
  { id: 'vodafone', name: 'Vodafone', domain: 'vodafone.com.tr', category: 'telecom', cycle: 'monthly' },
  { id: 'turk-telekom', name: 'Türk Telekom', domain: 'turktelekom.com.tr', category: 'telecom', cycle: 'monthly' },
  { id: 'superonline', name: 'Superonline', domain: 'superonline.net', category: 'telecom', cycle: 'monthly' },
  { id: 'google-fi', name: 'Google Fi', domain: 'fi.google.com', category: 'telecom', cycle: 'monthly' },
  { id: 'paycell', name: 'Paycell', domain: 'paycell.com.tr', category: 'finance', cycle: 'monthly' },
];

const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();

const INDEX = CATALOG.map((s) => ({ s, name: fold(s.name), domain: s.domain }));

/** Name or domain search, case- and accent-insensitive (Turkish rules); name prefixes first. */
export function searchCatalog(query: string, limit = 8): CatalogEntry[] {
  const q = fold(query);
  if (!q) return [];
  const scored: { s: CatalogEntry; score: number }[] = [];
  for (const { s, name, domain } of INDEX) {
    const score = name.startsWith(q) ? 0 : name.split(' ').some((w) => w.startsWith(q)) ? 1 : domain.startsWith(q) ? 2 : name.includes(q) || domain.includes(q) ? 3 : -1;
    if (score >= 0) scored.push({ s, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.s.name.length - b.s.name.length).slice(0, limit).map((x) => x.s);
}
