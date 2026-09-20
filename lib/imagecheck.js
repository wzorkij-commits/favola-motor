// Проверка картинки записанной сказки: есть ли на ней то, что сказал рассказчик.
// Модель смотрит на картинку и отвечает по каждому обязательному элементу.
// Решение «годится / перерисовать» принимает код, а не модель.

import { judgeImage, jsonFrom } from './providers.js';
import { IMAGE_JUDGE_SYSTEM, buildImageJudgePrompt } from './prompts.js';

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/** Из ответа модели и списка ожидаемого делает решение. Чистая функция, её проверяют тесты. */
export function decide(verdict, shows) {
  const v = verdict && typeof verdict === 'object' ? verdict : {};
  const found = shows.map((_, i) => Array.isArray(v.found) ? v.found[i] === true : false);
  const missing = shows.filter((_, i) => !found[i]);
  const score = shows.length ? (shows.length - missing.length) / shows.length : 1;
  // Можно потерять не больше четверти: из трёх ничего, из четырёх и пяти одно.
  const allowed = Math.floor(shows.length / 4);
  const text_in_image = v.text_in_image === true;
  const unsafe = v.unsafe === true;
  const contradicts = v.contradicts === true;
  const fix = [...missing];
  if (text_in_image) fix.push('no text, letters or captions anywhere');
  if (unsafe) fix.push('a calm, gentle picture with nothing frightening');
  if (contradicts) fix.push(clip(v.note, 160) || 'follow the words exactly');
  return {
    ok: missing.length <= allowed && !text_in_image && !unsafe && !contradicts,
    score: Math.round(score * 100) / 100,
    found, missing, text_in_image, unsafe, contradicts,
    fix, note: clip(v.note, 200)
  };
}

export async function checkImage(req, res) {
  const { image, text, shows } = req.body || {};
  if (!image || typeof image !== 'string') return res.status(400).json({ error: 'нет картинки' });
  const list = (Array.isArray(shows) ? shows : []).map(x => clip(x, 80)).filter(Boolean).slice(0, 6);
  if (!list.length) return res.status(400).json({ error: 'нечего проверять: нет списка обязательного' });
  if (image.length > 3_500_000) return res.status(413).json({ error: 'картинка слишком большая для проверки' });
  try {
    const raw = await judgeImage({ image, system: IMAGE_JUDGE_SYSTEM, prompt: buildImageJudgePrompt(clip(text, 700), list) });
    return res.status(200).json(decide(jsonFrom(raw), list));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e), step: 'imgcheck' });
  }
}
