// Журнал расходов. Каждый платный вызов записывает, сколько единиц он потратил
// (слов-кусочков у Anthropic, картинок у Google, знаков и секунд у ElevenLabs).
// Деньги считаются потом, по таблице цен: цены меняются, а записанные единицы нет.
//
// Счётчики лежат в Upstash: общий (fav:led:tot) и по дням (fav:led:d:ГГГГ-ММ-ДД).
// Запись никогда не ломает сказку: любая ошибка журнала глотается.
//
// «Осталось» у Anthropic и Google программам недоступно, поэтому его ведёт человек:
// он вводит остаток со страницы сервиса, а мы вычитаем то, что потрачено после этого.
// У ElevenLabs остаток кредитов спрашивается у самого сервиса.

import { run, pairs, get, set } from './store.js';

/* ── цены (доллары). Правятся здесь или через cfg.prices ───────── */

export const PRICES = {
  usdToEur: 0.86,                      // курс по умолчанию, в админке правится
  claude: {                            // $ за миллион слов-кусочков
    default: { in: 3, out: 15 },
    'claude-sonnet-4-5': { in: 3, out: 15 },
    'claude-sonnet-5': { in: 2, out: 10 },
    'claude-haiku-4-5': { in: 1, out: 5 }
  },
  image: { '0.5K': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.151 },   // $ за картинку
  tts: { default: 0.10, eleven_flash_v2_5: 0.05, eleven_turbo_v2_5: 0.05 },   // $ за 1000 знаков
  isoPerMin: 0.12,                     // очистка звука, $ за минуту
  sttPerHour: 0.22,                    // расшифровка, $ за час
  sumupFee: 0.0169                     // комиссия SumUp
};

// Сколько, по нашей прикидке, стоит одна сказка, пока своей статистики мало ($).
export const EST_STORY_USD = { anthropic: 0.27, google: 0.43, elevenlabs: 0.70 };
export const EST_VOICE_CHARS = 7000;

export const RESOURCES = [
  { id: 'anthropic',  name: 'Anthropic',  what: 'текст' },
  { id: 'google',     name: 'Google',     what: 'картинки' },
  { id: 'elevenlabs', name: 'ElevenLabs', what: 'голос' }
];

export const DEFAULT_CFG = {
  rate: PRICES.usdToEur,
  prior: { eur: 0 },                                    // потрачено до того, как включили учёт
  thresholds: { urgentStories: 10, soonStories: 40, urgentDays: 2, soonDays: 7 },
  cp: {},                                               // сверки остатков по сервисам
  log: []
};

const DAY = 86400000;
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const byPrefix = (map, model) => {
  const keys = Object.keys(map).filter(k => k !== 'default').sort((a, b) => b.length - a.length);
  const hit = keys.find(k => String(model).startsWith(k));
  return map[hit || 'default'];
};

/* ── запись ──────────────────────────────────────────────────── */


/** items: [{f:'ci:claude-sonnet-4-5', n:1234}, ...]. Никогда не бросает. */
export async function meter(items) {
  try {
    const now = Date.now();
    const dk = 'fav:led:d:' + dayKey(now);
    const list = items.filter(i => i && i.n > 0 && isFinite(i.n)).map(i => ({ f: i.f, n: Math.round(i.n) }));
    if (!list.length) return;
    const cmds = [['SET', 'fav:led:since', String(now), 'NX']];
    for (const i of list) { cmds.push(['HINCRBY', 'fav:led:tot', i.f, i.n]); cmds.push(['HINCRBY', dk, i.f, i.n]); }
    cmds.push(['EXPIRE', dk, 400 * 86400]);
    cmds.push(['SET', 'fav:led:chk', '1', 'EX', '300', 'NX']);
    const res = await run(cmds);
    if (res[res.length - 1] === 'OK') { try { await checkAlerts(); } catch (e) { /* тревога не важнее сказки */ } }
  } catch (e) { /* журнал не должен ронять сказку */ }
}

export const meterClaude = (model, usage) => usage
  ? meter([{ f: 'ci:' + model, n: usage.input_tokens }, { f: 'co:' + model, n: usage.output_tokens }])
  : Promise.resolve();
