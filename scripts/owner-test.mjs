// Аккаунт владельца и защита от чужой почты. Сеть не нужна: хранилище в памяти.
// Запуск: node scripts/owner-test.mjs
import assert from 'node:assert/strict';
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
delete process.env.OWNER_EMAILS;
process.env.RESEND_API_KEY = 'test'; process.env.EMAIL_FROM = 'x@example.com';

const O = await import('../lib/owner.js');
const S = await import('../lib/store.js');
const otp = (await import('../lib/h-otp.js')).default;
const account = (await import('../api/account.js')).default;
const spend = (await import('../lib/h-spend.js')).default;
const plans = await import('../lib/plans.js');
const auth = (await import('../api/auth.js')).default;

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + ' -> ' + (e.message || e).split('\n')[0]); }
}
const mkRes = () => { const r = { code: 200, body: null, setHeader() {}, status(c) { r.code = c; return r; },
  json(b) { r.body = b; return r; }, end() { return r; } }; return r; };
const post = async (h, body, query = {}) => { const res = mkRes(); await h({ method: 'POST', body, query, url: '/api/x' }, res); return res; };

await t('почта Василия в списке владельцев, чужая нет', () => {
  assert.equal(O.isOwner('wzorkij@gmail.com'), true);
  assert.equal(O.isOwner(' WZorkij@Gmail.com '), true);
  assert.equal(O.isOwner('someone@gmail.com'), false);
  assert.equal(O.isOwner(''), false);
});
await t('OWNER_EMAILS добавляет адреса', () => {
  process.env.OWNER_EMAILS = 'a@b.co, c@d.co';
  assert.equal(O.isOwner('c@d.co'), true);
  assert.equal(O.isOwner('wzorkij@gmail.com'), true);
  delete process.env.OWNER_EMAILS;
});
await t('grantOwner: безлимит на годы вперёд, чужому ничего', () => {
  const u = S.blankUser('dev-owner-1');
  assert.equal(O.grantOwner(u, 'stranger@x.co'), false);
  assert.equal(S.canMake(u, plans.FREE_STORIES).reason === 'free' || u.made >= 1, true);
  u.made = 50;
  assert.equal(S.canMake(u, plans.FREE_STORIES).ok, false);
  assert.equal(O.grantOwner(u, 'wzorkij@gmail.com'), true);
  const c = S.canMake(u, plans.FREE_STORIES);
  assert.equal(c.ok, true); assert.equal(c.reason, 'unlimited');
});
await t('вход по коду: владелец получает безлимит, сколько бы ни собрал', async () => {
  // код кладём так же, как это делает шаг «прислать»
  await S.set('fav:otp:wzorkij@gmail.com', { code: '123456', until: Date.now() + 60000, left: 5, device: 'dev-owner-2' });
  let r = await post(otp, { device: 'dev-owner-2', email: 'wzorkij@gmail.com', code: '123456' });
  assert.equal(r.body.outcome, 'ok'); assert.equal(r.body.plan, 'unlimited'); assert.equal(r.body.canMake, true);
  for (let i = 0; i < 6; i++) {
    r = await post(spend, { device: 'dev-owner-2' });
    assert.equal(r.body.ok, true, 'сказка №' + (i + 1));
  }
  const u = await S.loadUser('dev-owner-2');
  assert.equal(u.stories, null);
});
await t('вход по коду: обычный человек безлимита не получает', async () => {
  await S.set('fav:otp:mama@example.com', { code: '654321', until: Date.now() + 60000, left: 5, device: 'dev-mama' });
  const r = await post(otp, { device: 'dev-mama', email: 'mama@example.com', code: '654321' });
  assert.equal(r.body.outcome, 'ok'); assert.notEqual(r.body.plan, 'unlimited');
  const u = await S.loadUser('dev-mama'); u.made = 1; await S.saveUser(u);
  const s = await post(spend, { device: 'dev-mama' });
  assert.equal(s.body.ok, false);
});
await t('чужой не может назвать почту владельца и забрать безлимит', async () => {
  const r = await post(account, { device: 'dev-thief-1', email: 'wzorkij@gmail.com' });
  assert.equal(r.code, 403);
  const u = await S.loadUser('dev-thief-1');
  assert.notEqual(u.plan, 'unlimited'); assert.equal(u.email, null);
});
await t('второе устройство владельца после входа тоже безлимитное', async () => {
  await S.set('fav:otp:wzorkij@gmail.com', { code: '111111', until: Date.now() + 60000, left: 5, device: 'dev-owner-3' });
  const r = await post(otp, { device: 'dev-owner-3', email: 'wzorkij@gmail.com', code: '111111' });
  assert.equal(r.body.plan, 'unlimited');
});
await t('linkIdentity: безлимит переносится вместе со сроком', async () => {
  const a = S.blankUser('dev-link-a'); a.email = 'z@z.co'; a.plan = 'unlimited'; a.stories = null; a.until = Date.now() + 1e9;
  await S.saveUser(a); await S.linkIdentity(a, S.emailKey('z@z.co'));
  const b = S.blankUser('dev-link-b'); b.made = 9;
  await S.linkIdentity(b, S.emailKey('z@z.co'));
  assert.equal(S.canMake(b, plans.FREE_STORIES).reason, 'unlimited');
});
await t('linkIdentity: просроченный безлимит не переносится', async () => {
  const a = S.blankUser('dev-old-a'); a.plan = 'unlimited'; a.stories = null; a.until = Date.now() - 1000;
  await S.saveUser(a); await S.linkIdentity(a, S.emailKey('old@z.co'));
  const b = S.blankUser('dev-old-b'); b.made = 9;
  await S.linkIdentity(b, S.emailKey('old@z.co'));
  assert.equal(S.canMake(b, plans.FREE_STORIES).ok, false);
});
await t('выход снимает безлимит владельца, повторный вход возвращает', async () => {
  let r = await post(auth, { device: 'dev-owner-2', signout: true });
  assert.equal(r.body.canMake, false); assert.equal(r.body.email, null);
  await S.set('fav:otp:wzorkij@gmail.com', { code: '222222', until: Date.now() + 60000, left: 5, device: 'dev-owner-2' });
  r = await post(otp, { device: 'dev-owner-2', email: 'wzorkij@gmail.com', code: '222222' });
  assert.equal(r.body.plan, 'unlimited'); assert.equal(r.body.canMake, true);
});
await t('выход не трогает оплату обычного человека', async () => {
  const u = S.blankUser('dev-payer'); u.plan = 'month'; u.stories = 3; u.until = Date.now() + 1e9; u.made = 4;
  await S.saveUser(u);
  const r = await post(auth, { device: 'dev-payer', signout: true });
  assert.equal(r.body.plan, 'month'); assert.equal(r.body.stories, 3);
});
console.log(`\n${pass} прошло, ${fail} провалено`);
process.exit(fail ? 1 : 0);
