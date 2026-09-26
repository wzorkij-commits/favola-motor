// Озвучка машинным голосом. Нужна двум опциям, у которых нет собственной
// записи родителя: «Прочитать сказку» (если решили не записывать чтение
// самостоятельно) и «Придумать вместе». У «Записать сказку» звук — это
// голос самого человека, сюда он не попадает.
//
//   POST /api/voice {text, lang}
import { cors, generateVoice } from '../lib/providers.js';
import { VOICE_SETTINGS } from '../lib/prompts.js';

export default async function handler(req, res) {
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
