// Свои сказки Radio: сохранение, список, чтение, удаление. Отдельные ключи
// от сказок Favola (rad:story: вместо fav:story:), но один и тот же аккаунт.
//
//   POST /api/stories {device, act:"start", story}          — завести сказку
//   POST /api/stories {device, act:"asset", id, name, data} — положить файл
//   POST /api/stories {device, act:"done", id}               — закрыть
//   POST /api/stories {device, act:"delete", id}             — удалить
//   GET  /api/stories?device=...                             — список описей
//   GET  /api/stories?device=...&id=...                      — сказка целиком
import { cors } from '../lib/providers.js';
import { get, set, loadUser, saveUser } from '../lib/store.js';
import { putFile, deleteFiles, fromDataUrl, BLOB_READY } from '../lib/blob.js';

const key = id => 'rad:story:' + id;
const MAX_PER_USER = 200;

const mine = (rec, device, u) =>
  rec && (rec.device === device || (u.google && rec.google === u.google) ||
          (u.email && rec.email === u.email));

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const device = req.query && req.query.device;
      const id = req.query && req.query.id;
      if (!device) return res.status(400).json({ error: 'нет ключа устройства' });
      const u = await loadUser(device);

      if (id) {
        const rec = await get(key(id));
        if (!mine(rec, device, u)) return res.status(404).json({ error: 'не найдено' });
        return res.status(200).json(rec);
      }

      const list = [];
      for (const sid of (u.radio_made || []).slice(-MAX_PER_USER).reverse()) {
        const rec = await get(key(sid));
        if (!rec) continue;
        list.push({ id: rec.id, title: rec.title, kind: rec.kind, lang: rec.lang,
                    at: rec.at, cover: (rec.art || [])[0] || null, done: !!rec.done });
      }
      return res.status(200).json({ stories: list, файловое_хранилище: BLOB_READY() });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { device, act, id, name, data, story } = req.body || {};
    if (!device) return res.status(400).json({ error: 'нет ключа устройства' });
    const u = await loadUser(device);

    if (act === 'start') {
      if (!story || !Array.isArray(story.panels)) return res.status(400).json({ error: 'нет сказки' });
      const sid = 'rd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const rec = {
        id: sid, device, google: u.google || null, email: u.email || null,
        at: Date.now(), done: false,
        // kind: 'record' | 'library' | 'wizard' — откуда взялась сказка, для полки
        kind: story.kind || 'wizard',
        title: story.title || '', lang: story.lang || 'ru',
        panels: story.panels, questions: story.questions || [],
        // audio.url — уже готовая ссылка на файл (чистка звука сама кладёт его в хранилище
        // при записи); timeline — на какой секунде начинается/кончается каждая страница.
        meta: story.meta || (story.audio && story.audio.timeline ? { audioTimeline: story.audio.timeline } : null),
        art: [], audio: (story.audio && story.audio.url) ? { voice: story.audio.url } : {}
      };
      await set(key(sid), rec);
      u.radio_made = [...(u.radio_made || []), sid].slice(-MAX_PER_USER);
      await saveUser(u);
      return res.status(200).json({ id: sid, файловое_хранилище: BLOB_READY() });
    }

    if (act === 'asset') {
      const rec = await get(key(id));
      if (!mine(rec, device, u)) return res.status(404).json({ error: 'не найдено' });
      if (!BLOB_READY()) return res.status(200).json({ outcome: 'no-storage' });
      let file;
      try { file = fromDataUrl(data); }
      catch (e) { return res.status(400).json({ error: String(e.message) }); }

      const url = await putFile(`radio-stories/${id}/${name}.${file.ext}`, file.buffer, file.type);
      if (/^panel-\d+$/.test(name) && file.type.startsWith('image/')) {
        const n = parseInt(name.split('-')[1], 10) - 1;
        rec.art[n] = url;
      } else {
        rec.audio[name] = url;
      }
      await set(key(id), rec);
      return res.status(200).json({ url });
    }

    if (act === 'done') {
      const rec = await get(key(id));
      if (!mine(rec, device, u)) return res.status(404).json({ error: 'не найдено' });
      rec.done = true;
      await set(key(id), rec);
      return res.status(200).json({ ok: true, id });
    }

    if (act === 'delete') {
      const rec = await get(key(id));
      if (!mine(rec, device, u)) return res.status(404).json({ error: 'не найдено' });
      await deleteFiles([...(rec.art || []).filter(Boolean), ...Object.values(rec.audio || {})]);
      await set(key(id), null);
      u.radio_made = (u.radio_made || []).filter(x => x !== id);
      await saveUser(u);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'неизвестное действие: ' + act });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
