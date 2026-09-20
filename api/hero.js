// Шаг 3a. Лист персонажа. Делается один раз перед кадрами и дальше идёт
// референсом в каждый из шести — так же, как работает живой иллюстратор.
//
// Если в data/heroes.json есть утверждённый лист под пол и возраст, он берётся
// оттуда и ничего не генерируется. Свой утверждённый персонаж всегда лучше
// сгенерированного: он одинаков во всех историях, и полка выглядит как серия.

import { cors, generateImage } from '../lib/providers.js';
import { buildHeroSheetPrompt, buildCastSheetPrompt } from '../lib/prompts.js';
import { pickHero } from '../lib/data.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { constructId, gender, age, cast } = req.body || {};

    // Запись своей сказки: лист главного действующего лица из самого рассказа.
    if (typeof cast === 'string' && cast.trim()) {
      const sheet = await generateImage(buildCastSheetPrompt(cast.trim().slice(0, 600)));
      return res.status(200).json({ source: 'cast', look: cast.trim(), sheet });
    }

    const hero = pickHero(constructId, gender, age);
    const look = req.body?.look || hero.look;

    // 1. Утверждённый лист — берём готовым, ничего не генерируем.
    if (hero.approved && hero.image) {
      return res.status(200).json({
        source: 'approved', heroId: hero.id, look: hero.look, sheet: hero.image
      });
    }

    // 2. Иначе генерируем по описанию из грамматики и помечаем на утверждение.
    const sheet = await generateImage(buildHeroSheetPrompt(look));
    return res.status(200).json({
      source: 'generated', heroId: hero.id, look, sheet, needs_approval: true
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
