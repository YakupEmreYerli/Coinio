import { describe, expect, it } from 'vitest';
import { renderTemplate, templateError, usedVariables } from './template';

describe('renderTemplate', () => {
  it('replaces variables and leaves unknown ones empty', () => {
    expect(renderTemplate('Hi {{name}}, {{ missing }}!', { name: 'Netflix' }, 'text')).toBe('Hi Netflix, !');
  });

  it('loops over arrays, with item fields first and outer fields as fallback', () => {
    const out = renderTemplate('{{#items}}- {{name}} ({{currency}})\n{{/items}}', {
      currency: 'TRY',
      items: [{ name: 'A' }, { name: 'B', currency: 'USD' }],
    }, 'text');
    expect(out).toBe('- A (TRY)\n- B (USD)\n');
  });

  it('treats a non-array section as a condition and ^ as its inverse', () => {
    const t = '{{#autoPay}}charged{{/autoPay}}{{^autoPay}}pay by hand{{/autoPay}}';
    expect(renderTemplate(t, { autoPay: true }, 'text')).toBe('charged');
    expect(renderTemplate(t, { autoPay: false }, 'text')).toBe('pay by hand');
    expect(renderTemplate('{{#notes}}Note: {{notes}}{{/notes}}', { notes: '' }, 'text')).toBe('');
    expect(renderTemplate('{{^items}}nothing{{/items}}', { items: [] }, 'text')).toBe('nothing');
  });

  it('never runs code or reads properties outside the variables', () => {
    expect(renderTemplate('{{constructor}}{{__proto__}}{{toString}}', {}, 'text')).toBe('');
    expect(renderTemplate('{{name.length}}', { name: 'abc' }, 'text')).toBe('{{name.length}}');
  });

  it('converts the Markdown subset to Telegram HTML and escapes values', () => {
    const out = renderTemplate('**{{name}}** _soon_ [open]({{link}})', { name: 'A<b>&Co', link: 'https://x.test/?a=1&b=2' }, 'telegram');
    expect(out).toBe('<b>A&lt;b&gt;&amp;Co</b> <i>soon</i> <a href="https://x.test/?a=1&amp;b=2">open</a>');
  });

  it('escapes literal HTML in the template itself for HTML targets', () => {
    expect(renderTemplate('<script>{{name}}</script>', { name: 'x' }, 'html')).toBe('&lt;script&gt;x&lt;/script&gt;');
  });

  it('renders simple HTML with line breaks', () => {
    expect(renderTemplate('**{{name}}**\nline', { name: 'N' }, 'html')).toBe('<b>N</b><br>\nline');
  });

  it('converts to Slack mrkdwn', () => {
    expect(renderTemplate('**{{name}}** _x_ [open]({{link}})', { name: 'a*b', link: 'https://x.test' }, 'slack')).toBe(
      '*a*b* _x_ <https://x.test|open>',
    );
    expect(renderTemplate('{{name}}', { name: '<@here> & co' }, 'slack')).toBe('&lt;@here&gt; &amp; co');
  });

  it('keeps Markdown and escapes Markdown characters in values', () => {
    expect(renderTemplate('**{{name}}**', { name: 'a_b*c' }, 'markdown')).toBe('**a\\_b\\*c**');
  });

  it('strips the Markdown markers for plain text', () => {
    expect(renderTemplate('**{{name}}** _soon_ [open]({{link}})', { name: 'N*', link: 'https://x.test' }, 'text')).toBe(
      'N* soon open (https://x.test)',
    );
  });

  it('escapes values as JSON string content', () => {
    const out = renderTemplate('{"text":"{{name}}"}', { name: 'say "hi"\n\\' }, 'json');
    expect(JSON.parse(out)).toEqual({ text: 'say "hi"\n\\' });
  });

  it('prints numbers and booleans', () => {
    expect(renderTemplate('{{n}} {{b}}', { n: 3, b: true }, 'text')).toBe('3 true');
  });
});

describe('templateError', () => {
  it('reports unclosed and mismatched sections', () => {
    expect(templateError('{{#items}}x')).toBe('unclosed:items');
    expect(templateError('{{#a}}{{/b}}')).toBe('mismatch:b');
    expect(templateError('{{/a}}')).toBe('mismatch:a');
    expect(templateError('{{#a}}{{name}}{{/a}}')).toBeNull();
  });
});

describe('usedVariables', () => {
  it('lists variable and section names', () => {
    expect(usedVariables('{{name}} {{#items}}{{amount}}{{/items}}')).toEqual(['name', 'items', 'amount']);
  });
});
