// Проверка записанной сказки без сети: чужие сервисы подменены.
// Запуск: node scripts/record-test.mjs
import assert from 'node:assert/strict';
const R = await import('../lib/record.js');
const voice = (await import('../api/voice.js')).default;

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + ' -> ' + (e.message || e).split('\n')[0]); }
}
const mkRes = () => { const r = { code: 200, body: null, headers: {},
  setHeader() {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, end() { return r; } }; return r; };
const call = async (route, body, method = 'POST') => {
  const res = mkRes();
  await voice({ method, body, query: { __r: route }, url: '/api/' + route }, res);
  return res;
};
const w = (t, s, e) => ({ t, s, e });

process.env.ELEVENLABS_API_KEY = 'test-key';
process.env.ANTHROPIC_API_KEY = 'test-key';
delete process.env.BLOB_READ_WRITE_TOKEN; delete process.env.BLOB_STORE_ID;

console.log('помощники');
await t('parseDataUrl понимает codecs в типе', () => {
  const p = R.parseDataUrl('data:audio/webm;codecs=opus;base64,' + Buffer.from('hello').toString('base64'));
  assert.equal(p.mime, 'audio/webm'); assert.equal(p.buffer.toString(), 'hello');
});
await t('parseDataUrl отвергает мусор', () => assert.throws(() => R.parseDataUrl('привет')));
await t('isBlobUrl: только наше хранилище', () => {
  assert.equal(R.isBlobUrl('https://abc123.public.blob.vercel-storage.com/records/x.mp3'), true);
  assert.equal(R.isBlobUrl('https://evil.example.com/x.mp3'), false);
  assert.equal(R.isBlobUrl('http://abc.public.blob.vercel-storage.com/x.mp3'), false);
  assert.equal(R.isBlobUrl('https://blob.vercel-storage.com.evil.com/x'), false);
  assert.equal(R.isBlobUrl('file:///etc/passwd'), false);
});
await t('splitSentences режет по точке, паузе и длине', () => {
  const ws = [w('Жил', 0, .3), w('дед.', .3, .7), w('Он', .8, 1), w('любил', 1, 1.3), w('голубей', 3.0, 3.5), w('очень', 3.5, 3.9)];
  const s = R.splitSentences(ws);
  assert.deepEqual(s.map(x => x.text), ['Жил дед.', 'Он любил', 'голубей очень']);
  assert.equal(s[0].start, 0); assert.equal(s[2].end, 3.9);
  const long = Array.from({ length: 95 }, (_, k) => w('с' + k, k * .3, k * .3 + .2));
  assert.deepEqual(R.splitSentences(long).map(x => x.text.split(' ').length), [40, 40, 15]);
});
await t('sceneCountFor держит от трёх до шести', () => {
  assert.equal(R.sceneCountFor(20, 10), 3); assert.equal(R.sceneCountFor(300, 50), 6);
  assert.equal(R.sceneCountFor(120, 10), 3); assert.equal(R.sceneCountFor(200, 2), 2); assert.equal(R.sceneCountFor(50, 1), 1);
});
const S = n => Array.from({ length: n }, (_, i) => ({ i, text: 'Предложение ' + i + '.', start: i * 4, end: i * 4 + 3 }));
await t('normalizePlan принимает ровный план', () => {
  const p = R.normalizePlan({ scenes: [{ from: 0, to: 1, brief: 'A boy at the fence' }, { from: 2, to: 4, brief: 'Pigeons rising up' }, { from: 5, to: 5, brief: 'Old man smiling' }] }, 6, 3);
  assert.equal(p.length, 3);
});
for (const [name, plan] of [
  ['дыра между сценами', [{ from: 0, to: 1, brief: 'aaaaaaaaaaaaaa' }, { from: 3, to: 5, brief: 'bbbbbbbbbbbbbb' }]],
  ['наложение', [{ from: 0, to: 3, brief: 'aaaaaaaaaaaaaa' }, { from: 3, to: 5, brief: 'bbbbbbbbbbbbbb' }]],
  ['не дошли до конца', [{ from: 0, to: 2, brief: 'aaaaaaaaaaaaaa' }, { from: 3, to: 4, brief: 'bbbbbbbbbbbbbb' }]],
  ['пустая подпись', [{ from: 0, to: 2, brief: '' }, { from: 3, to: 5, brief: 'bbbbbbbbbbbbbb' }]],
  ['дробные номера', [{ from: 0, to: 2.5, brief: 'aaaaaaaaaaaaaa' }, { from: 3, to: 5, brief: 'bbbbbbbbbbbbbb' }]],
]) await t('normalizePlan отвергает: ' + name, () => assert.equal(R.normalizePlan({ scenes: plan }, 6, 3), null));
await t('normalizePlan отвергает больше шести сцен', () =>
  assert.equal(R.normalizePlan({ scenes: Array.from({ length: 7 }, (_, i) => ({ from: i, to: i, brief: 'aaaaaaaaaaaaaa' })) }, 7, 6), null));
await t('evenPlan покрывает всё без дыр для любой длины', () => {
  for (const n of [1, 2, 3, 5, 9, 40]) for (const want of [1, 3, 6]) {
    const p = R.evenPlan(S(n), want); let next = 0;
    for (const sc of p) { assert.equal(sc.from, next); assert.ok(sc.to >= sc.from); next = sc.to + 1; }
    assert.equal(next, n); assert.ok(p.length <= Math.max(1, Math.min(want, n)));
  }
});
await t('timeline смыкает куски звука без потерь', () => {
  const ss = S(6), p = R.evenPlan(ss, 3), tl = R.timeline(p, ss);
  for (let k = 1; k < tl.length; k++) assert.equal(tl[k].start, tl[k - 1].end);
  assert.ok(tl[0].start >= 0 && tl[0].start <= ss[0].start); assert.ok(tl.at(-1).end > ss.at(-1).end);
});

console.log('сцены');
const realFetch = globalThis.fetch;
const claude = text => async (url) => {
  assert.ok(String(url).includes('anthropic.com'));
  return { ok: true, json: async () => ({ content: [{ text }], stop_reason: 'end_turn' }), text: async () => text };
};
const sents = S(9);
await t('scenes: хороший ответ модели', async () => {
  globalThis.fetch = claude(JSON.stringify({ title: 'Голубятня', cast: [{ name: 'Old Matvey', look: 'old man, grey moustache, brown cap' }],
    scenes: [{ from: 0, to: 2, brief: 'A courtyard with a pigeon loft by the fence' }, { from: 3, to: 5, brief: 'Old Matvey hands a key to a small boy' }, { from: 6, to: 8, brief: 'Pigeons rise from the open loft' }],
    questions: ['Что ты почувствовал?', 'Кто был рядом?', 'Что было потом?'] }));
  const r = await call('scenes', { sentences: sents, lang: 'ru' });
  assert.equal(r.code, 200); assert.equal(r.body.source, 'llm'); assert.equal(r.body.title, 'Голубятня');
  assert.equal(r.body.scenes.length, 3); assert.equal(r.body.questions.length, 3);
  assert.match(r.body.castText, /Old Matvey: old man/);
  assert.equal(r.body.scenes[0].text, sents.slice(0, 3).map(s => s.text).join(' '));
});
await t('scenes: ответ в обёртке ```json с пояснением читается', async () => {
  globalThis.fetch = claude('Вот план:\n```json\n' + JSON.stringify({ title: 'X', cast: [], scenes: [
    { from: 0, to: 2, brief: 'A quiet yard at dawn' }, { from: 3, to: 5, brief: 'A boy by the fence' }, { from: 6, to: 8, brief: 'Doves in the sky' }], questions: [] }) + '\n```');
  const r = await call('scenes', { sentences: sents, lang: 'ru' });
  assert.equal(r.body.source, 'llm'); assert.equal(r.body.scenes.length, 3); assert.deepEqual(r.body.questions, []);
});
await t('scenes: одна сцена на весь рассказ меньше минимума, берём запасной разбор', async () => {
  globalThis.fetch = claude(JSON.stringify({ title: 'X', cast: [], scenes: [{ from: 0, to: 8, brief: 'A long walk home at dusk' }], questions: [] }));
  const r = await call('scenes', { sentences: sents, lang: 'ru' });
  assert.equal(r.body.source, 'fallback');
});
await t('scenes: сломанный план -> запасной разбор, но кадры про текст', async () => {
  globalThis.fetch = claude(JSON.stringify({ title: 'X', cast: [], scenes: [{ from: 0, to: 2, brief: 'aaaaaaaaaaaaaaaa' }] }));
  const r = await call('scenes', { sentences: sents, lang: 'ru' });
  assert.equal(r.code, 200); assert.equal(r.body.source, 'fallback'); assert.ok(r.body.scenes.length >= 3);
  assert.ok(r.body.scenes.every(s => s.brief.includes(s.text.slice(0, 20))), 'подпись кадра содержит текст сцены');
  assert.ok(r.body.why.length > 0); assert.equal(r.body.title, 'Предложение 0');
});
await t('scenes: модель недоступна -> всё равно собирается', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 529, text: async () => 'overloaded' });
  const r = await call('scenes', { sentences: sents, lang: 'en' });
  assert.equal(r.code, 200); assert.equal(r.body.source, 'fallback'); assert.match(r.body.why, /529/);
});
await t('scenes: пусто и слишком много', async () => {
  assert.equal((await call('scenes', { sentences: [] })).code, 400);
  assert.equal((await call('scenes', { sentences: S(401) })).code, 400);
});
await t('scenes: короткий рассказ из двух предложений', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'x' });
  const r = await call('scenes', { sentences: S(2), lang: 'ru' });
  assert.equal(r.body.scenes.length, 2); assert.equal(r.body.scenes[1].to, 1);
});

