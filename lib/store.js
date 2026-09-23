// Маленькое хранилище на Upstash Redis (через обычный HTTP, без библиотек).
//
// Зачем вообще сервер: как только берём деньги, нужно знать, кто заплатил,
// а полка должна переживать очистку кеша и переезд на другой телефон.
//
// Если ключи Upstash не заданы, всё продолжает работать: хранилище становится
// памятью процесса. Этого хватает, чтобы потрогать сценарий, но между
// перезапусками ничего не живёт — приложение об этом честно сообщает.

import { RECORD_FREE } from './plans.js';

// Имя ключей зависит от того, как заводили базу: у Upstash напрямую это
// UPSTASH_REDIS_REST_*, через Vercel Marketplace — иногда KV_REST_API_*.
// Берём то, что нашлось: иначе хранилище молча считается отсутствующим.
const URL_ENV   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL   || null;
const TOKEN_ENV = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || null;

export const STORE_READY = !!(URL_ENV && TOKEN_ENV);

const memory = new Map();

async function call(cmd) {
  const r = await fetch(URL_ENV, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + TOKEN_ENV, 'content-type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error('store ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return j.result;
}

export async function get(key) {
  if (!STORE_READY) return memory.has(key) ? JSON.parse(memory.get(key)) : null;
  const v = await call(['GET', key]);
  return v ? JSON.parse(v) : null;
}

export async function set(key, value) {
  const s = JSON.stringify(value);
  if (!STORE_READY) { memory.set(key, s); return; }
  await call(['SET', key, s]);
}

/* ── счётчики и обход ─────────────────────────────────────────
   Нужны журналу расходов и админке. Счётчики двигаются атомарно (HINCRBY),
   поэтому три картинки, нарисованные одновременно, не затирают друг друга.
   Без Upstash те же команды выполняются над памятью процесса: тесты и
   локальный запуск работают одинаково. */

const memHash = new Map();   // ключ -> Map(поле -> число)
const memFlag = new Map();   // ключ -> время, до которого метка жива

function memRun(c) {
  const [op, key, a, b, ...rest] = c;
  const O = String(op).toUpperCase();
  if (O === 'HINCRBY') {
    const h = memHash.get(key) || new Map();
    h.set(a, (h.get(a) || 0) + Number(b)); memHash.set(key, h); return h.get(a);
  }
  if (O === 'HGETALL') {
    const h = memHash.get(key); if (!h) return [];
    return [...h.entries()].flatMap(([f, v]) => [f, String(v)]);
  }
  if (O === 'EXPIRE') return 1;
  if (O === 'SET') {   // SET key val [EX n] [NX]
    const args = [b, ...rest].map(x => String(x).toUpperCase());
    const ex = args.indexOf('EX') >= 0 ? Number([b, ...rest][args.indexOf('EX') + 1]) : 0;
    const nx = args.includes('NX');
    const exists = memFlag.has(key) ? memFlag.get(key) > Date.now() : memory.has(key);
    if (nx && exists) return null;
    memory.set(key, String(a));   // как в Upstash: сырая строка, get() разбирает её сам
    memFlag.set(key, ex ? Date.now() + ex * 1000 : 3e12);
    return 'OK';
  }
  return null;
}

/** Выполнить несколько команд одним запросом. Возвращает массив результатов. */
export async function run(cmds) {
  if (!STORE_READY) return cmds.map(memRun);
  const r = await fetch(URL_ENV.replace(/\/+$/, '') + '/pipeline', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + TOKEN_ENV, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(4000)
  });
  if (!r.ok) throw new Error('store ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return (await r.json()).map(x => (x && x.error) ? null : (x ? x.result : null));
}

/** Плоский ответ HGETALL ([поле, значение, ...]) в объект с числами. */
export function pairs(flat) {
  const o = {};
  for (let i = 0; i + 1 < (flat || []).length; i += 2) o[flat[i]] = Number(flat[i + 1]);
  return o;
}

/** Все пользователи. Для админки: считаем плательщиков и сказки. Потолок не даёт зациклиться. */
export async function allUsers(limit = 5000) {
  const out = [];
  if (!STORE_READY) {
    for (const [k, v] of memory) if (k.startsWith('fav:u:')) out.push(JSON.parse(v));
    return out.slice(0, limit);
  }
  let cursor = '0';
  for (let i = 0; i < 60 && out.length < limit; i++) {
    const [next, keys] = await call(['SCAN', cursor, 'MATCH', 'fav:u:*', 'COUNT', '300']);
    cursor = String(next);
    if (keys && keys.length) {
      const vals = await call(['MGET', ...keys]);
      for (const v of vals) { if (v) { try { out.push(JSON.parse(v)); } catch (e) {} } }
    }
    if (cursor === '0') break;
  }
  return out;
}

/* ── пользователь ─────────────────────────────────────────────────────
   Ключ устройства выдаётся браузером при первом заходе и больше не меняется.
   Почта появляется только на оплате и связывает несколько устройств. */

export const userKey   = id   => 'fav:u:' + id;
export const emailKey  = mail => 'fav:e:' + String(mail).trim().toLowerCase();
export const googleKey = sub  => 'fav:g:' + String(sub);

export function blankUser(id) {
  return {
    id,
    email: null,
    google: null,          // опознаватель Google, если человек вошёл
    name: null,
    shelf: [],            // id сказок, которые человек уже прошёл
    made: 0,              // сколько сказок собрано (для бесплатного лимита)
    plan: null,
    stories: 0,           // остаток; null = без ограничений
    until: 0,
    payments: []
  };
}

export async function loadUser(id) {
  return (await get(userKey(id))) || blankUser(id);
}

export async function saveUser(u) {
  await set(userKey(u.id), u);
  return u;
}

/**
 * Связать устройство с опознанием (почтой или Google) и подтянуть всё,
 * что у человека уже есть на других устройствах. Полки складываются,
 * из оплаченного берётся лучшее.
 */
export async function linkIdentity(u, key) {
  const known = (await get(key)) || { devices: [] };
  if (!known.devices.includes(u.id)) known.devices.push(u.id);

  for (const other of known.devices) {
    if (other === u.id) continue;
    const o = await get(userKey(other));
    if (!o) continue;
    u.shelf = [...new Set([...(u.shelf || []), ...(o.shelf || [])])];
    // Из оплаченного берём лучшее. Безлимит без срока не работает, поэтому
    // вместе со счётчиком переносим и срок. Просроченное не переносим.
    const oAlive = (o.until || 0) > Date.now();
    if ((o.until || 0) > (u.until || 0)) {
      u.plan = o.plan; u.until = o.until; u.stories = o.stories;
    } else if (oAlive && o.stories === null) {
      u.plan = o.plan; u.stories = null; u.until = Math.max(o.until, u.until || 0);
    }
    if (o.owner) u.owner = true;
    if (!u.email && o.email) u.email = o.email;
  }
  await set(key, known);
  return u;
}

/** Есть ли право собрать ещё одну сказку. */
export function canMake(u, freeStories) {
  if (u.made < freeStories) return { ok: true, reason: 'free' };
  const alive = u.until && u.until > Date.now();
  if (!alive) return { ok: false, reason: 'expired' };
  if (u.stories === null) return { ok: true, reason: 'unlimited' };
  if (u.stories > 0) return { ok: true, reason: 'quota' };
  return { ok: false, reason: 'empty' };
}

/** Можно ли собрать сказку из записи: бесплатна только первая сказка аккаунта, дальше нужен оплаченный доступ. */
export function canMakeRecord(u, freeStories, recordFree = RECORD_FREE) {
  if (u.made < recordFree && u.made < freeStories) return { ok: true, reason: 'free' };
  const alive = u.until && u.until > Date.now();
  if (!alive) return { ok: false, reason: 'record-paid' };
  if (u.stories === null) return { ok: true, reason: 'unlimited' };
  if (u.stories > 0) return { ok: true, reason: 'quota' };
  return { ok: false, reason: 'record-paid' };
}

/** То, что не стыдно отдать в браузер. */
export function publicView(u, freeStories, recordFree = RECORD_FREE) {
  const c = canMake(u, freeStories);
  return {
    id: u.id,
    email: u.email,
    shelf: u.shelf,
    made: u.made,
    name: u.name,
    google: !!u.google,
    owner: !!(u.owner),
    plan: u.plan,
    stories: u.stories,
    until: u.until,
    freeLeft: Math.max(0, freeStories - u.made),
    canMake: c.ok,
    canRecord: canMakeRecord(u, freeStories, recordFree).ok,
    why: c.reason
  };
}
