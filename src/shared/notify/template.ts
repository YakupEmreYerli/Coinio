// A tiny, logic-less template language for notification messages (a Mustache subset).
//   {{name}}               a variable
//   {{#items}}…{{/items}}  a loop over an array, or a block shown when the value is truthy
//   {{^items}}…{{/items}}  a block shown when the value is falsy or an empty list
// Only own properties of the given variables are read; nothing is ever evaluated.
// Message bodies are written in a small Markdown subset (**bold**, _italic_, [text](url)) that is turned into
// each channel's own format before the (escaped) values are put in.

export type Format = 'text' | 'markdown' | 'telegram' | 'slack' | 'html' | 'json';

export type TemplateValue = string | number | boolean | null | undefined | TemplateVars | TemplateVars[];
export type TemplateVars = { [key: string]: TemplateValue };

type Node =
  | { kind: 'text'; text: string }
  | { kind: 'var'; name: string }
  | { kind: 'section'; name: string; inverted: boolean; children: Node[] };

const TAG = /\{\{\s*([#^/]?)\s*([A-Za-z_]\w*)\s*\}\}/g;
// Private-use characters mark where tags were while the Markdown is converted.
const MARK = '';
const MARK_RE = new RegExp(`${MARK}(\\d+)${MARK}`, 'g');

type Tag = { op: '' | '#' | '^' | '/'; name: string };

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ESCAPE: Record<Format, (s: string) => string> = {
  text: (s) => s,
  markdown: (s) => s.replace(/([\\*_~`|])/g, '\\$1'),
  telegram: escapeHtml,
  slack: (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  html: (s) => escapeHtml(s).replace(/\n/g, '<br>\n'),
  json: (s) => JSON.stringify(s).slice(1, -1),
};

const BOLD = /\*\*([^*\n]+?)\*\*/g;
const ITALIC = /(^|[^\w\\])_([^_\n]+?)_(?![\w])/gm;
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Turns the template's own Markdown into the target format; tags are already replaced by markers. */
function convertMarkup(s: string, format: Format): string {
  switch (format) {
    case 'markdown':
    case 'json':
      return s;
    case 'text':
      return s.replace(LINK, '$1 ($2)').replace(BOLD, '$1').replace(ITALIC, '$1$2');
    case 'slack':
      return ESCAPE.slack(s).replace(LINK, '<$2|$1>').replace(BOLD, '*$1*');
    case 'telegram':
    case 'html': {
      const out = escapeHtml(s).replace(LINK, '<a href="$2">$1</a>').replace(BOLD, '<b>$1</b>').replace(ITALIC, '$1<i>$2</i>');
      return format === 'html' ? out.replace(/\n/g, '<br>\n') : out;
    }
  }
}

function parse(source: string, format: Format): Node[] {
  const tags: Tag[] = [];
  const marked = source.replace(TAG, (_m, op: Tag['op'], name: string) => `${MARK}${tags.push({ op, name }) - 1}${MARK}`);
  const converted = convertMarkup(marked, format);

  const root: Node[] = [];
  const stack: { name: string; children: Node[] }[] = [{ name: '', children: root }];
  let last = 0;
  const pushText = (text: string) => text && stack[stack.length - 1]!.children.push({ kind: 'text', text });
  for (const m of converted.matchAll(MARK_RE)) {
    pushText(converted.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = tags[Number(m[1])]!;
    const top = stack[stack.length - 1]!;
    if (tag.op === '') top.children.push({ kind: 'var', name: tag.name });
    else if (tag.op === '/') {
      if (stack.length === 1 || top.name !== tag.name) throw new TemplateError(`mismatch:${tag.name}`);
      stack.pop();
    } else {
      const section: Node = { kind: 'section', name: tag.name, inverted: tag.op === '^', children: [] };
      top.children.push(section);
      stack.push({ name: tag.name, children: section.children });
    }
  }
  pushText(converted.slice(last));
  if (stack.length > 1) throw new TemplateError(`unclosed:${stack[stack.length - 1]!.name}`);
  return root;
}

class TemplateError extends Error {}

function lookup(scopes: TemplateVars[], name: string): TemplateValue {
  for (let i = scopes.length - 1; i >= 0; i--) if (Object.hasOwn(scopes[i]!, name)) return scopes[i]![name];
  return undefined;
}

const isObject = (v: unknown): v is TemplateVars => typeof v === 'object' && v !== null && !Array.isArray(v);

function renderNodes(nodes: Node[], scopes: TemplateVars[], escape: (s: string) => string): string {
  let out = '';
  for (const node of nodes) {
    if (node.kind === 'text') out += node.text;
    else if (node.kind === 'var') {
      const v = lookup(scopes, node.name);
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out += escape(String(v));
    } else {
      const v = lookup(scopes, node.name);
      const truthy = Array.isArray(v) ? v.length > 0 : Boolean(v);
      if (node.inverted) {
        if (!truthy) out += renderNodes(node.children, scopes, escape);
      } else if (Array.isArray(v)) {
        for (const item of v) out += renderNodes(node.children, isObject(item) ? [...scopes, item] : scopes, escape);
      } else if (truthy) {
        out += renderNodes(node.children, isObject(v) ? [...scopes, v] : scopes, escape);
      }
    }
  }
  return out;
}

/** Renders a template for one output format. Throws on a malformed template (see `templateError`). */
export function renderTemplate(source: string, vars: TemplateVars, format: Format): string {
  return renderNodes(parse(source, format), [vars], ESCAPE[format]);
}

/** Null when the template is well formed, otherwise a short code such as `unclosed:items`. */
export function templateError(source: string): string | null {
  try {
    parse(source, 'text');
    return null;
  } catch (err) {
    if (err instanceof TemplateError) return err.message;
    throw err;
  }
}

/** Variable and section names used, in order of first use. */
export function usedVariables(source: string): string[] {
  return [...new Set([...source.matchAll(TAG)].map((m) => m[2]!))];
}
