// Вход через Google.
//
//   POST /api/auth {device, credential}   — пропуск от Google
//   POST /api/auth {device, signout:true} — отвязать это устройство
//
// Пропуск проверяется подписью. Дальше устройство привязывается к аккаунту
// Google, и полка с оплаченным подтягиваются со всех прежних устройств.

import { cors } from '../lib/providers.js';
import { loadUser, saveUser, publicView, linkIdentity, googleKey, emailKey, STORE_READY } from '../lib/store.js';
import { FREE_STORIES } from '../lib/plans.js';
import { verifyIdToken, GOOGLE_READY, clientId } from '../lib/google.js';
import { asked } from '../lib/route.js';
import { grantOwner } from '../lib/owner.js';
import otp from '../lib/h-otp.js';

export default async function handler(req, res) {
  // /api/otp живёт здесь же: считаем функции, их не больше двенадцати
  if (asked(req) === 'otp') return otp(req, res);

  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Браузеру нужно знать, показывать ли кнопку вообще.
  if (req.method === 'GET') {
    return res.status(200).json({ enabled: GOOGLE_READY(), clientId: clientId(), версия: 'вход-2026-09-19-в' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { device, credential, signout } = req.body || {};
    if (!device) return res.status(400).json({ error: 'нет ключа устройства' });

    const u = await loadUser(device);

    if (signout) {
      // Аккаунт и его полка остаются на сервере, отвязывается только устройство.
      u.google = null; u.name = null; u.email = null;
      // Безлимит владельца привязан ко входу: вышел, и устройство снова обычное.
      // Войдёт заново, и безлимит вернётся сам.
      if (u.owner) { u.owner = false; u.plan = null; u.stories = 0; u.until = 0; }
      await saveUser(u);
      return res.status(200).json({ ...publicView(u, FREE_STORIES), вошёл: false });
    }

    if (!GOOGLE_READY()) {
      return res.status(200).json({ outcome: 'not-configured',
        why: 'Вход через Google не подключён: в Vercel не задан GOOGLE_CLIENT_ID.' });
    }

    let who;
    try { who = await verifyIdToken(credential); }
    catch (e) { return res.status(401).json({ error: String(e.message || e) }); }

    u.google = who.sub;
    u.name = who.name;
    // Почта считается почтой человека только если Google её подтвердил.
    if (who.email && who.emailVerified) u.email = who.email;

    await linkIdentity(u, googleKey(who.sub));
    if (who.email && who.emailVerified) {
      await linkIdentity(u, emailKey(who.email));
      grantOwner(u, who.email);
    }
    await saveUser(u);

    return res.status(200).json({
      ...publicView(u, FREE_STORIES),
      вошёл: true,
      постоянное_хранилище: STORE_READY
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
