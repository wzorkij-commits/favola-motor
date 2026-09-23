// Журнал расходов и финансовая админка. Сети нет: провайдеры подделаны, хранилище в памяти.
// Запуск: node scripts/ledger-test.mjs
import assert from 'node:assert/strict';
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
delete process.env.OWNER_EMAILS; delete process.env.ELEVENLABS_API_KEY;
process.env.ANTHROPIC_API_KEY = 'a'; process.env.GEMINI_API_KEY = 'g';

// подделка провайдеров: считаем вызовы, отдаём ответы нужной формы
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url); calls.push(u);
  if (u.includes('api.anthropic.com')) {
    return new Response(JSON.stringify({ content: [{ text: '{"ok":1}' }], stop_reason: 'end_turn',
      usage: { input_tokens: 1000, output_tokens: 500 } }), { status: 200 });
  }
  if (u.includes('generativelanguage.googleapis.com')) {
    return new Response(JSON.stringify({ output_image: { mime_type: 'image/jpeg', data: 'AAAA' } }), { status: 200 });
  }
  if (u.includes('text-to-speech')) return new Response(JSON.stringify({
    audio_base64: Buffer.from([1, 2, 3]).toString('base64'),
    alignment: { characters: ['a', 'b', 'c'],
      character_start_times_seconds: [0, 0.1, 0.2], character_end_times_seconds: [0.1, 0.2, 0.3] }
  }), { status: 200 });
  if (u.includes('/v1/user/subscription')) return new Response('{}', { status: 401 });
  return realFetch(url, opts);
};

const P = await import('../lib/providers.js');
const L = await import('../lib/ledger.js');
const S = await import('../lib/store.js');
const A = await import('../lib/h-admin.js');
const spend = (await import('../lib/h-spend.js')).default;
const account = (await import('../api/account.js')).default;
const plans = await import('../lib/plans.js');

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + ' -> ' + (e.message || e).split('\n').slice(0, 6).join(' | ')); }
}
const mkRes = () => { const r = { code: 200, body: null, setHeader() {}, status(c) { r.code = c; return r; },
  json(b) { r.body = b; return r; }, end() { return r; } }; return r; };
const post = async (h, body, query = {}) => { const res = mkRes(); await h({ method: 'POST', body, query, url: '/api/x' }, res); return res; };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const tot = async () => (await L.readLedger(30)).tot;

await t('функций в api/ не больше двенадцати (бесплатный тариф Vercel), новые адреса живут внутри соседних', async () => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'api');
  const n = fs.readdirSync(dir).filter(f => f.endsWith('.js')).length;
  assert.ok(n <= 12, 'файлов в api/: ' + n);
});

/* ── деньги из единиц ─────────────────────────────────────── */

await t('цены: миллион слов-кусочков, модель узнаётся по началу имени', () => {
  close(L.costOf({ 'ci:claude-sonnet-4-5': 1e6 }).anthropic, 3);
  close(L.costOf({ 'co:claude-sonnet-4-5-20250929': 1e6 }).anthropic, 15);
  close(L.costOf({ 'ci:claude-sonnet-5': 1e6, 'co:claude-sonnet-5': 1e6 }).anthropic, 12);
  close(L.costOf({ 'ci:какая-то-новая': 1e6 }).anthropic, 3);           // незнакомая модель: как Sonnet 4.5
});
await t('цены: картинки, голос, очистка, расшифровка', () => {
  close(L.costOf({ 'img:1K': 6 }).google, 0.402);
  close(L.costOf({ 'tts:eleven_multilingual_v2': 7000 }).elevenlabs, 0.70);
  close(L.costOf({ 'tts:eleven_flash_v2_5': 7000 }).elevenlabs, 0.35);
  close(L.costOf({ iso: 600 }).elevenlabs, 1.2);
  close(L.costOf({ stt: 3600 }).elevenlabs, 0.22);
});

/* ── запись из настоящих обёрток ──────────────────────────── */

