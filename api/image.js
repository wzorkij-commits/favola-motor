// Шаг 3. Одна иллюстрация. Клиент зовёт шесть раз, можно параллельно.
// Ночные версии не рисуются: приложение делает их программно из светлой бумаги.
//
// Второй адрес живёт здесь же (метка __r, см. lib/route.js):
//   POST /api/imgcheck {image, text, shows} -> {ok, score, missing, ...}
// Он сверяет готовую картинку записанной сказки со словами рассказчика.

import { cors, generateImage } from '../lib/providers.js';
import { buildImagePrompt, buildSceneImagePrompt } from '../lib/prompts.js';
import { asked } from '../lib/route.js';
import { checkImage } from '../lib/imagecheck.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (asked(req) === 'imgcheck') return checkImage(req, res);

  try {
    const { brief, heroSheet, heroRef, panel, cast, world, shows, fix } = req.body || {};
    if (!brief) return res.status(400).json({ error: 'brief required' });
    const refs = heroRef ? [heroRef] : [];
    // Записанная своим голосом сказка присылает cast: облик действующих лиц из самого рассказа.
    const prompt = (typeof cast === 'string')
      ? buildSceneImagePrompt(brief, cast, refs.length > 0, { world, shows, fix })
      : buildImagePrompt(brief, heroSheet, refs.length > 0);
    const dataUrl = await generateImage(prompt, refs);
    return res.status(200).json({ panel, image: dataUrl });
  } catch (e) {
    // причина нужна целиком: иначе на экране видно только «кадр не вышел»
    return res.status(500).json({ error: String(e.message || e), panel: req.body?.panel, step: 'image' });
  }
}
