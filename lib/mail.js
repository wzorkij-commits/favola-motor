// Письма. Нужны ровно для двух вещей: код для входа и чек об оплате.
//
// Отправка через Resend: один ключ, один адрес, без почтового сервера.
// Пока домен не подтверждён, письма уходят с onboarding@resend.dev —
// для проверки годится, для рассылки настоящим людям стоит подтвердить свой.

const FROM = process.env.MAIL_FROM || 'Favola <onboarding@resend.dev>';

export const MAIL_READY = () => !!process.env.RESEND_API_KEY;

export async function send({ to, subject, html, text }) {
  if (!MAIL_READY()) throw new Error('почта не подключена: нет RESEND_API_KEY');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text })
  });
  const body = await r.text();
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + body.slice(0, 200));
  return JSON.parse(body);
}

const shell = (title, body) => `
<div style="font-family:Georgia,serif;background:#12132A;color:#F1EADB;padding:32px 24px">
  <div style="max-width:420px;margin:0 auto">
    <div style="font-size:19px;letter-spacing:.16em;color:#E9A93C;margin-bottom:22px">FAVOLA</div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 14px">${title}</h1>
    ${body}
  </div>
</div>`;

export function codeLetter(code, lang) {
  const ru = lang !== 'en';
  return {
    subject: ru ? 'Код для входа в Favola' : 'Your Favola sign-in code',
    text: (ru ? 'Код: ' : 'Code: ') + code,
    html: shell(
      ru ? 'Код для входа' : 'Your sign-in code',
      `<div style="font-family:ui-monospace,monospace;font-size:34px;letter-spacing:.22em;
                   color:#E9A93C;margin:18px 0">${code}</div>
       <p style="font-size:14px;line-height:1.55;color:#C9C2B6;margin:0">
         ${ru ? 'Код действует пятнадцать минут. Если вы его не запрашивали, просто удалите это письмо.'
              : 'The code is good for fifteen minutes. If you did not ask for it, just delete this email.'}
       </p>`)
  };
}

export function receiptLetter({ plan, amount, currency, stories, until }, lang) {
  const ru = lang !== 'en';
  const when = until ? new Date(until).toLocaleDateString(ru ? 'ru' : 'en-GB') : '';
  return {
    subject: ru ? 'Favola · оплата прошла' : 'Favola · payment received',
    text: (ru ? 'Оплачено: ' : 'Paid: ') + amount + ' ' + currency,
    html: shell(
      ru ? 'Оплата прошла' : 'Payment received',
      `<table style="width:100%;font-family:system-ui,sans-serif;font-size:14px;color:#C9C2B6">
         <tr><td style="padding:5px 0">${ru ? 'Тариф' : 'Plan'}</td>
             <td style="text-align:right;color:#F1EADB">${plan}</td></tr>
         <tr><td style="padding:5px 0">${ru ? 'Сумма' : 'Amount'}</td>
             <td style="text-align:right;color:#F1EADB">${amount} ${currency}</td></tr>
         ${stories === null ? '' :
         `<tr><td style="padding:5px 0">${ru ? 'Сказок доступно' : 'Stories available'}</td>
              <td style="text-align:right;color:#F1EADB">${stories}</td></tr>`}
         ${when ? `<tr><td style="padding:5px 0">${ru ? 'Доступ до' : 'Access until'}</td>
              <td style="text-align:right;color:#F1EADB">${when}</td></tr>` : ''}
       </table>
       <p style="font-size:13px;line-height:1.55;color:#8A8CA6;margin:18px 0 0">
         ${ru ? 'Это разовый платёж. Автопродления нет, деньги сами больше не спишутся.'
              : 'This was a one-off payment. There is no auto-renewal; nothing will be charged again.'}
       </p>`)
  };
}