await t('текст: каждый ответ Anthropic записывает свои слова-кусочки', async () => {
  const before = await tot();
  await P.generateText({ system: 's', prompt: 'p' });
  await P.generateTextEx({ system: 's', prompt: 'p' });
  const after = await tot();
  assert.equal((after['ci:claude-sonnet-4-5'] || 0) - (before['ci:claude-sonnet-4-5'] || 0), 2000);
  assert.equal((after['co:claude-sonnet-4-5'] || 0) - (before['co:claude-sonnet-4-5'] || 0), 1000);
});
await t('картинка записывается один раз на удачную картинку', async () => {
  const before = (await tot())['img:1K'] || 0;
  await P.generateImage('кадр', []);
  assert.equal(((await tot())['img:1K'] || 0) - before, 1);
});
await t('голос записывает знаки', async () => {
  const before = (await tot())['tts:eleven_multilingual_v2'] || 0;
  await P.generateVoice({ text: 'Жила-была тишина.', voiceId: 'v', settings: {} });
  assert.equal(((await tot())['tts:eleven_multilingual_v2'] || 0) - before, 'Жила-была тишина.'.length);
});
await t('ответ без usage и мусор в журнал не ломают сказку', async () => {
  await L.meter([{ f: 'x', n: NaN }, null, { f: 'y', n: -5 }]);
  await L.meterClaude('m', undefined);
  assert.ok(true);
});
await t('упавший вызов не записывается как потраченный', async () => {
  const keep = globalThis.fetch;
  globalThis.fetch = async () => new Response('boom', { status: 500 });
  const before = (await tot())['img:1K'] || 0;
  await assert.rejects(P.generateImage('кадр', []));
  globalThis.fetch = keep;
  assert.equal((await tot())['img:1K'] || 0, before);
});
await t('spend считает сказки: обычную и из записи отдельно', async () => {
  const b = await tot();
  await post(spend, { device: 'dev-led-story1' });
  await post(spend, { device: 'dev-led-story2', kind: 'record' });
  const a = await tot();
  assert.equal((a['n.story'] || 0) - (b['n.story'] || 0), 1);
  assert.equal((a['n.record'] || 0) - (b['n.record'] || 0), 1);
});

/* ── остаток и запас хода ─────────────────────────────────── */

const fakeLed = (perDay, days = 30) => {
  // perDay: единицы за день; последние дни в конце
  const arr = []; const now = Date.now();
  for (let i = days - 1; i >= 0; i--) arr.push({ date: L.dayKey(now - i * 86400000), units: { ...perDay } });
  const total = {}; for (const d of arr) for (const [k, v] of Object.entries(d.units)) total[k] = (total[k] || 0) + v;
  return { tot: total, days: arr, since: now - 30 * 86400000 };
};
const cfg0 = () => ({ ...L.DEFAULT_CFG, rate: 0.86, prior: { eur: 0 }, thresholds: { ...L.DEFAULT_CFG.thresholds }, cp: {}, log: [] });

