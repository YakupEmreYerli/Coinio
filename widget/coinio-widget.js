// coinio widget for Scriptable (iOS). Home Screen (small, medium, large) and Lock Screen.
// Setup: paste this into a new Scriptable script, fill in the two lines below, add a Scriptable
// widget and pick this script. A read-only API key (Settings › API keys) is enough.

const SERVER_URL = 'https://subs.example.com'; // where you open the app, no trailing slash
const API_KEY = 'st_read_…'; // Settings › API keys › Read only

const CACHE_FILE = 'coinio-widget.json';
const ACCENT = new Color('#4f5bd5');
const RED = new Color('#e5484d');
const TR = Device.language().startsWith('tr');
const L = TR
  ? { left: 'Bu ay kalan', today: 'bugün', tomorrow: 'yarın', inDays: (n) => `${n} gün`, late: (n) => `${n} gün gecikti`, none: 'Yaklaşan ödeme yok', offline: 'çevrimdışı', setup: 'SERVER_URL ve API_KEY ayarla' }
  : { left: 'Left this month', today: 'today', tomorrow: 'tomorrow', inDays: (n) => `in ${n}d`, late: (n) => `${n}d late`, none: 'No upcoming payments', offline: 'offline', setup: 'Set SERVER_URL and API_KEY' };

async function load() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
  try {
    const req = new Request(`${SERVER_URL}/api/widget`);
    req.headers = { Authorization: `Bearer ${API_KEY}` };
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    if (!data || !Array.isArray(data.items)) throw new Error('bad response');
    fm.writeString(path, JSON.stringify(data));
    return { data, offline: false };
  } catch (e) {
    if (fm.fileExists(path)) return { data: JSON.parse(fm.readString(path)), offline: true };
    return { data: null, offline: true };
  }
}

const money = (minor, currency) => {
  try {
    return new Intl.NumberFormat(TR ? 'tr-TR' : 'en-US', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
};
const shortDate = (iso) => new Intl.DateTimeFormat(TR ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
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
  const right = r.addText(opts.compact ? amountOf(it, base) : `${shortDate(it.dueDate)} · ${amountOf(it, base)}`);
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
  w.url = SERVER_URL;
  if (SERVER_URL.includes('example.com')) {
    w.addText(L.setup).font = Font.systemFont(12);
    return w;
  }
  const { data, offline } = await load();
  if (!data) {
    w.addText(`${L.offline} · ${L.none}`).font = Font.systemFont(12);
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
    for (const it of items.slice(0, 2)) row(w, it, data.base, { size: 13, lock: true, compact: false });
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
    const off = head.addText(L.offline);
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
    row(w, it, data.base, { size: family === 'small' ? 13 : 12, lock: false, compact: family !== 'small' });
    w.addSpacer(family === 'small' ? 2 : 4);
  }
  w.addSpacer();
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
