#!/usr/bin/env node
/*
 * Builds index.html from _src/template.html and _content/en.json.
 * No dependencies; run with:  node _tools/build.mjs [lang]
 *
 * The output is committed, because GitHub Pages serves the files as they are.
 * Folders that start with an underscore (_src, _content, _tools) are not published by Jekyll.
 *
 * Template syntax (a tiny Handlebars subset):
 *   {{path.to.value}}     HTML-escaped value
 *   {{{path.to.value}}}   raw value (only for text this script made itself)
 *   {{#each list}} ... {{/each}}     inside: {{this}}, {{@index}}, {{@n}} (1-based), {{@first}}, {{@last}}
 *   {{#if path}} ... {{else}} ... {{/if}}
 * Names are looked up in the current item first, then in the outer scopes up to the root.
 * An unknown name stops the build, so that a typo never ends up on the page.
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const lang = process.argv[2] || 'en';

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ---------- tiny template engine ---------- */

function parse(tpl) {
  const re = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*([^}]+?)\s*\}\}/g;
  const root = {type: 'root', children: []};
  const stack = [root];
  let pos = 0;
  let m;
  const top = () => stack[stack.length - 1];
  const add = (n) => { const t = top(); (t.inElse ? t.elseChildren : t.children).push(n); };
  while ((m = re.exec(tpl))) {
    if (m.index > pos) add({type: 'text', text: tpl.slice(pos, m.index)});
    pos = re.lastIndex;
    if (m[1] !== undefined) {
      add({type: 'var', path: m[1], raw: true});
      continue;
    }
    const tag = m[2];
    if (tag.startsWith('#each ') || tag.startsWith('#if ')) {
      const node = {type: tag.startsWith('#each ') ? 'each' : 'if', path: tag.split(/\s+/)[1], children: [], elseChildren: null};
      add(node);
      stack.push(node);
    } else if (tag === 'else') {
      const node = top();
      if (node.type !== 'if') throw new Error('{{else}} outside {{#if}}');
      node.elseChildren = [];
      node.inElse = true;
    } else if (tag === '/each' || tag === '/if') {
      const node = stack.pop();
      if (!node || node.type !== tag.slice(1)) throw new Error('Unbalanced ' + tag);
    } else {
      add({type: 'var', path: tag, raw: false});
    }
  }
  if (pos < tpl.length) add({type: 'text', text: tpl.slice(pos)});
  if (stack.length !== 1) throw new Error('Unclosed block ' + stack[stack.length - 1].type + ' ' + stack[stack.length - 1].path);
  return root;
}

function lookup(path, scopes) {
  if (path === 'this') return scopes[scopes.length - 1].value;
  if (path.startsWith('@')) {
    const meta = scopes[scopes.length - 1].meta || {};
    if (!(path.slice(1) in meta)) throw new Error('Unknown ' + path);
    return meta[path.slice(1)];
  }
  const parts = path.split('.');
  for (let i = scopes.length - 1; i >= 0; i--) {
    const v = scopes[i].value;
    if (v !== null && typeof v === 'object' && parts[0] in v) {
      let cur = v;
      for (const p of parts) {
        if (cur === null || typeof cur !== 'object' || !(p in cur)) throw new Error('Unknown name: ' + path);
        cur = cur[p];
      }
      return cur;
    }
  }
  throw new Error('Unknown name: ' + path);
}

function lookupLoose(path, scopes) {
  // for {{#if}}: a missing name counts as false
  try {
    return lookup(path, scopes);
  } catch {
    return undefined;
  }
}

function renderNodes(nodes, scopes) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.text;
    else if (n.type === 'var') {
      const v = lookup(n.path, scopes);
      if (v !== null && typeof v === 'object') throw new Error('Not a text value: ' + n.path);
      out += n.raw ? String(v) : escapeHtml(v);
    } else if (n.type === 'if') {
      const v = lookupLoose(n.path, scopes);
      const truthy = Array.isArray(v) ? v.length > 0 : !!v;
      out += truthy ? renderNodes(n.children, scopes) : n.elseChildren ? renderNodes(n.elseChildren, scopes) : '';
    } else if (n.type === 'each') {
      const list = lookup(n.path, scopes);
      if (!Array.isArray(list)) throw new Error('Not a list: ' + n.path);
      list.forEach((item, i) => {
        const meta = {index: i, n: i + 1, first: i === 0, last: i === list.length - 1};
        out += renderNodes(n.children, scopes.concat([{value: item, meta}]));
      });
    }
  }
  return out;
}

/* ---------- content preparation ---------- */

function prepare(content) {
  const c = JSON.parse(JSON.stringify(content));
  c.features.items.forEach((f) => {
    f.isAdv = f.adv === true;
    f.isAdvPart = f.adv === 'part';
    if (!f.image) f.image = '';
    if (!f.image2) f.image2 = '';
  });
  c.features.more.forEach((m) => { m.isAdv = !!m.adv; });
  c.faq.items.forEach((q) => {
    q.isOl = q.style === 'ol';
    q.isUl = q.style === 'ul';
    q.isP = q.style === 'p';
  });
  c.filmSceneCount = c.film.scenes.length;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: c.site.name,
    description: c.site.description,
    url: c.site.url,
    image: c.site.ogImage,
    applicationCategory: c.jsonld.applicationCategory,
    operatingSystem: c.jsonld.operatingSystem,
    downloadUrl: c.site.playUrl,
    inLanguage: c.lang,
    offers: {'@type': 'Offer', price: '0', priceCurrency: 'EUR', description: c.jsonld.offerDescription}
  };
  // keep the JSON safe inside a <script> element
  c.jsonldString = JSON.stringify(ld, null, 2).replace(/</g, '\\u003c');
  return c;
}

/* ---------- main ---------- */

const content = prepare(JSON.parse(readFileSync(join(root, '_content', lang + '.json'), 'utf8')));
const tpl = readFileSync(join(root, '_src', 'template.html'), 'utf8');
const ast = parse(tpl);

const html = renderNodes(ast.children, [{value: content}]);
const outDir = lang === 'en' ? root : join(root, lang);
mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'index.html'), html);
console.log('Wrote ' + join(outDir, 'index.html') + ' (' + html.length + ' bytes)');