console.log('очистка звука');
const mp3 = Buffer.alloc(5000, 7);
const eleven = (over = {}) => async (url, init) => {
  assert.ok(String(url).includes('audio-isolation'));
  assert.equal(init.headers['xi-api-key'], 'test-key');
  assert.ok(init.body instanceof FormData && init.body.get('audio'), 'звук приложен полем audio');
  return { ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.length), text: async () => '', ...over };
};
const rec = 'data:audio/webm;codecs=opus;base64,' + Buffer.alloc(3000, 1).toString('base64');
await t('clean: вернул очищенный звук прямо в ответе (хранилища нет)', async () => {
  globalThis.fetch = eleven();
  const r = await call('clean', { audio: rec });
  assert.equal(r.code, 200); assert.ok(r.body.audio.startsWith('data:audio/mpeg;base64,')); assert.equal(r.body.bytes, 5000);
});
await t('clean: ответ-JSON вместо звука считается ошибкой', async () => {
  globalThis.fetch = eleven({ headers: { get: () => 'application/json' }, text: async () => '{}' });
  const r = await call('clean', { audio: rec }); assert.equal(r.code, 500); assert.match(r.body.error, /не звук/);
});
await t('clean: отказ сервиса виден целиком', async () => {
  globalThis.fetch = eleven({ ok: false, status: 402, text: async () => 'quota exceeded' });
  const r = await call('clean', { audio: rec }); assert.equal(r.code, 500); assert.match(r.body.error, /402.*quota/);
});
await t('clean: слишком большая запись и пустая', async () => {
  globalThis.fetch = eleven();
  const big = 'data:audio/webm;base64,' + Buffer.alloc(4_100_000, 1).toString('base64');
  assert.equal((await call('clean', { audio: big })).code, 413);
  assert.equal((await call('clean', {})).code, 400);
});
await t('clean: без ключа понятная ошибка', async () => {
  const k = process.env.ELEVENLABS_API_KEY; delete process.env.ELEVENLABS_API_KEY;
  const r = await call('clean', { audio: rec }); process.env.ELEVENLABS_API_KEY = k;
  assert.equal(r.code, 500); assert.match(r.body.error, /ELEVENLABS_API_KEY/);
});
await t('clean: большой результат без хранилища не отдаётся молча', async () => {
  const bigOut = Buffer.alloc(3_500_000, 7);
  globalThis.fetch = eleven({ arrayBuffer: async () => bigOut.buffer.slice(0, bigOut.length) });
  const r = await call('clean', { audio: rec }); assert.equal(r.code, 500); assert.match(r.body.error, /хранилище/);
});

