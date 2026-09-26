// Чем кончилась оплата, начатая в Radio. Начисление ложится в тот же общий
// счёт, что в Favola: купленный тариф тратится в любом из двух приложений.
import { cors } from './providers.js';
import { loadUser, saveUser, publicView } from './store.js';
import { grantFor, FREE_STORIES, DONATION } from './plans.js';
import { readCheckout, isPaid, SUMUP_READY } from './sumup.js';
import { PLANS, CURRENCY } from './plans.js';
import { send, receiptLetter, MAIL_READY } from './mail.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { device, ref } = req.body || {};
    if (!device || !ref) return res.status(400).json({ error: 'нужны device и ref' });

    const u = await loadUser(device);
    const rec = (u.payments || []).find(p => p.ref === ref);
    if (!rec) return res.status(200).json({ paid: false, status: 'не знаем такого платежа' });
    if (rec.status === 'PAID') {
      return res.status(200).json({ paid: true, already: true, ...publicView(u, FREE_STORIES) });
    }
    if (!SUMUP_READY()) return res.status(200).json({ paid: false, status: 'оплата не подключена' });

    const co = await readCheckout(rec.checkout);
    if (!isPaid(co)) {
      return res.status(200).json({ paid: false, status: co.status || 'PENDING' });
    }

    rec.status = 'PAID';
    rec.paidAt = Date.now();

    if (rec.plan !== DONATION.id) {
      const g = grantFor(rec.plan);
      const base = (u.until && u.until > Date.now()) ? u.until : Date.now();
      u.plan = g.plan;
      u.until = Math.max(g.until, base + (g.until - Date.now()));
      if (g.stories === null || u.stories === null) u.stories = null;
      else u.stories = (u.stories || 0) + g.stories;
    }

    await saveUser(u);

    if (MAIL_READY() && u.email) {
      const title = rec.plan === DONATION.id ? 'Поддержка проекта'
                  : (PLANS[rec.plan] ? PLANS[rec.plan].title.ru : rec.plan);
      try {
        await send({ to: u.email, ...receiptLetter({
          plan: title, amount: rec.amount, currency: CURRENCY,
          stories: rec.plan === DONATION.id ? null : u.stories,
          until: rec.plan === DONATION.id ? 0 : u.until
        }, req.body && req.body.lang) });
        rec.receipt = true;
        await saveUser(u);
      } catch (e) { rec.receiptError = String(e.message || e); }
    }

    return res.status(200).json({ paid: true, plan: rec.plan, ...publicView(u, FREE_STORIES) });
  } catch (e) {
    return res.status(200).json({ paid: false, status: String(e.message || e) });
  }
}
