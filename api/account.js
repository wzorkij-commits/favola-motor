// Полка и оплаченное. Регистрации нет: браузер приносит свой ключ устройства.
//
//   GET  /api/account?device=...              — что у человека есть
//   POST /api/account {device, shelf}         — сохранить полку
//   POST /api/account {device, email}         — подтянуть полку с других устройств
//                                               (только для уже вошедшей почты)

import { cors } from '../lib/providers.js';
import { loadUser, saveUser, publicView, linkIdentity, emailKey, STORE_READY } from '../lib/store.js';
import { FREE_STORIES } from '../lib/plans.js';
import { GOOGLE_READY, clientId } from '../lib/google.js';
import { asked } from '../lib/route.js';
import forget from '../lib/h-forget.js';
import spend from '../lib/h-spend.js';

const okId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
const okMail = m => typeof m === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m.trim());

export default async function handler(req, res) {
  // /api/spend и /api/forget живут здесь же
  const r = asked(req);
  if (r === 'spend')  return spend(req, res);
  if (r === 'forget') return forget(req, res);

  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const device = req.method === 'GET'
      ? (req.query && req.query.device)
      : (req.body && req.body.device);

    if (!okId(device)) return res.status(400).json({ error: 'нет ключа устройства' });

    let u = await loadUser(device);

    if (req.method === 'POST') {
      const { shelf, email } = req.body || {};

      if (Array.isArray(shelf)) {
        // Полка — это список id сказок. Складываем, а не заменяем:
        // на другом устройстве могли прочитать что-то ещё.
        u.shelf = [...new Set([...u.shelf, ...shelf.filter(x => typeof x === 'string').slice(0, 500)])];
      }

      if (email !== undefined) {
        if (!okMail(email)) return res.status(400).json({ error: 'почта не похожа на почту' });
        const mail = email.trim().toLowerCase();
        // Склеивать устройства по почте можно только после входа: иначе любой
        // мог бы написать чужую почту и забрать чужую оплату. Вход (Google или
        // код из письма) уже запомнил подтверждённую почту в u.email.
        if (u.email !== mail) {
          return res.status(403).json({ error: 'сначала войдите по этой почте' });
        }
        await linkIdentity(u, emailKey(mail));
      }

      await saveUser(u);
    }

    return res.status(200).json({
      ...publicView(u, FREE_STORIES),
      googleВключён: GOOGLE_READY(),
      googleClientId: clientId(),
      постоянное_хранилище: STORE_READY
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
