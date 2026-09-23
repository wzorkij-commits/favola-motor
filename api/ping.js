// Проверка живости. Открывается в браузере просто так, без приложения.
//
//   /api/ping            — какие ключи заданы, сколько конструктов загружено
//   /api/ping?test=voice — реально дёргает ElevenLabs одним словом и показывает ответ
//   /api/ping?test=image — реально рисует одну крошечную картинку
//   /api/ping?test=text  — реально просит модель ответить одним словом

import { CONSTRUCTS, PANEL6, HEROES, TOOLS } from '../lib/data.js';
import { allLessons } from '../lib/lessons.js';
import { generateVoice, generateImage, generateText, generateTextEx, jsonFrom } from '../lib/providers.js';
import { VOICE_SETTINGS, buildSystemPrompt, buildStoryPrompt } from '../lib/prompts.js';
import { STORE_READY, get, set } from '../lib/store.js';
import { SUMUP_READY, merchantCode } from '../lib/sumup.js';
import { PLANS } from '../lib/plans.js';

const NEED = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_RU'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const keys = {};
  for (const k of NEED) keys[k] = process.env[k] ? 'есть' : 'НЕ ЗАДАН';
  const ready = NEED.every(k => process.env[k]);

  const test = (req.query && req.query.test) || '';

  // --- живые проверки провайдеров ---
  if (test === 'voice') {
    const voiceId = process.env.ELEVENLABS_VOICE_RU;
    if (!voiceId) return res.status(200).json({ test: 'voice', ok: false, ошибка: 'ELEVENLABS_VOICE_RU не задан' });
    try {
      const { audio, sync } = await generateVoice({ text: 'Проверка.', voiceId, settings: VOICE_SETTINGS });
      return res.status(200).json({
        test: 'voice', ok: true,
        итог: 'ОЗВУЧКА РАБОТАЕТ',
        voice_id: voiceId,
        размер_записи_байт: Math.round(audio.length * 0.75),
        метки_слов: sync ? 'есть' : 'нет'
      });
    } catch (e) {
      return res.status(200).json({
        test: 'voice', ok: false,
        итог: 'ОЗВУЧКА НЕ РАБОТАЕТ',
        voice_id: voiceId,
        ответ_elevenlabs: String(e.message || e),
        подсказка: 'quota / 401 — кончились символы или ключ без прав на синтез. ' +
                   'voice_not_found — Voice ID не из вашей библиотеки: добавьте голос в My Voices.'
      });
    }
  }

  if (test === 'image') {
    try {
      const img = await generateImage('A single small grey pebble on cream paper, watercolour, no text.');
      return res.status(200).json({ test: 'image', ok: true, итог: 'КАРТИНКИ РАБОТАЮТ',
        размер_байт: Math.round(img.length * 0.75) });
    } catch (e) {
      return res.status(200).json({ test: 'image', ok: false, итог: 'КАРТИНКИ НЕ РАБОТАЮТ',
        ответ_google: String(e.message || e) });
    }
  }

  if (test === 'text') {
    try {
      const out = await generateText({
        system: 'Отвечай одним словом.', prompt: 'Скажи слово: готово', maxTokens: 20, temperature: 0
      });
      return res.status(200).json({ test: 'text', ok: true, итог: 'ТЕКСТ РАБОТАЕТ', ответ: out.trim() });
    } catch (e) {
      return res.status(200).json({ test: 'text', ok: false, итог: 'ТЕКСТ НЕ РАБОТАЕТ',
        ответ_anthropic: String(e.message || e) });
    }
  }

  // Полный черновик на живой модели: самый частый обрыв — здесь, и он
  // должен называть причину сам, без чтения журналов Vercel.
  if (test === 'story') {
    try {
      const construct = CONSTRUCTS.constructs[1];
      const r = await generateTextEx({
        system: buildSystemPrompt('ru'),
        prompt: buildStoryPrompt({
          construct,
          request: 'Она взяла браслет у подруги и не признаётся, ей девять',
          child: { name: 'Маша', age: 9 },
          lang: 'ru',
          part: 'a'
        }),
        temperature: 0.9,
        maxTokens: 5000
      });

      const info = {
        test: 'story',
        конструкт: construct.id,
        модель_остановилась: r.stop,
        слов_кусочков_на_выходе: r.out
      };

      if (r.stop === 'max_tokens') {
        return res.status(200).json({ ...info, ok: false, итог: 'ЧЕРНОВИК ОБРЕЗАН',
          подсказка: 'потолок ответа мал — поднимите maxTokens в api/story.js' });
      }
      let draft;
      try { draft = jsonFrom(r.text); }
      catch (e) {
        return res.status(200).json({ ...info, ok: false, итог: 'ЧЕРНОВИК НЕ РАЗБИРАЕТСЯ',
          ошибка: String(e.message), начало_ответа: r.text.slice(0, 300) });
      }
      const n = Array.isArray(draft.panels) ? draft.panels.length : 0; // первая половина: три части
      return res.status(200).json({
        ...info,
        ok: n >= 3,
        итог: n >= 3 ? 'ЧЕРНОВИК ПИШЕТСЯ' : 'ЧАСТЕЙ МЕНЬШЕ ТРЁХ',
        частей: n,
        название: draft.title,
        герой: draft.hero,
        длины_частей_в_знаках: (draft.panels || []).map(p => String(p).length)
      });
    } catch (e) {
      return res.status(200).json({ test: 'story', ok: false, итог: 'ЧЕРНОВИК НЕ ПИШЕТСЯ',
        ответ_anthropic: String(e.message || e) });
    }
  }

  // Хранилище: без него полка не переживает перезапуск, а оплата теряет хозяина.
  if (test === 'store') {
    if (!STORE_READY) {
      return res.status(200).json({ test: 'store', ok: false, итог: 'ХРАНИЛИЩА НЕТ',
        подсказка: 'Vercel -> Storage -> Upstash Redis. Без него полка живёт до перезапуска.' });
    }
    try {
      const probe = 'fav:selfcheck';
      const mark = Date.now();
      await set(probe, { mark });
      const back = await get(probe);
      const ok = back && back.mark === mark;
      return res.status(200).json({ test: 'store', ok,
        итог: ok ? 'ХРАНИЛИЩЕ РАБОТАЕТ' : 'ХРАНИЛИЩЕ ОТВЕЧАЕТ НЕ ТО' });
    } catch (e) {
      return res.status(200).json({ test: 'store', ok: false, итог: 'ХРАНИЛИЩЕ НЕ РАБОТАЕТ',
        ошибка: String(e.message || e) });
    }
  }

  // Оплата: спрашиваем у SumUp, кто мы. Платёж при этом не создаётся,
  // чтобы проверка не засоряла кабинет висящими счетами.
  if (test === 'pay') {
    if (!SUMUP_READY()) {
      return res.status(200).json({ test: 'pay', ok: false, итог: 'ОПЛАТА НЕ ПОДКЛЮЧЕНА',
        подсказка: 'Задайте SUMUP_API_KEY в Vercel. Для тестов заведите песочного продавца.' });
    }
    try {
      const code = await merchantCode();
      return res.status(200).json({ test: 'pay', ok: true, итог: 'ОПЛАТА ПОДКЛЮЧЕНА',
        продавец: code,
        тарифы: Object.values(PLANS).map(p => p.title.ru + ' · ' + p.price + ' EUR') });
    } catch (e) {
      return res.status(200).json({ test: 'pay', ok: false, итог: 'SUMUP НЕ ОТВЕЧАЕТ',
        ошибка: String(e.message || e) });
    }
  }

  // --- обычный ping ---
  res.status(200).json({
    status: ready ? 'ГОТОВО — можно собирать сказки' : 'НЕ ХВАТАЕТ КЛЮЧЕЙ',
    keys,
    constructs: CONSTRUCTS.constructs.length,
    инструментов_в_библиотеке: (TOOLS.tools || []).length,
    уроков_в_библиотеке: allLessons().length,
    panel6_texts: PANEL6.entries.length,
    heroes: HEROES.heroes.length,
    живые_проверки: {
      текст: '/api/ping?test=text',
      картинки: '/api/ping?test=image',
      озвучка: '/api/ping?test=voice',
      черновик_сказки: '/api/ping?test=story',
      хранилище: '/api/ping?test=store',
      оплата: '/api/ping?test=pay'
    },
    hint: ready ? 'Чтобы проверить каждый шаг по-настоящему, откройте адреса выше.'
                : 'Settings -> Environments -> Production, добавьте недостающие, потом Deployments -> ... -> Redeploy.'
  });
}