export const meterImage = (size = '1K') => meter([{ f: 'img:' + size, n: 1 }]);
export const meterVoice = (model, chars) => meter([{ f: 'tts:' + model, n: chars }]);
export const meterSeconds = (kind, sec) => meter([{ f: kind, n: Math.ceil(sec) }]);
export const meterStory = (kind) => meter([{ f: kind === 'record' ? 'n.record' : 'n.story', n: 1 }]);

/* ── чтение ──────────────────────────────────────────────────── */

export async function readLedger(days = 30, now = Date.now()) {
  const keys = [];
  for (let i = 0; i < days; i++) keys.push(dayKey(now - i * DAY));
  const res = await run([['HGETALL', 'fav:led:tot'], ...keys.map(k => ['HGETALL', 'fav:led:d:' + k])]);
  const since = await get('fav:led:since').catch(() => null);
  return {
    tot: pairs(res[0]),
    days: keys.map((k, i) => ({ date: k, units: pairs(res[i + 1]) })).reverse(),   // старые первыми
    since: typeof since === 'number' ? since : null
  };
}

export async function readCfg() {
  const c = (await get('fav:led:cfg').catch(() => null)) || {};
  return {
    ...DEFAULT_CFG, ...c,
    prior: { ...DEFAULT_CFG.prior, ...(c.prior || {}) },
    thresholds: { ...DEFAULT_CFG.thresholds, ...(c.thresholds || {}) },
    cp: c.cp || {}, log: c.log || []
  };
}
export const writeCfg = (cfg) => set('fav:led:cfg', cfg);

/* ── деньги ──────────────────────────────────────────────────── */

/** Единицы в доллары. Возвращает по сервисам и по составу сказки. */
export function costOf(units, P = PRICES) {
  let text = 0, images = 0, voice = 0, clean = 0;
  for (const [f, n] of Object.entries(units || {})) {
    const i = f.indexOf(':');
    const kind = i < 0 ? f : f.slice(0, i), model = i < 0 ? '' : f.slice(i + 1);
    if (kind === 'ci') text += n / 1e6 * byPrefix(P.claude, model).in;
    else if (kind === 'co') text += n / 1e6 * byPrefix(P.claude, model).out;
    else if (kind === 'img') images += n * (P.image[model] ?? P.image['1K']);
    else if (kind === 'tts') voice += n / 1000 * byPrefix(P.tts, model);
    else if (kind === 'iso') clean += n / 60 * P.isoPerMin;
    else if (kind === 'stt') clean += n / 3600 * P.sttPerHour;
  }
  return { anthropic: text, google: images, elevenlabs: voice + clean, parts: { text, images, voice, clean } };
}

const sumUnits = (list) => {
  const o = {};
  for (const u of list) for (const [k, v] of Object.entries(u)) o[k] = (o[k] || 0) + v;
  return o;
};
const minusUnits = (a, b) => {
  const o = {};
  for (const [k, v] of Object.entries(a)) o[k] = Math.max(0, v - ((b || {})[k] || 0));
  return o;
};
const storiesIn = (u) => (u['n.story'] || 0) + (u['n.record'] || 0);
const ttsChars = (u) => Object.entries(u).filter(([k]) => k.startsWith('tts:')).reduce((s, [, v]) => s + v, 0);

/** Сверка остатка: человек ввёл, сколько сейчас на счёте сервиса. */
export function setBalance(cfg, led, id, eur, before = null, now = Date.now()) {
  cfg.cp[id] = { balanceEur: Math.round(eur * 100) / 100, at: now, base: { ...led.tot } };
  cfg.log = [{ t: now, id, after: cfg.cp[id].balanceEur, before }, ...(cfg.log || [])].slice(0, 100);
  return cfg;
}

/**
 * Состояние по сервисам: потрачено, осталось, на сколько сказок хватит, тревога.
 * live — необязательный ответ ElevenLabs о кредитах подписки.
 */
