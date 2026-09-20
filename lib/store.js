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
    plan: u.plan,
    stories: u.stories,
    until: u.until,
    freeLeft: Math.max(0, freeStories - u.made),
    canMake: c.ok,
    canRecord: canMakeRecord(u, freeStories, recordFree).ok,
    why: c.reason
  };
}
