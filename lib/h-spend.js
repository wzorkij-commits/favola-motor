// Списание одной сказки. Приложение зовёт это до того, как начнёт собирать.
// Проверка живёт на сервере, а не в браузере: иначе счётчик правится из консоли.
//
//   POST /api/spend {device}               ->  {ok:true, ...}      можно собирать, списали
//   POST /api/spend {device, kind:'record'} ->  то же для сказки из записи голоса
//                                           ->  {ok:false, why}     показать тарифы
//
// Сказка из записи бесплатна только как самая первая сказка аккаунта (RECORD_FREE):
// она дороже в производстве. Дальше её собирает только оплаченный доступ.

import { cors } from './providers.js';
import { loadUser, saveUser, canMake, canMakeRecord, publicView } from './store.js';
import { FREE_STORIES, RECORD_FREE } from './plans.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { device, kind } = req.body || {};
    if (!device) return res.status(400).json({ error: 'нет ключа устройства' });

    const u = await loadUser(device);
    const c = kind === 'record' ? canMakeRecord(u, FREE_STORIES, RECORD_FREE) : canMake(u, FREE_STORIES);
    if (!c.ok) {
      return res.status(200).json({ ...publicView(u, FREE_STORIES, RECORD_FREE), ok: false, why: c.reason });
    }

    u.made += 1;
    if (c.reason === 'quota') u.stories -= 1;
    await saveUser(u);

    return res.status(200).json({ ...publicView(u, FREE_STORIES, RECORD_FREE), ok: true, why: c.reason });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
