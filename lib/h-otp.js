// Вход по коду на почту. Для тех, у кого нет Google.
//
//   POST /api/otp {device, email}        — прислать код
//   POST /api/otp {device, email, code}  — проверить и войти
//
// Код живёт пятнадцать минут, попыток пять. И то и другое считается
// на сервере: перебор шестизначного кода иначе занимает минуты.

import { cors } from './providers.js';
import { get, set, loadUser, saveUser, publicView, linkIdentity, emailKey } from './store.js';
import { FREE_STORIES } from './plans.js';
import { send, codeLetter, MAIL_READY } from './mail.js';
import { grantOwner } from './owner.js';

const okMail = m => typeof m === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m.trim());
const codeKey = mail => 'fav:otp:' + mail;
const LIFE = 15 * 60 * 1000;
const TRIES = 5;

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ enabled: MAIL_READY() });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { device, email, code, lang } = req.body || {};
    if (!device) return res.status(400).json({ error: 'нет ключа устройства' });
    if (!okMail(email)) return res.status(400).json({ error: 'почта не похожа на почту' });
    if (!MAIL_READY()) {
      return res.status(200).json({ outcome: 'not-configured',
        why: 'Вход по почте не подключён: в Vercel не задан RESEND_API_KEY.' });
    }
    const mail = email.trim().toLowerCase();

    // ── шаг 1: прислать код ──
    if (!code) {
      const digits = String(Math.floor(100000 + Math.random() * 900000));
      await set(codeKey(mail), { code: digits, until: Date.now() + LIFE, left: TRIES, device });
      const letter = codeLetter(digits, lang);
      try { await send({ to: mail, ...letter }); }
      catch (e) { return res.status(200).json({ outcome: 'error', why: String(e.message || e) }); }
      return res.status(200).json({ outcome: 'sent', minutes: 15 });
    }

    // ── шаг 2: проверить ──
    const saved = await get(codeKey(mail));
    if (!saved) return res.status(200).json({ outcome: 'expired', why: 'код устарел, попросите новый' });
    if (saved.until < Date.now()) {
      await set(codeKey(mail), null);
      return res.status(200).json({ outcome: 'expired', why: 'код устарел, попросите новый' });
    }
    if (saved.left <= 0) return res.status(200).json({ outcome: 'expired', why: 'слишком много попыток' });

    if (String(code).trim() !== saved.code) {
      saved.left -= 1;
      await set(codeKey(mail), saved);
      return res.status(200).json({ outcome: 'wrong', left: saved.left });
    }

    await set(codeKey(mail), null);

    const u = await loadUser(device);
    u.email = mail;
    if (!u.name) u.name = mail.split('@')[0];
    await linkIdentity(u, emailKey(mail));
    grantOwner(u, mail);
    await saveUser(u);

    return res.status(200).json({ outcome: 'ok', ...publicView(u, FREE_STORIES), вошёл: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
