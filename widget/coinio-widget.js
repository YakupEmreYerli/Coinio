// coinio widget for Scriptable (iOS). Home Screen (small, medium, large) and Lock Screen (inline, rectangular, circular).
// Setup: paste this into a new Scriptable script, fill in the two lines below, add a Scriptable
// widget and pick this script. A read-only API key (Settings › Integrations › API keys) is enough.

const SERVER_URL = 'https://subs.example.com'; // where you open the app, no trailing slash
const API_KEY = 'coi_read_…'; // Settings › Integrations › API keys › Read only

const BASE_URL = SERVER_URL.replace(/\/+$/, ''); // a pasted trailing slash would break the request
const CACHE_FILE = 'coinio-widget.json';
const ACCENT = new Color('#4f5bd5');
const RED = new Color('#e5484d');
// Texts follow the device language; English when it isn't one Coinio speaks.
const STRINGS = {
  en: { left: 'Left this month', today: 'today', tomorrow: 'tomorrow', inDays: (n) => `in ${n}d`, late: (n) => `${n}d late`, none: 'No upcoming payments', offline: 'offline', unreachable: "Can't reach Coinio", auth: 'API key rejected, check API_KEY', setup: 'Set SERVER_URL and API_KEY' },
  tr: { left: 'Bu ay kalan', today: 'bugün', tomorrow: 'yarın', inDays: (n) => `${n} gün`, late: (n) => `${n} gün gecikti`, none: 'Yaklaşan ödeme yok', offline: 'çevrimdışı', unreachable: "Coinio'ya ulaşılamıyor", auth: "API anahtarı kabul edilmedi, API_KEY'i kontrol et", setup: 'SERVER_URL ve API_KEY ayarla' },
  de: { left: 'Diesen Monat offen', today: 'heute', tomorrow: 'morgen', inDays: (n) => `in ${n} T.`, late: (n) => `${n} T. überfällig`, none: 'Keine anstehenden Zahlungen', offline: 'offline', unreachable: 'Coinio nicht erreichbar', auth: 'API-Schlüssel abgelehnt, API_KEY prüfen', setup: 'SERVER_URL und API_KEY eintragen' },
  fr: { left: 'Reste ce mois-ci', today: 'aujourd’hui', tomorrow: 'demain', inDays: (n) => `dans ${n} j`, late: (n) => `${n} j de retard`, none: 'Aucun paiement à venir', offline: 'hors ligne', unreachable: 'Coinio injoignable', auth: 'Clé API refusée, vérifiez API_KEY', setup: 'Renseignez SERVER_URL et API_KEY' },
  es: { left: 'Queda este mes', today: 'hoy', tomorrow: 'mañana', inDays: (n) => `en ${n} d`, late: (n) => `${n} d de retraso`, none: 'No hay pagos próximos', offline: 'sin conexión', unreachable: 'No se puede conectar con Coinio', auth: 'Clave API rechazada, revisa API_KEY', setup: 'Configura SERVER_URL y API_KEY' },
  pt: { left: 'Falta este mês', today: 'hoje', tomorrow: 'amanhã', inDays: (n) => `em ${n} d`, late: (n) => `${n} d de atraso`, none: 'Nenhum pagamento próximo', offline: 'offline', unreachable: 'Não foi possível acessar o Coinio', auth: 'Chave de API recusada, confira a API_KEY', setup: 'Defina SERVER_URL e API_KEY' },
  zh: { left: '本月待付', today: '今天', tomorrow: '明天', inDays: (n) => `${n} 天后`, late: (n) => `逾期 ${n} 天`, none: '近期没有付款', offline: '离线', unreachable: '无法连接 Coinio', auth: 'API 密钥被拒绝，请检查 API_KEY', setup: '请设置 SERVER_URL 和 API_KEY' },
  ja: { left: '今月の残り', today: '今日', tomorrow: '明日', inDays: (n) => `${n}日後`, late: (n) => `${n}日超過`, none: '予定の支払いはありません', offline: 'オフライン', unreachable: 'Coinio に接続できません', auth: 'API キーが拒否されました。API_KEY を確認してください', setup: 'SERVER_URL と API_KEY を設定してください' },
};
const INTL = { en: 'en-US', tr: 'tr-TR', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR', zh: 'zh-CN', ja: 'ja-JP' };
const LANG = String(Device.language() || 'en').toLowerCase().split(/[-_]/)[0];
const L = STRINGS[LANG] || STRINGS.en;
const LOCALE = INTL[LANG] || INTL.en;

// A rejected key is reported as such (not as "offline" over old data); anything else falls back to the cache.
async function load() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
  try {
    const req = new Request(`${BASE_URL}/api/widget`);
    req.headers = { Authorization: `Bearer ${API_KEY}` };
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    const status = req.response && req.response.statusCode;
    if (status === 401 || status === 403) return { data: null, error: L.auth };
    if (!data || !Array.isArray(data.items)) throw new Error('bad response');
    fm.writeString(path, JSON.stringify(data));
    return { data, offline: false };
  } catch (e) {
    if (fm.fileExists(path)) return { data: JSON.parse(fm.readString(path)), offline: true };
    return { data: null, error: L.unreachable };
  }
}