export function resourceStates(led, cfg, now = Date.now(), live = null, P = PRICES) {
  const rate = cfg.rate || PRICES.usdToEur;
  const th = cfg.thresholds;
  const week = sumUnits(led.days.slice(-7).map(d => d.units));
  const month = sumUnits(led.days.map(d => d.units));
  const stories30 = storiesIn(month);
  const cTot = costOf(led.tot, P), cWeek = costOf(week, P), cMonth = costOf(month, P);

  return RESOURCES.map(r => {
    const spentTotal = cTot[r.id] * rate;
    const perDay = cWeek[r.id] * rate / 7;
    const actual = stories30 >= 5 && cMonth[r.id] > 0;
    const perStory = actual ? cMonth[r.id] * rate / stories30 : EST_STORY_USD[r.id] * rate;
    const cp = cfg.cp[r.id] || null;
    const spentSince = cp ? costOf(minusUnits(led.tot, cp.base), P)[r.id] * rate : null;
    let left = cp ? cp.balanceEur - spentSince : null;

    let credits = null, basis = cp ? 'balance' : null;
    let storiesLeft = null;
    if (r.id === 'elevenlabs' && live && live.ok) {
      const charsPerStory = (stories30 >= 5 && ttsChars(month) > 0) ? ttsChars(month) / stories30 : EST_VOICE_CHARS;
      credits = { used: live.used, limit: live.limit, left: Math.max(0, live.limit - live.used),
                  resetAt: live.resetAt || null, tier: live.tier || null, charsPerStory: Math.round(charsPerStory) };
      storiesLeft = Math.floor(credits.left / charsPerStory);
      basis = 'credits';
      if (left === null) left = credits.left / 1000 * (byPrefix(P.tts, 'default')) * rate;   // цена кредитов
    } else if (left !== null && perStory > 0) {
      storiesLeft = Math.max(0, Math.floor(left / perStory));
    }
    const daysLeft = (left !== null && perDay > 0.005) ? Math.max(0, left / perDay) : null;

    let level = 'unset';
    if (storiesLeft !== null || left !== null) {
      level = 'ok';
      const soon = (storiesLeft !== null && storiesLeft < th.soonStories) || (daysLeft !== null && daysLeft < th.soonDays);
      const urgent = (left !== null && left <= 0) || (storiesLeft !== null && storiesLeft < th.urgentStories)
                  || (daysLeft !== null && daysLeft < th.urgentDays);
      if (urgent) level = 'urgent'; else if (soon) level = 'soon';
    }
    return {
      id: r.id, name: r.name, what: r.what,
      spentTotalEur: round2(spentTotal), perDayEur: round2(perDay),
      perStoryEur: round2(perStory), perStorySource: actual ? 'actual' : 'estimate',
      checkpoint: cp ? { balanceEur: cp.balanceEur, at: cp.at } : null,
      spentSinceEur: spentSince === null ? null : round2(spentSince),
      leftEur: left === null ? null : round2(left),
      leftBasis: basis, credits, storiesLeft,
      daysLeft: daysLeft === null ? null : Math.round(daysLeft * 10) / 10,
      level
    };
  });
}

export const round2 = (x) => Math.round(x * 100) / 100;

/* ── доходы ──────────────────────────────────────────────────── */

export function revenueOf(users, now = Date.now(), fee = PRICES.sumupFee, daysBack = 30) {
  const byPlan = {}; const perDay = {};
  let gross = 0, payments = 0;
  const parents = new Set();
  let stories = 0, mine = 0, families = 0;
  for (const u of users) {
    const made = u.made || 0;
    stories += made;
    if (u.owner) mine += made; else if (made > 0) families++;
    for (const p of (u.payments || [])) {
      if (p.status !== 'PAID') continue;
      const eur = Number(p.amount) || 0;
      gross += eur; payments++;
      const b = byPlan[p.plan] || (byPlan[p.plan] = { n: 0, eur: 0 });
      b.n++; b.eur = round2(b.eur + eur);
      if (p.plan !== 'support' && !u.owner) parents.add(u.email || u.id);
      const d = dayKey(p.paidAt || now);
      perDay[d] = round2((perDay[d] || 0) + eur);
    }
  }
  const days = [];
  for (let i = daysBack - 1; i >= 0; i--) { const k = dayKey(now - i * DAY); days.push({ date: k, eur: perDay[k] || 0 }); }
  const feeEur = round2(gross * fee);
  return {
    grossEur: round2(gross), feeEur, netEur: round2(gross - feeEur), payments,
    parentsPaid: parents.size, byPlan, days,
    last7Eur: round2(days.slice(-7).reduce((s, d) => s + d.eur, 0)),
    stories: { total: stories, mine, families }
  };
}

