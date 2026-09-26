// Одна иллюстрация сцены. Используется всеми тремя опциями: у записи и
// у конструктора сцены со своим «cast» (кто в кадре), у библиотеки — заранее
// нарисованный набор (см. data/library.js), сюда не попадает.
//
//   POST /api/image {brief, cast, heroRef, world, shows, fix, panel}
import { cors, generateImage } from '../lib/providers.js';
import { buildSceneImagePrompt } from '../lib/prompts.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { brief, cast, heroRef, world, shows, fix, panel } = req.body || {};
    if (!brief) return res.status(400).json({ error: 'brief required' });
    const refs = heroRef ? [heroRef] : [];
    const prompt = buildSceneImagePrompt(brief, cast, refs.length > 0, { world, shows, fix });
    const dataUrl = await generateImage(prompt, refs);
    return res.status(200).json({ panel, image: dataUrl });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e), panel: req.body?.panel, step: 'image' });
  }
}