await t('без введённого остатка сервис помечен «не задан», а не «всё хорошо»', () => {
  const s = L.resourceStates(fakeLed({}), cfg0()).find(r => r.id === 'anthropic');
  assert.equal(s.level, 'unset'); assert.equal(s.leftEur, null);
});
await t('остаток = введённое минус потраченное после ввода', () => {
  const led = fakeLed({});
  const cfg = L.setBalance(cfg0(), led, 'anthropic', 20);
  led.tot = { ...led.tot, 'co:claude-sonnet-4-5': 1e6 };   // потратили $15
  const s = L.resourceStates(led, cfg).find(r => r.id === 'anthropic');
  close(s.spentSinceEur, 15 * 0.86, 0.01); close(s.leftEur, 20 - 15 * 0.86, 0.01);
});
await t('до сверки потраченное не вычитается: считаем только то, что после', () => {
  const led = fakeLed({ 'co:claude-sonnet-4-5': 100000 });          // 3 млн слов-кусочков ($45) уже потрачены
  const cfg = L.setBalance(cfg0(), led, 'anthropic', 30);
  const s = L.resourceStates(led, cfg).find(r => r.id === 'anthropic');
  close(s.leftEur, 30, 0.001);
});
await t('запас: на сколько сказок хватит и уровни тревоги', () => {
  const day = { 'n.story': 2, 'ci:claude-sonnet-4-5': 40000, 'co:claude-sonnet-4-5': 12000 };   // 0.15 $ на сказку
  const mk = (eur) => { const led = fakeLed(day); return L.resourceStates(led, L.setBalance(cfg0(), led, 'anthropic', eur)).find(r => r.id === 'anthropic'); };
  const rich = mk(50), mid = mk(4), poor = mk(1);
  assert.equal(rich.level, 'ok'); assert.equal(rich.perStorySource, 'actual');
  assert.ok(rich.storiesLeft > 100);
  assert.equal(mid.level, 'soon', JSON.stringify(mid));
  assert.equal(poor.level, 'urgent'); assert.equal(mk(0).level, 'urgent');
});
await t('запас по дням: если тратим много в день, тревога раньше, чем по сказкам', () => {
  const day = { 'n.story': 1, 'co:claude-sonnet-4-5': 1e6 };            // $15 в день
  const led = fakeLed(day); const cfg = L.setBalance(cfg0(), led, 'anthropic', 20);
  const s = L.resourceStates(led, cfg).find(r => r.id === 'anthropic');
  assert.ok(s.daysLeft < 2, String(s.daysLeft)); assert.equal(s.level, 'urgent');
});
await t('мало своей статистики: цена сказки берётся по прикидке и так подписана', () => {
  const s = L.resourceStates(fakeLed({}), L.setBalance(cfg0(), fakeLed({}), 'google', 10)).find(r => r.id === 'google');
  assert.equal(s.perStorySource, 'estimate'); close(s.perStoryEur, 0.43 * 0.86, 0.01);
});
await t('ElevenLabs: остаток берётся из кредитов сервиса и переводится в сказки', () => {
  const s = L.resourceStates(fakeLed({}), cfg0(), Date.now(), { ok: true, used: 190000, limit: 220000, tier: 'creator' })
    .find(r => r.id === 'elevenlabs');
  assert.equal(s.leftBasis, 'credits'); assert.equal(s.credits.left, 30000);
  assert.equal(s.storiesLeft, Math.floor(30000 / 7000)); assert.equal(s.level, 'urgent');
  const rich = L.resourceStates(fakeLed({}), cfg0(), Date.now(), { ok: true, used: 1000, limit: 990000 }).find(r => r.id === 'elevenlabs');
  assert.equal(rich.level, 'ok');
});
await t('ElevenLabs без доступа к подписке: причина названа, расчёт идёт по введённому остатку', async () => {
  const live = await L.elevenLive(); assert.equal(live.ok, false);          // ключа нет
  process.env.ELEVENLABS_API_KEY = 'k';
  const l2 = await L.elevenLive(); assert.equal(l2.ok, false); assert.match(l2.why, /User: Read|права/);
  delete process.env.ELEVENLABS_API_KEY;
});

/* ── доходы ───────────────────────────────────────────────── */

const paid = (plan, amount, at) => ({ ref: plan + amount, plan, amount, status: 'PAID', paidAt: at });
const users = [
  { id: 'u1', email: 'a@x.co', made: 3, payments: [paid('month', 9.99, Date.now())] },
  { id: 'u2', email: 'b@x.co', made: 1, payments: [paid('year', 89, Date.now() - 86400000), paid('month', 9.99, Date.now() - 5 * 86400000)] },
  { id: 'u3', email: null, made: 2, payments: [paid('support', 5, Date.now())] },
  { id: 'u4', email: 'own@x.co', owner: true, made: 10, payments: [paid('month', 9.99, Date.now())] },
  { id: 'u5', email: 'c@x.co', made: 0, payments: [{ ref: 'z', plan: 'month', amount: 9.99, status: 'PENDING' }] }
];
await t('доходы: считаются только оплаченные, комиссия отдельно', () => {
  const r = L.revenueOf(users, Date.now());
  close(r.grossEur, 9.99 + 89 + 9.99 + 5 + 9.99, 0.001); assert.equal(r.payments, 5);
  close(r.feeEur, r.grossEur * 0.0169, 0.01); close(r.netEur, r.grossEur - r.feeEur, 0.011);
  assert.equal(r.byPlan.month.n, 3); assert.equal(r.byPlan.support.n, 1);
});
await t('платящие родители: без владельца, без доната, без неоплаченных, один человек один раз', () => {
  const r = L.revenueOf(users, Date.now());
  assert.equal(r.parentsPaid, 2);
  assert.equal(r.stories.total, 16); assert.equal(r.stories.mine, 10); assert.equal(r.stories.families, 3);
});
await t('доход по дням: тридцать столбцов, сегодняшняя оплата на своём месте', () => {
  const r = L.revenueOf(users, Date.now());
  assert.equal(r.days.length, 30); close(r.days[29].eur, 9.99 + 5 + 9.99, 0.001);
});

