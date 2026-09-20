// Сказка, записанная голосом: очистка звука, расшифровка, разбор на сцены.
//
// Три адреса живут внутри api/voice.js, чтобы не занимать двенадцатый слот
// функций (метка __r, см. lib/route.js):
//
//   POST /api/clean       {audio}            -> {url | audio, mime, bytes}
//   POST /api/transcribe  {url | audio}      -> {language, text, sentences, duration}
//   POST /api/scenes      {sentences, ...}   -> {title, cast, scenes, questions, source}
//
// Принцип: слова рассказчика не переписываются. Звук остаётся его, текст на
// экране это то, что он сказал (с точностью до распознавания), а сцены и
// картинки строятся по временным меткам слов. Поэтому картинка меняется
// ровно в тот момент, когда в записи начинается следующий кусок рассказа.

import { generateText, jsonFrom, cors } from './providers.js';
import { BLOB_READY, putFile } from './blob.js';
import { SCENES_SYSTEM } from './prompts.js';

const MAX_AUDIO_BYTES = 4_000_000;      // потолок тела запроса на Vercel 4,5 МБ, с запасом на base64
const INLINE_BACK_BYTES = 3_000_000;    // столько можно вернуть прямо в ответе
const MAX_SCENES = 6;                   // столько кадров умеет листать приложение
const MIN_SCENES = 3;

/* ── мелкие помощники (их проверяют тесты) ────────────────────────────── */

/** data:audio/webm;codecs=opus;base64,.... -> { buffer, mime } */
export function parseDataUrl(s) {
  const m = /^data:([^,;]*)((?:;[^,;=]+=[^,;]*)*);base64,([\s\S]*)$/.exec(String(s || ''));
  if (!m) throw new Error('это не запись в виде строки');
  return { mime: m[1] || 'application/octet-stream', buffer: Buffer.from(m[3], 'base64') };
}

export function extFor(mime) {
  const t = String(mime || '').toLowerCase();
  if (t.includes('webm')) return 'webm';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('wav')) return 'wav';
  return 'bin';
}

/** Забирать по ссылке разрешено только из нашего файлового хранилища. */
export function isBlobUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && /(^|\.)blob\.vercel-storage\.com$/.test(x.hostname);
  } catch (e) { return false; }
}

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Слова с временем -> предложения с временем.
 * Режем по знаку конца, по паузе больше секунды и по длине. Без длины
 * рассказ без единой точки стал бы одним предложением на весь час.
 */
export function splitSentences(words) {
  const out = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const text = clip(cur.map(w => w.t).join(' '), 600);
    if (text) out.push({ i: out.length, text, start: cur[0].s, end: cur[cur.length - 1].e });
    cur = [];
  };
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    cur.push(w);
    const next = words[k + 1];
    const ends = /[.!?…]["»”')\]]*$/.test(w.t);
    const pause = next && next.s - w.e > 1.1;
    if (ends || pause || cur.length >= 40) flush();
  }
  flush();
  return out;
}

/** Сколько сцен нужно для такой длины: примерно одна на 35 секунд, от трёх до шести. */
export function sceneCountFor(durationSec, sentenceCount) {
  const n = Math.max(MIN_SCENES, Math.min(MAX_SCENES, Math.round((durationSec || 0) / 35)));
  return Math.max(1, Math.min(n, sentenceCount));
}

/** Проверка плана сцен от модели. Возвращает чистый план или null. */
export function normalizePlan(plan, sentenceCount, wanted) {
  if (!plan || !Array.isArray(plan.scenes) || !plan.scenes.length) return null;
  if (plan.scenes.length > MAX_SCENES) return null;
  let next = 0;
  const scenes = [];
  for (const sc of plan.scenes) {
    const from = Number(sc && sc.from), to = Number(sc && sc.to);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
    if (from !== next || to < from || to >= sentenceCount) return null;
    const brief = clip(sc.brief, 700);
    if (brief.length < 12) return null;
    scenes.push({ from, to, brief });
    next = to + 1;
  }
  if (next !== sentenceCount) return null;
  if (scenes.length < Math.min(wanted, MIN_SCENES) && sentenceCount >= MIN_SCENES) return null;
  return scenes;
}

