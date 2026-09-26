// Проверка живости. Открывается в браузере просто так, без приложения.
//   /api/ping             — какие ключи заданы
//   /api/ping?test=voice  — реально дёргает ElevenLabs одним словом
//   /api/ping?test=image  — реально рисует одну крошечную картинку
//   /api/ping?test=text   — реально просит модель ответить одним словом
//   /api/ping?test=store  — проверка общего с Favola хранилища
//   /api/ping?test=pay    — проверка SumUp
import { generateVoice, generateImage, generateText } from '../lib/providers.js';
import { VOICE_SETTINGS } from '../lib/prompts.js';
import { STORE_READY, get, set } from '../lib/store.js';
import { SUMUP_READY, merchantCode } from '../lib/sumup.js';
import { PLANS } from '../lib/plans.js';
import { LIBRARY } from '../data/library.js';

const NEED = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_RU'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const keys = {};
  for (const k of NEED) keys[k] = process.env[k] ? 'есть' : 'НЕ ЗАДАН';
  const ready = NEED.every(k => process.env[k]);
  const test = (req.query && req.query.test) || '';

  if (test === 'voice') {
    const voiceId = process.env.ELEVENLABS_VOICE_RU;
    try {
      const { audio } = await generateVoice({ text: 'Проверка.', voiceId, settings: VOICE_SETTINGS });
      return res.status(200).json({ test: 'voice', ok: true, итог: 'ОЗВУЧКА РАБОТАЕТ', размер_байт: Math.round(audio.length * 0.75) });
    } catch (e) {
      return res.status(200).json({ test: 'voice', ok: false, итог: 'ОЗВУЧКА НЕ РАБОТАЕТ', ошибка: String(e.message || e) });
    }
  }
  if (test === 'image') {
    try {
      const img = await generateImage('A single small grey pebble on cream paper, watercolour, no text.');
      return res.status(200).json({ test: 'image', ok: true, итог: 'КАРТИНКИ РАБОТАЮТ', размер_байт: Math.round(img.length * 0.75) });
    } catch (e) {
      return res.status(200).json({ test: 'image', ok: false, итог: 'КАРТИНКИ НЕ РАБОТАЮТ', ошибка: String(e.message || e) });
    }
  }
  if (test === 'text') {
    try {
      const out = await generateText({ system: 'Отвечай одним словом.', prompt: 'Скажи слово: готово', maxTokens: 20, temperature: 0 });
      return res.status(200).json({ test: 'text', ok: true, итог: 'ТЕКСТ РАБОТАЕТ', ответ: out.trim() });
    } catch (e) {
      return res.status(200).json({ test: 'text', ok: false, итог: 'ТЕКСТ НЕ РАБОТАЕТ', ошибка: String(e.message || e) });
    }
  }
  if (test === 'store') {
    if (!STORE_READY) return res.status(200).json({ test: 'store', ok: false, итог: 'ХРАНИЛИЩА НЕТ (проверьте, скопированы ли ключи Upstash из проекта Favola)' });
    try {
      const probe = 'fav:selfcheck'; const mark = Date.now();
      await set(probe, { mark }); const back = await get(probe);
      const ok = back && back.mark === mark;
      return res.status(200).json({ test: 'store', ok, итог: ok ? 'ХРАНИЛИЩЕ РАБОТАЕТ (то же, что у Favola)' : 'ХРАНИЛИЩЕ ОТВЕЧАЕТ НЕ ТО' });
    } catch (e) {
      return res.status(200).json({ test: 'store', ok: false, итог: 'ХРАНИЛИЩЕ НЕ РАБОТАЕТ', ошибка: String(e.message || e) });
    }
  }
  if (test === 'pay') {
    if (!SUMUP_READY()) return res.status(200).json({ test: 'pay', ok: false, итог: 'ОПЛАТА НЕ ПОДКЛЮЧЕНА' });
    try {
      const code = await merchantCode();
      return res.status(200).json({ test: 'pay', ok: true, итог: 'ОПЛАТА ПОДКЛЮЧЕНА', продавец: code,
        тарифы: Object.values(PLANS).map(p => p.title.ru + ' · ' + p.price + ' EUR') });
    } catch (e) {
      return res.status(200).json({ test: 'pay', ok: false, итог: 'SUMUP НЕ ОТВЕЧАЕТ', ошибка: String(e.message || e) });
    }
  }

  res.status(200).json({
    status: ready ? 'ГОТОВО' : 'НЕ ХВАТАЕТ КЛЮЧЕЙ',
    keys,
    библиотека_сказок: LIBRARY.length,
    живые_проверки: {
      текст: '/api/ping?test=text', картинки: '/api/ping?test=image', озвучка: '/api/ping?test=voice',
      хранилище: '/api/ping?test=store', оплата: '/api/ping?test=pay'
    },
    hint: ready ? 'Чтобы проверить каждый шаг по-настоящему, откройте адреса выше.'
                : 'Settings -> Environments -> Production, добавьте недостающие, потом Deployments -> ... -> Redeploy.'
  });
}
