// Шаг 4. Одна дорожка. Клиент зовёт семь раз: шесть частей и вопросы.
// Style = 0 обязателен: это регулятор драматизма, и именно он решает судьбу
// реплик внутреннего критика. Сыгранные с чувством, они превращают дорожку
// в тот самый голос, от которого мы ребёнка отцепляем.

import { cors, generateVoice } from '../lib/providers.js';
import { VOICE_SETTINGS } from '../lib/prompts.js';
import { asked } from '../lib/route.js';
import { isRecordRoute, recordRoute } from '../lib/record.js';

export default async function handler(req, res) {
  // Три адреса записанной сказки (clean, transcribe, scenes) живут здесь же:
  // отдельные файлы заняли бы слоты функций, а их всего двенадцать.
  const route = asked(req);
  if (isRecordRoute(route)) return recordRoute(route, req, res);

  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { text, part, lang = 'ru' } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });

    const voiceId = lang === 'en'
      ? (process.env.ELEVENLABS_VOICE_EN || process.env.ELEVENLABS_VOICE_RU)
      : process.env.ELEVENLABS_VOICE_RU;
    if (!voiceId) return res.status(500).json({ error: 'voice id not configured' });

    const { audio, sync } = await generateVoice({ text, voiceId, settings: VOICE_SETTINGS });
    return res.status(200).json({ part, audio, sync });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e), part: req.body?.part });
  }
}
