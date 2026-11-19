// Install tabs, copy buttons, theme switch, live demo, nav border on scroll.

for (const box of document.querySelectorAll('[data-tabs]')) {
  const tabs = [...box.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for http:// previews and older browsers.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

for (const btn of document.querySelectorAll('.copy')) {
  const label = btn.querySelector('span');
  const original = label.textContent;
  let timer;
  btn.addEventListener('click', async () => {
    const text = btn.dataset.copy ?? btn.parentElement.querySelector('code').textContent.trim();
    const ok = await copyText(text);
    label.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    btn.classList.toggle('is-done', ok);
    btn.setAttribute('aria-label', ok ? 'Copied' : 'Copy failed');
    clearTimeout(timer);
    timer = setTimeout(() => {
      label.textContent = original;
      btn.classList.remove('is-done');
      btn.setAttribute('aria-label', 'Copy');
    }, 1800);
  });
}

// Theme: dark or light, remembered per visitor; the demo and its poster follow along.
const root = document.documentElement;
const themeBtn = document.querySelector('.theme-btn');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const currentTheme = () => (root.dataset.theme === 'light' ? 'light' : 'dark');

function applyTheme(theme, remember) {
  root.dataset.theme = theme;
  themeMeta.content = theme === 'light' ? '#f8f8fb' : '#07080c';
  themeBtn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  if (remember) {
    try { localStorage.setItem('coinio-site-theme', theme); } catch { /* storage blocked */ }
  }
  syncDemoTheme();
}

themeBtn.addEventListener('click', () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light', true));
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
  let stored = null;
  try { stored = localStorage.getItem('coinio-site-theme'); } catch { /* storage blocked */ }
  if (!stored) applyTheme(e.matches ? 'light' : 'dark', false);
});

// Live demo: the iframe loads when it comes near (desktop only), Expand pins the same window over the page.
const frame = document.querySelector('.demo-view iframe');
const win = document.querySelector('.demo-win');
const appTheme = () => (currentTheme() === 'light' ? 'paper' : 'night');
const demoUrl = () => `demo/?theme=${currentTheme()}`;

function syncDemoTheme() {
  for (const a of document.querySelectorAll('[data-demo-link]')) a.href = demoUrl();
  for (const img of document.querySelectorAll('.demo-poster img')) img.classList.toggle('is-on', img.dataset.theme === currentTheme());
  if (frame?.src) frame.contentWindow?.postMessage({ type: 'coinio:theme', theme: appTheme() }, location.origin);
}
syncDemoTheme();

const desktop = window.matchMedia('(min-width: 768px)');
function loadDemo() {
  if (frame && !frame.src && desktop.matches) frame.src = demoUrl();
}
if (frame) {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      loadDemo();
      if (frame.src) io.disconnect();
    }
  }, { rootMargin: '600px 0px' });
  io.observe(frame);
  desktop.addEventListener('change', loadDemo);
}

let lastFocus = null;
function openDemo() {
  loadDemo();
  lastFocus = document.activeElement;
  win.classList.add('is-expanded');
  root.classList.add('is-demo-open');
  win.querySelector('.win-close').focus();
}
function closeDemo() {
  if (!win.classList.contains('is-expanded')) return;
  win.classList.remove('is-expanded');
  root.classList.remove('is-demo-open');
  lastFocus?.focus?.();
}
for (const b of document.querySelectorAll('[data-demo-expand]')) b.addEventListener('click', openDemo);
for (const b of document.querySelectorAll('[data-demo-close]')) b.addEventListener('click', closeDemo);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDemo();
});
window.addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data?.type === 'coinio:escape') closeDemo();
});

const nav = document.querySelector('.nav');
const onScroll = () => nav.classList.toggle('is-stuck', window.scrollY > 8);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });
