// Опция «Прочитать сказку»: готовые бесплатные тексты без прав, с телесуфлёром.
//
//   GET  /api/library?lang=ru                       — список сказок
//   GET  /api/library?id=ru-repka                    — сказка целиком: текст,
//        план картинок (переведён и придуман один раз, дальше из кэша),
//        и уже нарисованные картинки, если есть
//   POST /api/library {act:'illustrate', id, scene}  — нарисовать одну картинку
//        сцены и сохранить навсегда (кадр рисуется один раз на всех читателей)
//
// Библиотека общая на всех: очистки счётчика сказок это не касается —
// готовые тексты бесплатны и не кончаются, как и в основном приложении Favola.
import { cors, generateText, generateImage, jsonFrom } from '../lib/providers.js';
import { LIBRARY_SCENES_SYSTEM, buildLibraryScenesPrompt, buildCastSheetPrompt, buildSceneImagePrompt } from '../lib/prompts.js';
import { get, set } from '../lib/store.js';
import { putFile, BLOB_READY } from '../lib/blob.js';
import { libraryList, libraryOne } from '../data/library.js';

const planKey = id => 'rad:lib:' + id;

async function ensurePlan(story) {
  const cached = await get(planKey(story.id));
  if (cached) return cached;

  const paragraphs = story.text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  let plan;
  try {
    const raw = await generateText({
      system: LIBRARY_SCENES_SYSTEM,
      prompt: buildLibraryScenesPrompt(paragraphs, story.lang),
      maxTokens: 3000, temperature: 0.4
    });
    const j = jsonFrom(raw);
    if (Array.isArray(j.scenes) && j.scenes.length === paragraphs.length) {
      plan = {
        world: String(j.world || ''),
        cast: (Array.isArray(j.cast) ? j.cast : []).slice(0, 3)
          .map(c => ({ name: String(c.name || ''), look: String(c.look || '') }))
          .filter(c => c.name && c.look),
        scenes: paragraphs.map((p, i) => ({
          text: p,
          brief: String((j.scenes[i] && j.scenes[i].brief) || '').slice(0, 400) || `A picture-book illustration for this part of "${story.title}".`,
          shows: Array.isArray(j.scenes[i] && j.scenes[i].shows) ? j.scenes[i].shows.slice(0, 6) : [],
          image: null
        })),
        heroSheet: null
      };
    }
  } catch (e) { /* ниже — запасной план без AI */ }

  if (!plan) {
    plan = {
      world: '', cast: [], heroSheet: null,
      scenes: paragraphs.map(p => ({
        text: p,
        brief: `A picture-book illustration for this part of the story "${story.title}": ${p.slice(0, 200)}`,
        shows: [], image: null
      }))
    };
  }

  await set(planKey(story.id), plan);
  return plan;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { id, lang } = req.query || {};
      if (!id) return res.status(200).json({ stories: libraryList(lang) });

      const story = libraryOne(id);
      if (!story) return res.status(404).json({ error: 'сказка не найдена' });
      const plan = await ensurePlan(story);
      return res.status(200).json({
        id: story.id, lang: story.lang, title: story.title, source: story.source,
        estMinutes: story.estMinutes, text: story.text,
        world: plan.world, cast: plan.cast, heroSheet: plan.heroSheet,
        scenes: plan.scenes.map(s => ({ text: s.text, image: s.image }))
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { act, id, scene } = req.body || {};
    if (act !== 'illustrate') return res.status(400).json({ error: 'неизвестное действие' });

    const story = libraryOne(id);
    if (!story) return res.status(404).json({ error: 'сказка не найдена' });
    const plan = await ensurePlan(story);
    const n = Number(scene);
    if (!Number.isInteger(n) || n < 0 || n >= plan.scenes.length) return res.status(400).json({ error: 'нет такой сцены' });

    if (plan.scenes[n].image) return res.status(200).json({ image: plan.scenes[n].image, cached: true });

    // Лист героя рисуем один раз на всю сказку, если есть постоянные персонажи.
    if (!plan.heroSheet && plan.cast.length) {
      try {
        plan.heroSheet = await generateImage(buildCastSheetPrompt(plan.cast.map(c => `${c.name}: ${c.look}`).join('; ')));
      } catch (e) { /* без референса тоже можно рисовать, просто герой может немного плыть */ }
    }

    const castText = plan.cast.map(c => `${c.name}: ${c.look}`).join(' | ');
    const prompt = buildSceneImagePrompt(plan.scenes[n].brief, castText, !!plan.heroSheet, { world: plan.world, shows: plan.scenes[n].shows });
    const dataUrl = await generateImage(prompt, plan.heroSheet ? [plan.heroSheet] : []);

    let finalUrl = dataUrl;
    if (BLOB_READY()) {
      try {
        const m = /^data:([^;]+);base64,/.exec(dataUrl);
        const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
        finalUrl = await putFile(`library/${id}/scene-${n}.jpg`, buf, (m && m[1]) || 'image/jpeg');
      } catch (e) { /* не сохранилось в хранилище — вернём как есть, просто не кэшируется */ }
    }

    plan.scenes[n].image = finalUrl;
    await set(planKey(id), plan);
    return res.status(200).json({ image: finalUrl, cached: false });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