/** Ряд расходов по дням в евро, для картинки «доход и расход». */
export function spendByDay(led, cfg, P = PRICES) {
  const rate = cfg.rate || PRICES.usdToEur;
  return led.days.map(d => {
    const c = costOf(d.units, P);
    return { date: d.date, eur: round2((c.anthropic + c.google + c.elevenlabs) * rate),
             stories: storiesIn(d.units) };
  });
}

/** Из чего складывается сказка, в евро, по факту (последние 30 дней) или по прикидке. */
export function storyEconomics(led, cfg, P = PRICES) {
  const rate = cfg.rate || PRICES.usdToEur;
  const month = sumUnits(led.days.map(d => d.units));
  const n = storiesIn(month);
  const c = costOf(month, P);
  const actual = n >= 5;
  const parts = actual
    ? { text: c.parts.text / n, images: c.parts.images / n, voice: c.parts.voice / n, clean: c.parts.clean / n }
    : { text: EST_STORY_USD.anthropic, images: EST_STORY_USD.google, voice: EST_STORY_USD.elevenlabs, clean: 0 };
  const eurParts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round2(v * rate)]));
  const total = round2(Object.values(eurParts).reduce((s, v) => s + v, 0));
  return { costPerStoryEur: total, parts: eurParts, source: actual ? 'actual' : 'estimate', storiesIn30d: n };
}

/* ── кредиты ElevenLabs: единственный остаток, который сервис отдаёт сам ─────── */

export async function elevenLive() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, why: 'ключ ElevenLabs не задан' };
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) {
      return { ok: false, why: (r.status === 401 || r.status === 403)
        ? 'у ключа нет права читать подписку (нужно право User: Read)' : 'ElevenLabs ответил ' + r.status };
    }
    const j = await r.json();
    if (typeof j.character_limit !== 'number') return { ok: false, why: 'ElevenLabs вернул незнакомый ответ' };
    return { ok: true, used: j.character_count || 0, limit: j.character_limit,
             resetAt: j.next_character_count_reset_unix ? j.next_character_count_reset_unix * 1000 : null,
             tier: j.tier || null };
  } catch (e) { return { ok: false, why: 'ElevenLabs не ответил' }; }
}

/* ── тревога по почте ────────────────────────────────────────────
   Раз в пять минут (метка fav:led:chk) смотрим, не кончаются ли деньги.
   Про каждый сервис пишем не чаще раза в сутки. */

const LEVEL_TEXT = {
  urgent: (s) => `Срочно пополните ${s.name}. Осталось примерно на ${s.storiesLeft ?? 0} сказок`
    + (s.leftEur !== null ? ` (около ${s.leftEur} €)` : '') + '.',
};

export async function checkAlerts(deps = {}) {
  const led = await readLedger(30), cfg = await readCfg();
  const live = await (deps.live || elevenLive)();
  const states = resourceStates(led, cfg, Date.now(), live);
  const urgent = states.filter(s => s.level === 'urgent');
  if (!urgent.length) return [];
  const sent = [];
  const mail = deps.mail || await import('./mail.js');
  if (!mail.MAIL_READY()) return [];
  const { ownerList } = await import('./owner.js');
  const to = ownerList()[0];
  for (const s of urgent) {
    const [first] = await run([['SET', 'fav:led:alert:' + s.id, '1', 'EX', '86400', 'NX']]);
    if (first !== 'OK') continue;
    const text = LEVEL_TEXT.urgent(s) + '\n\nПополните счёт на сайте сервиса, затем откройте раздел «Финансы» '
      + 'на вашем сайте (admin.html) и сверьте остаток.';
    await mail.send({ to, subject: 'Favola · пора пополнить ' + s.name, text,
                      html: '<p style="font:16px/1.5 Georgia,serif">' + text.replace(/\n\n/g, '</p><p style="font:16px/1.5 Georgia,serif">') + '</p>' });
    sent.push(s.id);
  }
  return sent;
}
