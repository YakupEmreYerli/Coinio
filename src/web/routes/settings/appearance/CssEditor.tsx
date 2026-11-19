import { useEffect, useState } from 'react';
import { t } from '../../../i18n';

const VARS = ['--bg', '--card', '--sunk', '--line', '--text', '--text-2', '--accent', '--primary', '--pos', '--neg', '--radius', '--gap', '--logo', '--font-text', '--font-display', '--font-num'];

/** Plain CSS box applied live, with the design variables listed beside it (click to insert). */
export function CssEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setVals(Object.fromEntries(VARS.map((v) => [v, cs.getPropertyValue(v).trim()])));
  }, [value]);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <textarea
        aria-label={t('look.css')}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={':root {\n  --accent: #ff3d7f;\n  --radius: 18px;\n}'}
        className="num min-h-56 w-full rounded-ctl border border-line-2 bg-sunk p-3 text-[12.5px] leading-relaxed text-text outline-none focus:border-accent"
      />
      <div className="flex flex-col gap-1">
        <span className="text-xs text-text-3">{t('look.cssVars')}</span>
        <ul className="max-h-56 overflow-y-auto rounded-ctl border border-line">
          {VARS.map((v) => (
            <li key={v}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-sunk"
                onClick={() => onChange(`${value}${value && !value.endsWith('\n') ? '\n' : ''}:root { ${v}: ${vals[v] || ''}; }\n`)}
              >
                <code className="num text-text">{v}</code>
                <span className="ml-auto truncate text-text-3">{vals[v]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
