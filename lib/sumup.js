// SumUp: создаём платёж на сервере и потом сами проверяем, чем он кончился.
//
// Два факта, из-за которых всё устроено именно так:
//   1. Карту нельзя принимать своей формой. Поэтому берём размещённую
//      страницу SumUp и уводим человека туда.
//   2. У SumUp нет автопродления подписки. Каждое списание инициирует
//      продавец. Поэтому «месяц» и «год» — это разовые платежи, после
//      которых мы сами ведём срок и остаток сказок.
//
// Песочница: в личном кабинете SumUp заводится отдельный тестовый продавец,
// его ключ кладётся в те же переменные. Настоящие деньги там не ходят.

const API = 'https://api.sumup.com/v0.1';

const key = () => process.env.SUMUP_API_KEY;
export const SUMUP_READY = () => !!process.env.SUMUP_API_KEY;

async function sumup(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: {
      authorization: 'Bearer ' + key(),
      'content-type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch (e) { body = { raw: text }; }
  if (!r.ok) {
    const msg = body.message || body.error_message || text.slice(0, 200);
    throw new Error('SumUp ' + r.status + ': ' + msg);
  }
  return body;
}

/** Код продавца: берём из переменной, иначе спрашиваем у самого SumUp. */
let cachedMerchant = null;
export async function merchantCode() {
  if (process.env.SUMUP_MERCHANT_CODE) return process.env.SUMUP_MERCHANT_CODE;
  if (cachedMerchant) return cachedMerchant;
  const me = await sumup('/me');
  cachedMerchant = (me.merchant_profile && me.merchant_profile.merchant_code) || me.merchant_code;
  if (!cachedMerchant) throw new Error('не удалось узнать merchant_code — задайте SUMUP_MERCHANT_CODE');
  return cachedMerchant;
}

export async function createCheckout({ reference, amount, currency, description, redirectUrl, email }) {
  const body = {
    checkout_reference: reference,
    amount,
    currency,
    description,
    merchant_code: await merchantCode(),
    redirect_url: redirectUrl,
    hosted_checkout: { enabled: true }
  };
  if (email) body.customer_id = undefined;   // отдельного покупателя пока не заводим
  const out = await sumup('/checkouts', { method: 'POST', body: JSON.stringify(body) });
  const url = out.hosted_checkout_url || (out.hosted_checkout && out.hosted_checkout.url);
  if (!url) throw new Error('SumUp не вернул ссылку на оплату');
  return { id: out.id, url, status: out.status };
}

export async function readCheckout(id) {
  return sumup('/checkouts/' + encodeURIComponent(id));
}

export const isPaid = c => String(c && c.status).toUpperCase() === 'PAID';