const money = (minor, currency) => {
  try {
    const digits = minor % 100 === 0 ? 0 : 2;
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
};
const clock = (iso) => new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const shortDate = (iso) => new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const when = (d) => (d < 0 ? L.late(-d) : d === 0 ? L.today : d === 1 ? L.tomorrow : L.inDays(d));
const amountOf = (it, base) => (it.baseMinor != null ? money(it.baseMinor, base) : money(it.amountMinor, it.currency));

function row(stack, it, base, opts) {
  const r = stack.addStack();
  r.centerAlignContent();
  const late = it.daysLeft < 0;
  const name = r.addText(`${opts.lock && late ? '⚠ ' : ''}${it.name}`);
  name.font = Font.semiboldSystemFont(opts.size);
  name.lineLimit = 1;
  if (!opts.lock && late) name.textColor = RED;
  r.addSpacer();
  const right = r.addText(`${shortDate(it.dueDate)} · ${amountOf(it, base)}`);
  right.font = Font.mediumMonospacedSystemFont(opts.size - 1);
  right.textOpacity = 0.75;
  if (!opts.compact) {
    const sub = stack.addText(when(it.daysLeft));
    sub.font = Font.systemFont(opts.size - 3);
    sub.textColor = late && !opts.lock ? RED : Color.gray();
  }
}

async function build() {
  const family = config.widgetFamily || 'medium';
  const w = new ListWidget();
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  w.url = BASE_URL;
  if (SERVER_URL.includes('example.com')) {
    w.addText(L.setup).font = Font.systemFont(12);
    return w;
  }
  const { data, offline, error } = await load();
  if (!data) {
    w.addText(error).font = Font.systemFont(12);
    return w;
  }
  const items = data.items;
  const first = items[0];

  if (family === 'accessoryInline') {
    w.addText(first ? `${first.name} · ${shortDate(first.dueDate)} · ${amountOf(first, data.base)}` : L.none);
    return w;
  }
  if (family === 'accessoryRectangular') {
    if (!items.length) w.addText(L.none).font = Font.systemFont(12);
    for (const it of items.slice(0, 3)) row(w, it, data.base, { size: 12, lock: true, compact: true });
    return w;
  }
  if (family === 'accessoryCircular') {
    // Days until the next payment, its name underneath.
    const days = w.addText(first ? (first.daysLeft < 0 ? '⚠' : String(first.daysLeft)) : '–');
    days.font = Font.boldRoundedSystemFont(20);
    if (first) {
      const name = w.addText(first.name);
      name.font = Font.systemFont(9);
      name.lineLimit = 1;
      name.minimumScaleFactor = 0.6;
    }
    return w;
  }

  w.backgroundColor = Color.dynamic(new Color('#fbfaf7'), new Color('#0f1117'));
  w.setPadding(14, 14, 14, 14);
  const head = w.addStack();
  const label = head.addText(L.left);
  label.font = Font.mediumSystemFont(11);
  label.textOpacity = 0.6;
  head.addSpacer();
  if (offline) {
    const off = head.addText(data.generatedAt ? `${L.offline} · ${clock(data.generatedAt)}` : L.offline);
    off.font = Font.systemFont(10);
    off.textColor = Color.orange();
  }
  const total = w.addText(money(data.leftThisMonthMinor, data.base));
  total.font = Font.boldRoundedSystemFont(family === 'small' ? 22 : 26);
  total.minimumScaleFactor = 0.6;
  const bar = w.addStack();
  bar.size = new Size(0, 2);
  bar.backgroundColor = ACCENT;
  w.addSpacer(8);

  const count = family === 'small' ? 1 : family === 'medium' ? 4 : 8;
  if (!items.length) w.addText(L.none).font = Font.systemFont(12);
  for (const it of items.slice(0, count)) {
    row(w, it, data.base, { size: family === 'small' ? 13 : 12, lock: false, compact: family === 'medium' });
    w.addSpacer(family === 'small' ? 2 : 4);
  }
  w.addSpacer();
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
