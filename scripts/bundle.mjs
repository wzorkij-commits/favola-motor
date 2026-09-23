// Собирает весь пайплайн в один файл api/favola.js.
// Нужно ровно для одного: чтобы человек без опыта заливал два файла, а не двадцать.
// Источник правды остаётся в lib/ и api/ — этот файл всегда генерируется, не правится руками.

import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// вырезаем import/export — всё склеивается в одну область видимости
const strip = (src) => src
  .replace(/^\s*import[^;]*;\s*$/gm, '')
  .replace(/^export\s+(async\s+)?function/gm, '$1function')
  .replace(/^export\s+(const|let|default)/gm, '$1')
  .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');

const dataMod = (name, varName) => {
  const src = read(`data/${name}.js`);
  return src.replace(/^\/\/.*$/m, '').replace(/^export default/m, `const ${varName} =`);
};

const handlers = ['triage', 'story', 'image', 'voice', 'hero', 'ping'].map(name => {
  const src = strip(read(`api/${name}.js`))
    .replace(/^(async\s+)?function handler/m, `$1function handle_${name}`)
    .replace(/^default\s+(async\s+)?function handler/m, `$1function handle_${name}`);
  return `// ─────────── /api/${name} ───────────\n${src.trim()}\n`;
}).join('\n');

const out = `/* Favola · весь пайплайн одним файлом.
 *
 * СГЕНЕРИРОВАНО — не правь здесь. Правь в lib/ и api/, потом: npm run bundle
 *
 * Один файл отвечает на все адреса: /api/ping, /api/triage, /api/story,
 * /api/image, /api/voice, /api/hero. Разводит их rewrite из vercel.json.
 */

${dataMod('constructs', 'CONSTRUCTS')}
${dataMod('panel6', 'PANEL6')}
${dataMod('heroes', 'HEROES')}

${strip(read('lib/data.js')).trim()}

${strip(read('lib/guardrails.js')).trim()}

${strip(read('lib/prompts.js')).trim()}

${strip(read('lib/providers.js')).trim()}

${handlers}

// ─────────── разводка ───────────
const ROUTES = {
  ping: handle_ping, triage: handle_triage, story: handle_story,
  image: handle_image, voice: handle_voice, hero: handle_hero
};

export default async function handler(req, res) {
  const step = (req.query && req.query.step) ||
    (req.url || '').split('?')[0].split('/').filter(Boolean).pop();
  const fn = ROUTES[step];
  if (!fn) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(404).json({
      error: 'неизвестный шаг: ' + step,
      known: Object.keys(ROUTES),
      hint: 'Проверить живость: добавь /api/ping к адресу.'
    });
  }
  return fn(req, res);
}
`;

writeFileSync(new URL('../api/favola.js', import.meta.url), out);
console.log('api/favola.js собран, ' + Math.round(out.length / 1024) + ' КБ');
