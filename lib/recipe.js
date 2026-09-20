// Рецепт сказки: по одному значению с каждой оси каталога. Выбирает код, а не модель,
// потому что модель, которую просят «придумай по-другому», придумывает одно и то же.
//
// Что гарантируется:
//  — значения подходят по возрасту слушателя и по тону сказки (смешная, тёплая, приключение);
//  — форма и голос не спорят о лице рассказа (нельзя письмо от первого лица и «рассказчик
//    на стороне героя» в третьем);
//  — недавние значения браузер присылает в `recent`, и они выбираются реже; два рецепта
//    подряд не совпадают больше чем по одной из пяти главных осей.

import { AXES, KEY_AXES, byId } from './catalog.js';

const REG = { comic: 'c', tender: 't', adventure: 'a' };
const RECENT_LOOK = 10;   // сколько прошлых рецептов учитываем
const DISTANCE_LOOK = 5;  // с какими прошлыми сверяем «одну и ту же сказку»
const MAX_SAME = 1;       // сколько главных осей из пяти может совпасть
const ATTEMPTS = 40;

function clampAge(age) {
  const n = Number(age);
  if (!Number.isFinite(n)) return 7;
  return Math.max(3, Math.min(12, Math.round(n)));
}

/** Приводит то, что прислал браузер, к чистому списку {ось: id}. Чужое отбрасывает. */
export function cleanRecent(recent) {
  if (!Array.isArray(recent)) return [];
  const out = [];
  for (const r of recent.slice(0, 12)) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const row = {};
    for (const a of AXES) {
      const v = r[a.key];
      if (typeof v === 'string' && v.length <= 40 && /^[a-z0-9-]+$/.test(v)) row[a.key] = v;
    }
    if (Object.keys(row).length) out.push(row);
  }
  return out;
}

function recencyFactor(axis, id, recent) {
  let f = 1;
  for (let i = 0; i < Math.min(recent.length, RECENT_LOOK); i++) {
    if (recent[i][axis] !== id) continue;
    const k = i === 0 ? 0.05 : i <= 2 ? 0.25 : i <= 7 ? 0.6 : 0.85;
    if (k < f) f = k;
  }
  return f;
}

function wpick(list, weight, rnd) {
  const ws = list.map(weight);
  const total = ws.reduce((s, x) => s + x, 0);
  if (!(total > 0)) return list[Math.floor(rnd() * list.length)];
  let r = rnd() * total;
  for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

function conflicts(axis, cand, picked) {
  // лицо рассказа
  const narrs = Object.values(picked).map(p => p.item.narr).filter(Boolean);
  if (cand.narr && narrs.some(n => n !== cand.narr)) return true;
  // явные несовместимости «ось:id»
  const tag = `${axis}:${cand.id}`;
  for (const [ax, p] of Object.entries(picked)) {
    if ((cand.x || []).includes(`${ax}:${p.item.id}`)) return true;
    if ((p.item.x || []).includes(tag)) return true;
  }
  return false;
}

function pool(list, { age, reg, topics }, level) {
  return list.filter(x => {
    if (age < x.a[0] || age > x.a[1]) return false;
    if (level < 1 && reg && !x.r.includes(reg)) return false;
    if (level < 2 && topics.length && (x.nt || []).some(t => topics.includes(t))) return false;
    if (level < 2 && (x.ot || []).length && !(x.ot || []).some(t => topics.includes(t))) return false;
    return true;
  });
}

function buildOne(ctx, recent, rnd) {
  const picked = {};
  for (const ax of AXES) {
    let cands = [];
    for (let level = 0; level <= 2 && !cands.length; level++) {
      cands = pool(ax.list, ctx, level).filter(x => !conflicts(ax.key, x, picked));
    }
    if (!cands.length) cands = ax.list.filter(x => ctx.age >= x.a[0] && ctx.age <= x.a[1]);
    if (!cands.length) cands = ax.list;
    const item = wpick(cands, x => x.w * recencyFactor(ax.key, x.id, recent), rnd);
    picked[ax.key] = { item };
  }
  return picked;
}

/** Сколько главных осей совпало у двух рецептов ({ось: id}). */
export function sameAxes(a, b) {
  return KEY_AXES.filter(k => a[k] && a[k] === b[k]).length;
}

function score(ids, recent) {
  let worst = 0, sum = 0;
  for (const r of recent.slice(0, DISTANCE_LOOK)) { const s = sameAxes(ids, r); worst = Math.max(worst, s); sum += s; }
  return { worst, sum };
}

export function renderRecipe(picked) {
  const lines = {};
  const must = [];
  const soft = [];
  for (const ax of AXES) {
    const it = picked[ax.key].item;
    lines[ax.key] = it.t;
    (ax.must ? must : soft).push(`— ${ax.label}: ${it.t}`);
  }
  return [
    'Рецепт этой сказки. Его выбрал редактор, чтобы сказка не была похожа на прошлые: одна и та же история про то же самое рассказывается по-разному. Договор, инструмент, ручка и детали запроса остаются как в досье, меняется только способ рассказа.',
    'Обязательно:',
    ...must,
    'По возможности (если это не ломает детали запроса и не делает сказку тяжелее):',
    ...soft
  ].join('\n');
}

/**
 * @param {{age?:number|null, register?:string, topics?:string[], recent?:any[], rnd?:()=>number}} o
 * @returns {{ids:Record<string,string>, lines:Record<string,string>, text:string}}
 */
export function pickRecipe({ age = null, register = '', topics = [], recent = [], rnd = Math.random } = {}) {
  const ctx = {
    age: clampAge(age),
    reg: REG[register] || '',
    topics: Array.isArray(topics) ? topics.filter(t => typeof t === 'string') : []
  };
  const past = cleanRecent(recent);
  let best = null;
  for (let i = 0; i < ATTEMPTS; i++) {
    const picked = buildOne(ctx, past, rnd);
    const ids = Object.fromEntries(AXES.map(a => [a.key, picked[a.key].item.id]));
    const s = score(ids, past);
    // Соседняя с прошлой сказка: форма, голос и финал обязаны быть другими, если хватает выбора.
    const nb = past[0] ? ['form', 'voice', 'ending'].filter(k => past[0][k] && past[0][k] === ids[k]).length : 0;
    s.worst += nb ? 2 : 0;
    if (!best || s.worst < best.s.worst || (s.worst === best.s.worst && s.sum < best.s.sum)) best = { picked, ids, s };
    if (s.worst <= MAX_SAME) break;
  }
  const lines = Object.fromEntries(AXES.map(a => [a.key, best.picked[a.key].item.t]));
  return { ids: best.ids, lines, text: renderRecipe(best.picked) };
}

/** Из id обратно в текст (для редактора: рецепт едет в досье как id). */
export function recipeFromIds(ids = {}) {
  const picked = {};
  for (const ax of AXES) {
    const it = byId(ax.key, ids[ax.key]);
    if (!it) return null;
    picked[ax.key] = { item: it };
  }
  return { ids: { ...ids }, lines: Object.fromEntries(AXES.map(a => [a.key, picked[a.key].item.t])), text: renderRecipe(picked) };
}