/** Запасной разбор без модели: поровну по времени. Кадры всё равно про этот текст. */
export function evenPlan(sentences, wanted) {
  const n = Math.max(1, Math.min(wanted, sentences.length));
  const total = sentences[sentences.length - 1].end - sentences[0].start || sentences.length;
  const scenes = [];
  let from = 0;
  for (let k = 0; k < n; k++) {
    let to;
    if (k === n - 1) to = sentences.length - 1;
    else {
      const stopAt = sentences[0].start + total * (k + 1) / n;
      to = from;
      const mustLeave = n - k - 1;                     // хотя бы по предложению остальным
      while (to < sentences.length - 1 - mustLeave && sentences[to].end < stopAt) to++;
    }
    scenes.push({ from, to, brief: '' });
    from = to + 1;
  }
  return scenes;
}

/** Границы кусков звука: смыкаются посередине паузы, ни секунды не теряется и не повторяется. */
export function timeline(scenes, sentences) {
  return scenes.map((sc, k) => {
    const first = sentences[sc.from], last = sentences[sc.to];
    const prev = k > 0 ? sentences[scenes[k - 1].to] : null;
    const nxt = k < scenes.length - 1 ? sentences[scenes[k + 1].from] : null;
    const start = prev ? (prev.end + first.start) / 2 : Math.max(0, first.start - 0.3);
    const end = nxt ? (last.end + nxt.start) / 2 : last.end + 0.6;
    return { start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 };
  });
}

const firstWords = (text, n) =>
  clip(text, 200).replace(/[.,!?…:;"«»()]/g, '').split(' ').filter(Boolean).slice(0, n).join(' ');

/* ── 1. очистка звука ─────────────────────────────────────────────────── */

async function cleanAudio(req, res) {
  const { audio } = req.body || {};
  if (!audio) return res.status(400).json({ error: 'нет записи' });
  if (!process.env.ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ELEVENLABS_API_KEY не задан' });

  const { buffer, mime } = parseDataUrl(audio);
  if (!buffer.length) return res.status(400).json({ error: 'запись пустая' });
  if (buffer.length > MAX_AUDIO_BYTES) {
    return res.status(413).json({ error: 'запись слишком большая: ' + Math.round(buffer.length / 1e5) / 10 + ' МБ' });
  }

  const form = new FormData();
  form.append('audio', new Blob([buffer], { type: mime }), 'record.' + extFor(mime));
  const r = await fetch('https://api.elevenlabs.io/v1/audio-isolation', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    body: form
  });
  const type = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!r.ok) throw new Error(`очистка ${r.status}: ${(await r.text()).slice(0, 300)}`);
  if (type.includes('json')) throw new Error('очистка вернула не звук: ' + (await r.text()).slice(0, 200));
  const out = Buffer.from(await r.arrayBuffer());
  if (out.length < 1000) throw new Error('очистка вернула пустой файл');
  const outMime = type || 'audio/mpeg';

  // Очищенная запись остаётся навсегда: она и есть голос книги.
  if (BLOB_READY()) {
    try {
      const url = await putFile('records/clean.' + extFor(outMime), out, outMime);
      return res.status(200).json({ url, mime: outMime, bytes: out.length });
    } catch (e) { /* хранилище не приняло, пробуем вернуть прямо в ответе */ }
  }
  if (out.length <= INLINE_BACK_BYTES) {
    return res.status(200).json({
      audio: `data:${outMime};base64,${out.toString('base64')}`, mime: outMime, bytes: out.length });
  }
  throw new Error('очищенная запись не помещается в ответ, а файловое хранилище не приняло её');
}

/* ── 2. расшифровка ───────────────────────────────────────────────────── */

async function transcribe(req, res) {
  const { url, audio } = req.body || {};
  if (!url && !audio) return res.status(400).json({ error: 'нет записи' });
  if (!process.env.ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ELEVENLABS_API_KEY не задан' });

  let buffer, mime;
  if (url) {
    if (!isBlobUrl(url)) return res.status(400).json({ error: 'ссылка не из нашего хранилища' });
    const f = await fetch(url);
    if (!f.ok) throw new Error('запись не скачалась из хранилища: ' + f.status);
    buffer = Buffer.from(await f.arrayBuffer());
    mime = (f.headers.get('content-type') || 'audio/mpeg').split(';')[0];
  } else {
    ({ buffer, mime } = parseDataUrl(audio));
  }
  if (!buffer.length) return res.status(400).json({ error: 'запись пустая' });

  // Язык не задаём: Scribe узнаёт его сам, и рассказ по-английски в русском
  // приложении не превращается в кашу.
  const models = process.env.FAVOLA_STT_MODEL ? [process.env.FAVOLA_STT_MODEL] : ['scribe_v2', 'scribe_v1'];
  let j = null, lastErr = '';
  for (const model of models) {
    const form = new FormData();
    form.append('model_id', model);
    form.append('file', new Blob([buffer], { type: mime }), 'record.' + extFor(mime));
    form.append('timestamps_granularity', 'word');
    form.append('tag_audio_events', 'false');
    form.append('diarize', 'false');
    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: form });
    if (r.ok) { j = await r.json(); break; }
    lastErr = `расшифровка ${r.status} (${model}): ${(await r.text()).slice(0, 300)}`;
    if (r.status !== 400 && r.status !== 422) break;    // другая модель поможет только при отказе по модели
  }
  if (!j) throw new Error(lastErr || 'расшифровка не ответила');

  const words = (j.words || [])
    .filter(w => (w.type || 'word') === 'word' && String(w.text || '').trim())
    .map(w => ({ t: String(w.text).trim(), s: Number(w.start) || 0, e: Number(w.end) || 0 }));
  const sentences = splitSentences(words);
  return res.status(200).json({
    language: j.language_code || null,
    text: clip(j.text, 20000),
    sentences,
    duration: words.length ? words[words.length - 1].e : 0
  });
}