/* ── состояние целиком ────────────────────────────────────── */

await t('баланс проекта = доход минус комиссия минус расход (с тем, что потрачено до учёта)', () => {
  const led = fakeLed({ 'n.story': 1, 'img:1K': 6 });
  const cfg = cfg0(); cfg.prior = { eur: 10 };
  const st = A.buildState({ led, cfg, users, live: null });
  const tracked = st.resources.reduce((s, r) => s + r.spentTotalEur, 0);
  close(st.spend.totalEur, tracked + 10, 0.02);
  close(st.balance.eur, st.revenue.netEur - st.spend.totalEur, 0.02);
  assert.equal(st.days.length, 30); assert.equal(st.plans.length, 3);
});
await t('тарифы: что приносит и что стоит сказка; безлимит убыточен при полном использовании', () => {
  const led = fakeLed({ 'n.story': 1, 'ci:claude-sonnet-4-5': 6500, 'co:claude-sonnet-4-5': 3000,
    'img:1K': 6, 'tts:eleven_multilingual_v2': 7000 });
  const st = A.buildState({ led, cfg: cfg0(), users: [], live: null });
  const un = st.plans.find(p => p.id === 'unlimited'), mo = st.plans.find(p => p.id === 'month');
  assert.ok(st.unit.costPerStoryEur > 1, String(st.unit.costPerStoryEur));
  assert.ok(un.marginPerStoryEur < 0); assert.ok(mo.marginPerStoryEur > 0);
});
await t('тревоги: срочные первыми, «не введён остаток» последними', () => {
  const led = fakeLed({});
  const cfg = L.setBalance(cfg0(), led, 'google', 0.5);
  const st = A.buildState({ led, cfg, users: [], live: null });
  assert.equal(st.alerts[0].level, 'urgent'); assert.equal(st.alerts[0].id, 'google');
  assert.equal(st.alerts[st.alerts.length - 1].level, 'unset');
});

/* ── адрес админки ────────────────────────────────────────── */

