// Финансовая админка. Только для владельца.
//
//   POST /api/admin {device}                              -> всё состояние
//   POST /api/admin {device, action:'balance', id, eur}   -> сверить остаток сервиса
//   POST /api/admin {device, action:'settings', rate?, priorEur?, thresholds?}
//
// Доступ: устройство должно принадлежать аккаунту, вошедшему почтой владельца
// (Google или код из письма). Ключ устройства не светится нигде, кроме браузера человека.

import { cors } from './providers.js';
import { loadUser, allUsers, STORE_READY } from './store.js';
import { isOwner } from './owner.js';
import { PLANS, CURRENCY } from './plans.js';
import { BLOB_READY } from './blob.js';
import { SUMUP_READY } from './sumup.js';
import { MAIL_READY } from './mail.js';
import { GOOGLE_READY } from './google.js';
import {
  PRICES, readLedger, readCfg, writeCfg, resourceStates, revenueOf, spendByDay,
  storyEconomics, setBalance, elevenLive, round2, RESOURCES
} from './ledger.js';

const okId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);

const ALERT_TEXT = {
  urgent: (s) => `Срочно пополнить ${s.name}: хватит примерно на ${s.storiesLeft ?? 0} сказок`
    + (s.leftEur !== null ? ` (около ${s.leftEur} €)` : ''),
  soon: (s) => `Скоро пополнить ${s.name}: хватит примерно на ${s.storiesLeft ?? 0} сказок`
    + (s.leftEur !== null ? ` (около ${s.leftEur} €)` : ''),
  unset: (s) => `Не введён остаток ${s.name}. Без него я не увижу, когда кончатся деньги`
};

/** Собирает всё, что рисует страница. Чистая функция: тесты кормят её готовыми данными. */
export function buildState({ led, cfg, users, live, now = Date.now() }) {
  const resources = resourceStates(led, cfg, now, live);
  const revenue = revenueOf(users, now, PRICES.sumupFee);
  const spendDays = spendByDay(led, cfg);
  const econ = storyEconomics(led, cfg);

  const spentTracked = resources.reduce((s, r) => s + r.spentTotalEur, 0);
  const spentTotal = round2(spentTracked + (cfg.prior.eur || 0));
  const inAccounts = round2(resources.reduce((s, r) => s + (r.leftEur || 0), 0));

  const alerts = [];
  for (const r of resources) {
    if (r.level === 'urgent') alerts.push({ id: r.id, level: 'urgent', text: ALERT_TEXT.urgent(r) });
    else if (r.level === 'soon') alerts.push({ id: r.id, level: 'soon', text: ALERT_TEXT.soon(r) });
    else if (r.level === 'unset') alerts.push({ id: r.id, level: 'unset', text: ALERT_TEXT.unset(r) });
  }
  const order = { urgent: 0, soon: 1, unset: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  // Что приносит и что стоит одна сказка по каждому тарифу, если человек использует его целиком.
  const fee = PRICES.sumupFee;
  const plans = Object.values(PLANS).map(p => {
    const perStory = p.price / p.stories;
    const net = perStory * (1 - fee);
    return { id: p.id, title: p.title.ru, price: p.price, stories: p.stories,
             perStoryEur: round2(perStory), netPerStoryEur: round2(net),
             marginPerStoryEur: round2(net - econ.costPerStoryEur) };
  });

  // Доход и расход по дням в одном ряду: картинка «сколько пришло и сколько ушло».
  const days = revenue.days.map((d, i) => {
    const s = spendDays.find(x => x.date === d.date);
    return { date: d.date, incomeEur: d.eur, spendEur: s ? s.eur : 0, stories: s ? s.stories : 0 };
  });

  return {
    now, currency: CURRENCY, rate: cfg.rate, since: led.since,
    resources, alerts,
    revenue: { ...revenue, days: undefined },
    days,
    spend: { totalEur: spentTotal, trackedEur: round2(spentTracked), priorEur: cfg.prior.eur || 0 },
    balance: { eur: round2(revenue.netEur - spentTotal), inAccountsEur: inAccounts },
    unit: econ, plans,
    stories: revenue.stories,
    thresholds: cfg.thresholds,
    health: { store: STORE_READY, blob: BLOB_READY(), mail: MAIL_READY(), sumup: SUMUP_READY(), google: GOOGLE_READY() },
    eleven: live && !live.ok ? { why: live.why } : null,
    log: (cfg.log || []).slice(0, 12)
  };
}

export default async function handler(req, res) {
  cors(res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { device, action = 'state' } = req.body || {};
    if (!okId(device)) return res.status(400).json({ error: 'нет ключа устройства' });
    const u = await loadUser(device);
    if (!(u.owner && isOwner(u.email))) {
      return res.status(403).json({ error: 'только для владельца: войдите в приложении своей почтой' });
    }

    let cfg = await readCfg();
    const body = req.body || {};

    if (action === 'balance') {
      const id = String(body.id || '');
      const eur = Number(body.eur);
      if (!RESOURCES.some(r => r.id === id)) return res.status(400).json({ error: 'неизвестный сервис' });
      if (!isFinite(eur) || eur < 0 || eur > 1e6) return res.status(400).json({ error: 'остаток должен быть числом от нуля' });
      const led0 = await readLedger(30);
      const before = resourceStates(led0, cfg, Date.now(), null).find(r => r.id === id).leftEur;
      cfg = setBalance(cfg, led0, id, eur, before);
      await writeCfg(cfg);
    } else if (action === 'settings') {
      const rate = body.rate === undefined ? undefined : Number(body.rate);
      if (rate !== undefined) {
        if (!isFinite(rate) || rate < 0.3 || rate > 3) return res.status(400).json({ error: 'курс выглядит неправдоподобно' });
        cfg.rate = rate;
      }
      if (body.priorEur !== undefined) {
        const p = Number(body.priorEur);
        if (!isFinite(p) || p < 0 || p > 1e6) return res.status(400).json({ error: 'сумма должна быть числом от нуля' });
        cfg.prior = { eur: p };
      }
      if (body.thresholds && typeof body.thresholds === 'object') {
        for (const k of ['urgentStories', 'soonStories', 'urgentDays', 'soonDays']) {
          if (body.thresholds[k] !== undefined) {
            const v = Number(body.thresholds[k]);
            if (!isFinite(v) || v < 0 || v > 10000) return res.status(400).json({ error: 'порог: число от нуля' });
            cfg.thresholds[k] = v;
          }
        }
      }
      await writeCfg(cfg);
    } else if (action !== 'state') {
      return res.status(400).json({ error: 'неизвестное действие' });
    }

    const [led, users, live] = await Promise.all([readLedger(30), allUsers(), elevenLive()]);
    return res.status(200).json(buildState({ led, cfg, users, live }));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
