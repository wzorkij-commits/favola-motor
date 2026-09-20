// Выгрузить всё своё и удалить всё своё.
//
//   GET  /api/forget?device=...            — отдать всё, что о человеке известно
//   POST /api/forget {device, confirm:true} — стереть: сказки, файлы, учётную запись
//
// Кнопка «удалить всё» должна существовать с первого дня, а не появляться
// тогда, когда её потребуют. Стоит она полчаса, а без неё удалять нечем.

import { cors } from './providers.js';
import { get, set, loadUser, userKey, emailKey, googleKey } from './store.js';
import { deleteFiles } from './blob.js';
import { FREE_STORIES } from './plans.js';
import { publicView } from './store.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const device = req.method === 'GET' ? (req.query && req.query.device)
                                        : (req.body && req.body.device);
    if (!device) return res.status(400).json({ error: 'нет ключа устройства' });
    const u = await loadUser(device);

    if (req.method === 'GET') {
      const stories = [];
      for (const sid of (u.stories_made || [])) {
        const rec = await get('fav:story:' + sid);
        if (rec) stories.push(rec);
      }
      return res.status(200).json({
        учётная_запись: publicView(u, FREE_STORIES),
        платежи: u.payments || [],
        сказки: stories,
        собрано: new Date().toISOString()
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (!(req.body && req.body.confirm === true)) {
      return res.status(400).json({ error: 'нужно подтверждение' });
    }

    let files = 0, tales = 0;
    for (const sid of (u.stories_made || [])) {
      const rec = await get('fav:story:' + sid);
      if (!rec) continue;
      const urls = [...(rec.art || []).filter(Boolean), ...Object.values(rec.audio || {})];
      files += urls.length;
      await deleteFiles(urls);
      await set('fav:story:' + sid, null);
      tales++;
    }

    // Связки по почте и Google тоже чистим: иначе устройство вернётся по ним.
    if (u.email)  { const k = emailKey(u.email);
                    const l = await get(k);
                    if (l) await set(k, { devices: (l.devices || []).filter(d => d !== device) }); }
    if (u.google) { const k = googleKey(u.google);
                    const l = await get(k);
                    if (l) await set(k, { devices: (l.devices || []).filter(d => d !== device) }); }

    await set(userKey(device), null);

    return res.status(200).json({ ok: true, удалено_сказок: tales, удалено_файлов: files });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
