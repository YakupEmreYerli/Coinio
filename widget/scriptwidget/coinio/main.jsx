// Coinio: what is left to pay this month and the next payments, from Coinio (getcoinio.me),
// the open-source subscription tracker.
//
// Setup: in Coinio open Settings › Integrations › API keys, create a Read only key and put it in
// this widget's parameter. The free hosted Coinio (app.getcoinio.me) works as is.
// Your own Coinio server: remix this widget, add your host to networkDomains in widget.json, and
// write "https://your.coinio.example coi_read_…" (address, a space, the key) in the parameter.
// The widget only reads GET /api/widget; a read-only key cannot change anything.

const HOSTED = "https://app.getcoinio.me";
const CACHE = "coinio.widget.v1";

// Texts follow the device language; English when it is not one Coinio speaks.
const STRINGS = {
  en: { left: "Left this month", today: "today", tomorrow: "tomorrow", inDays: (n) => `in ${n}d`, late: (n) => `${n}d late`, none: "No upcoming payments", offline: "offline", unreachable: "Can't reach Coinio", auth: "API key rejected. Check the widget parameter.", setup: "Put a Coinio read-only API key in the widget parameter." },
  tr: { left: "Bu ay kalan", today: "bugün", tomorrow: "yarın", inDays: (n) => `${n} gün`, late: (n) => `${n} gün gecikti`, none: "Yaklaşan ödeme yok", offline: "çevrimdışı", unreachable: "Coinio'ya ulaşılamıyor", auth: "API anahtarı kabul edilmedi. Widget ayarını kontrol et.", setup: "Widget ayarına Coinio'nun okuma anahtarını yaz." },
  de: { left: "Diesen Monat offen", today: "heute", tomorrow: "morgen", inDays: (n) => `in ${n} T.`, late: (n) => `${n} T. überfällig`, none: "Keine anstehenden Zahlungen", offline: "offline", unreachable: "Coinio nicht erreichbar", auth: "API-Schlüssel abgelehnt. Widget-Parameter prüfen.", setup: "Tragen Sie einen Nur-Lese-Schlüssel von Coinio als Widget-Parameter ein." },
  fr: { left: "Reste ce mois-ci", today: "aujourd’hui", tomorrow: "demain", inDays: (n) => `dans ${n} j`, late: (n) => `${n} j de retard`, none: "Aucun paiement à venir", offline: "hors ligne", unreachable: "Coinio injoignable", auth: "Clé API refusée. Vérifiez le paramètre du widget.", setup: "Mettez une clé Coinio en lecture seule dans le paramètre du widget." },
  es: { left: "Queda este mes", today: "hoy", tomorrow: "mañana", inDays: (n) => `en ${n} d`, late: (n) => `${n} d de retraso`, none: "No hay pagos próximos", offline: "sin conexión", unreachable: "No se puede conectar con Coinio", auth: "Clave API rechazada. Revisa el parámetro del widget.", setup: "Pon una clave de solo lectura de Coinio en el parámetro del widget." },
  pt: { left: "Falta este mês", today: "hoje", tomorrow: "amanhã", inDays: (n) => `em ${n} d`, late: (n) => `${n} d de atraso`, none: "Nenhum pagamento próximo", offline: "offline", unreachable: "Não foi possível acessar o Coinio", auth: "Chave de API recusada. Confira o parâmetro do widget.", setup: "Coloque uma chave somente leitura do Coinio no parâmetro do widget." },
  zh: { left: "本月待付", today: "今天", tomorrow: "明天", inDays: (n) => `${n} 天后`, late: (n) => `逾期 ${n} 天`, none: "近期没有付款", offline: "离线", unreachable: "无法连接 Coinio", auth: "API 密钥被拒绝，请检查小组件参数。", setup: "请在小组件参数中填入 Coinio 的只读密钥。" },
  ja: { left: "今月の残り", today: "今日", tomorrow: "明日", inDays: (n) => `${n}日後`, late: (n) => `${n}日超過`, none: "予定の支払いはありません", offline: "オフライン", unreachable: "Coinio に接続できません", auth: "API キーが拒否されました。ウィジェットのパラメータを確認してください。", setup: "ウィジェットのパラメータに Coinio の読み取り専用キーを入力してください。" },
};
const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
  de: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."],
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"],
  pt: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
};
const rawLang = typeof $device.language === "function" ? $device.language() : $device.language;
const LANG = String(rawLang || "en").toLowerCase().split(/[-_]/)[0];
const L = STRINGS[LANG] || STRINGS.en;

