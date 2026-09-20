// Списание одной сказки. Приложение зовёт это до того, как начнёт собирать.
// Проверка живёт на сервере, а не в браузере: иначе счётчик правится из консоли.
//
//   POST /api/spend {device}  ->  {ok:true, ...}      можно собирать, списали
//                             ->  {ok:false, why}     показать тарифы

import { cors } from './providers.js';
import { loadUser, saveUser, canMake, publicView } from './store.js';
import { FREE_STORIES } from './plans.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { device } = req.body || {};
    if (!device) return res.status(400).json({ error: 'нет ключа устройства' });

    const u = await loadUser(device);
    const c = canMake(u, FREE_STORIES);
    if (!c.ok) {
      return res.status(200).json({ ok: false, why: c.reason, ...publicView(u, FREE_STORIES) });
    }

    u.made += 1;
    if (c.reason === 'quota') u.stories -= 1;
    await saveUser(u);

    return res.status(200).json({ ok: true, why: c.reason, ...publicView(u, FREE_STORIES) });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