console.log('расшифровка');
const scribeBody = { language_code: 'ru', text: 'Жил дед. Он любил голубей.', words: [
  { text: 'Жил', start: 0, end: .3, type: 'word' }, { text: ' ', start: .3, end: .3, type: 'spacing' },
  { text: 'дед.', start: .3, end: .7, type: 'word' }, { text: 'Он', start: 1, end: 1.2, type: 'word' },
  { text: 'любил', start: 1.2, end: 1.6, type: 'word' }, { text: 'голубей.', start: 1.6, end: 2.2, type: 'word' }] };
await t('transcribe: v2 отказал по модели -> v1 сработал, предложения с временем', async () => {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).includes('speech-to-text')); const m = init.body.get('model_id'); seen.push(m);
    assert.equal(init.body.get('timestamps_granularity'), 'word'); assert.equal(init.body.get('language_code'), null);
    return m === 'scribe_v2' ? { ok: false, status: 422, text: async () => 'bad model' } : { ok: true, json: async () => scribeBody };
  };
  const r = await call('transcribe', { audio: rec });
  assert.deepEqual(seen, ['scribe_v2', 'scribe_v1']);
  assert.equal(r.code, 200); assert.equal(r.body.language, 'ru'); assert.equal(r.body.duration, 2.2);
  assert.deepEqual(r.body.sentences.map(s => s.text), ['Жил дед.', 'Он любил голубей.']);
});
await t('transcribe: ключ или лимит (401) не перебирает модели', async () => {
  let n = 0; globalThis.fetch = async () => (n++, { ok: false, status: 401, text: async () => 'bad key' });
  const r = await call('transcribe', { audio: rec }); assert.equal(n, 1); assert.equal(r.code, 500); assert.match(r.body.error, /401/);
});
await t('transcribe: чужая ссылка запрещена, ссылка хранилища скачивается', async () => {
  globalThis.fetch = async () => { throw new Error('не должен ходить'); };
  assert.equal((await call('transcribe', { url: 'https://evil.example.com/a.mp3' })).code, 400);
  const urls = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    if (String(url).includes('blob.vercel-storage.com')) return { ok: true, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.length) };
    return { ok: true, json: async () => scribeBody };
  };
  const r = await call('transcribe', { url: 'https://x1.public.blob.vercel-storage.com/records/clean-abc.mp3' });
  assert.equal(r.code, 200); assert.equal(urls.length, 2);
});
await t('transcribe: тишина даёт пустой список, а не падение', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ language_code: 'ru', text: '', words: [] }) });
  const r = await call('transcribe', { audio: rec }); assert.equal(r.code, 200); assert.deepEqual(r.body.sentences, []); assert.equal(r.body.duration, 0);
});

console.log('маршруты');
await t('обычный /api/voice не задет: без text отвечает 400', async () => {
  const res = mkRes(); await voice({ method: 'POST', body: {}, query: {}, url: '/api/voice' }, res); assert.equal(res.code, 400);
});
await t('GET на адрес записи отвергается', async () => assert.equal((await call('clean', {}, 'GET')).code, 405));

globalThis.fetch = realFetch;
console.log(`\nпройдено ${pass}, провалено ${fail}`);
process.exit(fail ? 1 : 0);
