// Лист персонажа: рисуется один раз перед кадрами и идёт референсом в каждый
// из них, чтобы герой не менял внешность от картинки к картинке.
//
//   POST /api/hero {cast}   cast — короткое описание внешности героя (строка)
import { cors, generateImage } from '../lib/providers.js';
import { buildCastSheetPrompt } from '../lib/prompts.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { cast } = req.body || {};
    if (!cast || !String(cast).trim()) return res.status(400).json({ error: 'нет описания героя' });
    const sheet = await generateImage(buildCastSheetPrompt(String(cast).trim().slice(0, 600)));
    return res.status(200).json({ look: String(cast).trim(), sheet });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
