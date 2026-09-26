// Выгрузить всё своё и удалить всё своё — из Radio. Аккаунт (почта, оплаченное)
// общий с Favola и здесь не трогается целиком: удаляются только сказки Radio
// и связь этого устройства с почтой/Google. Полное удаление аккаунта делается
// из Favola (там та же учётная запись видна целиком).
//
//   GET  /api/forget?device=...            — отдать сказки Radio на этом аккаунте
//   POST /api/forget {device, confirm:true} — стереть сказки Radio и их файлы
import { cors } from './providers.js';
import { get, set, loadUser, saveUser, publicView } from './store.js';
import { deleteFiles } from './blob.js';
import { FREE_STORIES, RECORD_FREE } from './plans.js';

const key = id => 'rad:story:' + id;

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
      for (const sid of (u.radio_made || [])) {
        const rec = await get(key(sid));
        if (rec) stories.push(rec);
      }
      return res.status(200).json({
        учётная_запись: publicView(u, FREE_STORIES, RECORD_FREE),
        сказки_radio: stories,
        собрано: new Date().toISOString()
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (!(req.body && req.body.confirm === true)) {
      return res.status(400).json({ error: 'нужно подтверждение' });
    }

    let files = 0, tales = 0;
    for (const sid of (u.radio_made || [])) {
      const rec = await get(key(sid));
      if (!rec) continue;
      const urls = [...(rec.art || []).filter(Boolean), ...Object.values(rec.audio || {})];
      files += urls.length;
      await deleteFiles(urls);
      await set(key(sid), null);
      tales++;
    }
    u.radio_made = [];
    await saveUser(u);

    return res.status(200).json({ ok: true, удалено_сказок: tales, удалено_файлов: files });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