/* ── 3. сцены ─────────────────────────────────────────────────────────── */

async function scenes(req, res) {
  const { sentences, lang } = req.body || {};
  if (!Array.isArray(sentences) || !sentences.length) return res.status(400).json({ error: 'нет предложений' });
  if (sentences.length > 400) return res.status(400).json({ error: 'слишком длинная запись' });

  const list = sentences.map((s, i) => ({
    i, text: clip(s.text, 500), start: Number(s.start) || 0, end: Number(s.end) || 0 }));
  const duration = list[list.length - 1].end - list[0].start;
  const wanted = sceneCountFor(duration, list.length);
  const storyLang = lang === 'en' ? 'English' : 'Russian';

  let plan = null, title = '', cast = [], questions = [], source = 'fallback', why = '';
  try {
    const prompt = `Language of the story: ${storyLang}\nNumber of scenes: ${wanted}\n\nSentences:\n` +
      list.map(s => `${s.i}: ${s.text}`).join('\n');
    const raw = await generateText({ system: SCENES_SYSTEM, prompt, maxTokens: 2200, temperature: 0.4 });
    const j = jsonFrom(raw);
    const ok = normalizePlan(j, list.length, wanted);
    if (ok) {
      plan = ok; source = 'llm';
      title = clip(j.title, 60);
      cast = (Array.isArray(j.cast) ? j.cast : []).slice(0, 3)
        .map(c => ({ name: clip(c && c.name, 40), look: clip(c && c.look, 300) }))
        .filter(c => c.name && c.look);
      questions = (Array.isArray(j.questions) ? j.questions : []).slice(0, 3)
        .map(q => clip(q, 200)).filter(Boolean);
      if (questions.length < 3) questions = [];
    } else why = 'план сцен от модели не сошёлся с текстом';
  } catch (e) { why = String(e.message || e); }

  if (!plan) plan = evenPlan(list, wanted);

  const lines = timeline(plan, list);
  const out = plan.map((sc, k) => {
    const text = list.slice(sc.from, sc.to + 1).map(s => s.text).join(' ');
    return {
      from: sc.from, to: sc.to, text,
      brief: sc.brief || `A picture-book illustration of this moment from a family story told aloud: "${clip(text, 320)}". Draw exactly what the words describe.`,
      start: lines[k].start, end: lines[k].end
    };
  });

  return res.status(200).json({
    title: title || firstWords(list[0].text, 4),
    cast,
    castText: cast.map(c => `${c.name}: ${c.look}`).join(' | '),
    scenes: out,
    questions,
    source,
    why
  });
}

/* ── вход ─────────────────────────────────────────────────────────────── */

const ROUTES = { clean: cleanAudio, transcribe, scenes };
export const isRecordRoute = name => Object.prototype.hasOwnProperty.call(ROUTES, name);

export async function recordRoute(name, req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    return await ROUTES[name](req, res);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e), step: name });
  }
}