// Parameter: "coi_read_…" for the hosted Coinio, or "https://host coi_read_…" for your own.
function settings(param) {
  const parts = String(param || "").trim().split(/\s+/).filter(Boolean);
  const key = parts.find((p) => /^coi_/.test(p)) || "";
  const url = parts.find((p) => /^https?:\/\//i.test(p)) || HOSTED;
  return { key, base: url.replace(/\/+$/, "") };
}

// Fresh data when Coinio answers; the saved copy (marked offline) when it does not;
// a clear message for a rejected key or a missing parameter.
async function load(cfg, projection) {
  const saved = $storage.getJSON(CACHE);
  const cached = saved && saved.data && saved.base === cfg.base ? saved : null;
  if (!cfg.key) return { error: L.setup };
  if (projection) return cached ? { data: cached.data, at: cached.at, offline: false } : { error: L.unreachable };
  try {
    const res = await $http.getResponse(`${cfg.base}/api/widget`, { headers: { Authorization: `Bearer ${cfg.key}`, Accept: "application/json" } });
    if (res && (res.status === 401 || res.status === 403)) return { error: L.auth };
    if (res && res.status === 200) {
      const data = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
      if (data && Array.isArray(data.items)) {
        $storage.setJSON(CACHE, { base: cfg.base, at: Date.now(), data });
        return { data, at: Date.now(), offline: false };
      }
    }
  } catch (e) {
    // fall through to the saved copy
  }
  return cached ? { data: cached.data, at: cached.at, offline: true } : { error: L.unreachable };
}

const SYMBOLS = { USD: "$", EUR: "€", GBP: "£", TRY: "₺", JPY: "¥", CNY: "¥", INR: "₹", BRL: "R$", KRW: "₩", RUB: "₽", CHF: "CHF ", CAD: "CA$", AUD: "A$" };
// Minor units with the payload's decimals per currency; whole amounts drop the cents.
function money(minor, currency, digits) {
  const d = digits && digits[currency] !== undefined ? digits[currency] : 2;
  const scale = Math.pow(10, d);
  const whole = minor % scale === 0;
  const value = (minor / scale).toFixed(whole ? 0 : d);
  const [int, frac] = value.split(".");
  const comma = ["tr", "de", "fr", "es", "pt"].includes(LANG);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, comma ? "." : ",");
  const amount = frac ? grouped + (comma ? "," : ".") + frac : grouped;
  const symbol = SYMBOLS[currency];
  return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
}
function shortDate(iso) {
  const [, m, d] = iso.split("-").map(Number);
  if (LANG === "zh" || LANG === "ja") return `${m}/${d}`;
  const names = MONTHS[LANG] || MONTHS.en;
  return LANG === "en" ? `${names[m - 1]} ${d}` : `${d} ${names[m - 1]}`;
}
function when(daysLeft) {
  if (daysLeft === 0) return L.today;
  if (daysLeft === 1) return L.tomorrow;
  return daysLeft < 0 ? L.late(-daysLeft) : L.inDays(daysLeft);
}
function clock(ms) {
  const t = new Date(ms);
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

const cfg = settings($getenv("widget-param"));
const result = await load(cfg, $getenv("timeline-is-projection") === "true");
const size = $getenv("widget-size");
const dark = $device.isdarkmode();
const background = dark ? "#1c1c1e" : "#ffffff",
  text = dark ? "#ffffff" : "#14152a",
  muted = dark ? "#a1a1aa" : "#6b6f86",
  accent = dark ? "#9ea3ff" : "#4f5bd5",
  late = "#e5484d";

if (result.error) {
  if (size === "accessoryInline" || size === "accessoryCircular" || size === "accessoryRectangular") {
    $render(<text>Coinio</text>);
  } else {
    $render(
      <vstack frame="max,leading" alignment="leading" padding="14" spacing="6" background={background}>
        <text font="caption" weight="semibold" color={accent}>Coinio</text>
        <text font="caption" color={muted}>{result.error}</text>
      </vstack>,
    );
  }
} else {
  const data = result.data;
  const items = data.items || [];
  const first = items[0];
  const total = money(data.leftThisMonthMinor, data.base, data.digits);

  const Row = ({ item, dated, withDay }) => (
    <vstack alignment="leading" spacing="0">
      <hstack spacing="6">
        <text font="caption" weight="semibold" color={item.daysLeft < 0 ? late : text} lineLimit="1">{item.name}</text>
        <spacer />
        <text font="caption2" color={muted} lineLimit="1">
          {dated ? `${shortDate(item.dueDate)} · ${money(item.amountMinor, item.currency, data.digits)}` : money(item.amountMinor, item.currency, data.digits)}
        </text>
      </hstack>
      {withDay ? <text font="caption2" color={item.daysLeft < 0 ? late : muted}>{when(item.daysLeft)}</text> : null}
    </vstack>
  );
  const Header = ({ big }) => (
    <vstack alignment="leading" spacing="2">
      <hstack>
        <text font="caption2" weight="semibold" color={accent}>{L.left.toUpperCase()}</text>
        <spacer />
        {result.offline ? <text font="caption2" color={muted}>{`${L.offline} · ${clock(result.at)}`}</text> : null}
      </hstack>
      <text font={big ? "title" : "title2"} weight="bold" color={text}>{total}</text>
      <rect frame="max,1" color={accent} />
    </vstack>
  );

  if (size === "accessoryInline") {
    $render(<text>{first ? `${first.name} · ${shortDate(first.dueDate)} · ${money(first.amountMinor, first.currency, data.digits)}` : L.none}</text>);
  } else if (size === "accessoryCircular") {
    $render(
      <vstack spacing="0">
        <text font="title3" weight="bold">{first ? (first.daysLeft < 0 ? "!" : String(first.daysLeft)) : "–"}</text>
        <text font="caption2" lineLimit="1">{first ? first.name : "Coinio"}</text>
      </vstack>,
    );
  } else if (size === "accessoryRectangular") {
    $render(
      <vstack alignment="leading" spacing="1">
        {items.length ? items.slice(0, 3).map((it) => (
          <text font="caption" lineLimit="1">{`${it.daysLeft < 0 ? "! " : ""}${it.name} · ${money(it.amountMinor, it.currency, data.digits)}`}</text>
        )) : <text font="caption">{L.none}</text>}
      </vstack>,
    );
  } else {
    const count = size === "small" ? 3 : size === "medium" ? 3 : 6;
    const dated = size !== "small";
    const withDay = size === "large" || size === "extraLarge";
    $render(
      <vstack frame="max" alignment="leading" padding="14" spacing="6" background={background}>
        <Header big={size !== "small"} />
        {items.length ? items.slice(0, count).map((it) => <Row item={it} dated={dated} withDay={withDay} />) : <text font="caption" color={muted}>{L.none}</text>}
        <spacer />
      </vstack>,
    );
  }
}