const owner = 'dev-owner-adm1', stranger = 'dev-stranger-01';
{
  const u = S.blankUser(owner); u.email = 'wzorkij@gmail.com'; u.owner = true; await S.saveUser(u);
  const s = S.blankUser(stranger); s.email = 'stranger@x.co'; await S.saveUser(s);
  const f = S.blankUser('dev-fake-owner01'); f.email = 'stranger@x.co'; f.owner = true; await S.saveUser(f);   // флаг без почты владельца
}
await t('админка закрыта: чужое устройство, устройство без входа, флаг без почты владельца', async () => {
  for (const d of [stranger, 'dev-nobody-0001', 'dev-fake-owner01']) {
    const r = await post(A.default, { device: d }); assert.equal(r.code, 403, d);
    assert.equal(r.body.balance, undefined);
  }
  assert.equal((await post(A.default, {})).code, 400);
});
await t('админка закрыта и через общий адрес account (метка admin)', async () => {
  const r = await post(account, { device: stranger }, { __r: 'admin' }); assert.equal(r.code, 403);
  const ok = await post(account, { device: owner }, { __r: 'admin' }); assert.equal(ok.code, 200);
});
await t('владелец видит состояние; только POST', async () => {
  const r = await post(A.default, { device: owner });
  assert.equal(r.code, 200); assert.equal(r.body.resources.length, 3); assert.ok('balance' in r.body && 'health' in r.body);
  const g = mkRes(); await A.default({ method: 'GET', body: {}, query: {}, url: '/api/admin' }, g); assert.equal(g.code, 405);
});
await t('сверка остатка сохраняется и видна; кривые числа отвергаются', async () => {
  let r = await post(A.default, { device: owner, action: 'balance', id: 'anthropic', eur: 25 });
  assert.equal(r.code, 200);
  const a = r.body.resources.find(x => x.id === 'anthropic');
  assert.equal(a.checkpoint.balanceEur, 25); close(a.leftEur, 25, 0.5);
  assert.equal((await post(A.default, { device: owner, action: 'balance', id: 'anthropic', eur: -3 })).code, 400);
  assert.equal((await post(A.default, { device: owner, action: 'balance', id: 'anthropic', eur: 'много' })).code, 400);
  assert.equal((await post(A.default, { device: owner, action: 'balance', id: 'vercel', eur: 3 })).code, 400);
  r = await post(A.default, { device: owner }); assert.equal(r.body.resources.find(x => x.id === 'anthropic').checkpoint.balanceEur, 25);
  assert.ok(r.body.log.length >= 1);
});
await t('настройки: курс, «потрачено до учёта», пороги; безумные значения отвергаются', async () => {
  let r = await post(A.default, { device: owner, action: 'settings', rate: 0.9, priorEur: 12.5, thresholds: { urgentStories: 5 } });
  assert.equal(r.code, 200); assert.equal(r.body.rate, 0.9); assert.equal(r.body.spend.priorEur, 12.5);
  assert.equal(r.body.thresholds.urgentStories, 5); assert.equal(r.body.thresholds.soonStories, 40);
  assert.equal((await post(A.default, { device: owner, action: 'settings', rate: 50 })).code, 400);
  assert.equal((await post(A.default, { device: owner, action: 'settings', priorEur: -1 })).code, 400);
  assert.equal((await post(A.default, { device: owner, action: 'nope' })).code, 400);
});
await t('состояние собирается из настоящих пользователей хранилища', async () => {
  const u = S.blankUser('dev-payer-0001'); u.email = 'payer@x.co'; u.made = 2;
  u.payments = [{ ref: 'r1', plan: 'month', amount: 9.99, status: 'PAID', paidAt: Date.now() }];
  await S.saveUser(u);
  const r = await post(A.default, { device: owner });
  assert.ok(r.body.revenue.parentsPaid >= 1); assert.ok(r.body.revenue.grossEur >= 9.99);
});

/* ── письмо-тревога ───────────────────────────────────────── */

await t('тревога: срочное шлётся один раз в сутки, спокойное не шлётся', async () => {
  const sent = [];
  const mail = { MAIL_READY: () => true, send: async (m) => { sent.push(m); return {}; } };
  const cfg = await L.readCfg();
  const led = await L.readLedger(30);
  L.setBalance(cfg, led, 'google', 0.1); await L.writeCfg(cfg);
  const r1 = await L.checkAlerts({ mail, live: async () => ({ ok: false }) });
  assert.ok(r1.includes('google'), JSON.stringify(r1));
  const r2 = await L.checkAlerts({ mail, live: async () => ({ ok: false }) });
  assert.deepEqual(r2, []);
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'wzorkij@gmail.com'); assert.match(sent[0].subject, /Google/);
  assert.match(sent[0].text, /сказок/);
});
await t('тревога без почты молчит и не падает', async () => {
  const r = await L.checkAlerts({ mail: { MAIL_READY: () => false, send: async () => { throw new Error('no'); } }, live: async () => ({ ok: false }) });
  assert.deepEqual(r, []);
});

console.log(`\n${pass} прошло, ${fail} провалено`);
process.exit(fail ? 1 : 0);
