// Начало оплаты. Сервер создаёт платёж и возвращает ссылку на страницу SumUp.
//
//   POST /api/pay {device, plan, amount?, email?, back}
//        plan: month | year | unlimited | support
//        amount: только для support
//        back: адрес, куда SumUp вернёт человека после оплаты
//
// Возвращает {url, ref}. Ссылку открывает браузер, дальше карта вводится
// на стороне SumUp: своей формы для карт у нас нет и быть не должно.

import { cors } from '../lib/providers.js';
import { loadUser, saveUser } from '../lib/store.js';
import { PLANS, DONATION, CURRENCY, priceOf } from '../lib/plans.js';
import { createCheckout, SUMUP_READY } from '../lib/sumup.js';
import { asked } from '../lib/route.js';
import paystatus from '../lib/h-paystatus.js';

const okMail = m => typeof m === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m.trim());

export default async function handler(req, res) {
  // /api/pay-status живёт здесь же
  if (asked(req) === 'pay-status') return paystatus(req, res);

  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    if (!SUMUP_READY()) {
      return res.status(200).json({
        outcome: 'not-configured',
        why: 'Оплата не подключена: в Vercel не задан SUMUP_API_KEY.'
      });
    }

    const { device, plan, amount, email, back } = req.body || {};
    if (!device) return res.status(400).json({ error: 'нет ключа устройства' });

    const isDonation = plan === DONATION.id;
    if (!isDonation && !PLANS[plan]) return res.status(400).json({ error: 'неизвестный тариф: ' + plan });

    const price = priceOf(plan, amount);
    if (price === null) return res.status(400).json({ error: 'сумма вне допустимого' });

    const u = await loadUser(device);
    if (email !== undefined && email !== null && email !== '') {
      if (!okMail(email)) return res.status(400).json({ error: 'почта не похожа на почту' });
      u.email = String(email).trim().toLowerCase();
    }

    const ref = 'favola-' + device.slice(0, 12) + '-' + Date.now().toString(36);
    const title = isDonation ? DONATION.title.ru : PLANS[plan].title.ru;

    const co = await createCheckout({
      reference: ref,
      amount: price,
      currency: CURRENCY,
      description: 'Favola · ' + title,
      // приложение присылает адрес возврата с меткой {REF} — подставляем номер платежа
      redirectUrl: (back && /^https?:\/\//.test(back))
        ? back.replace('{REF}', encodeURIComponent(ref))
        : 'https://favola-vercel-1.vercel.app/app.html?paid=' + encodeURIComponent(ref),
      email: u.email
    });

    // Помним, за что платили: подтверждать будем по этой записи, а не по словам браузера.
    u.payments = (u.payments || []).filter(p => p.status !== 'PENDING' || Date.now() - p.at < 36e5);
    u.payments.push({ ref, checkout: co.id, plan, amount: price, at: Date.now(), status: 'PENDING' });
    await saveUser(u);

    return res.status(200).json({ outcome: 'ok', url: co.url, ref, checkout: co.id, amount: price, currency: CURRENCY });
  } catch (e) {
    return res.status(200).json({ outcome: 'error', why: String(e.message || e) });
  }
}
