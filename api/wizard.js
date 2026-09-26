// Опция «Придумать вместе»: конструктор из восьми наводящих вопросов
// собирает сказку. Иллюстрации потом рисует общий /api/image, озвучка —
// общий /api/voice (машинный голос, своей записи здесь нет).
//
//   POST /api/wizard {answers:[8 строк], lang}
//     -> {title, panels:[...], cast, world, scenes:[{brief,shows}], questions}
import { cors, generateText, jsonFrom } from '../lib/providers.js';
import { WIZARD_SYSTEM, buildWizardPrompt } from '../lib/prompts.js';

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { answers, lang = 'ru' } = req.body || {};
    if (!Array.isArray(answers) || answers.length !== 8 || answers.some(a => !String(a || '').trim())) {
      return res.status(400).json({ error: 'нужны все восемь ответов' });
    }
    const clean = answers.map(a => clip(a, 300));

    let out = null, why = '';
    for (let attempt = 1; attempt <= 2 && !out; attempt++) {
      try {
        const raw = await generateText({
          system: WIZARD_SYSTEM, prompt: buildWizardPrompt(clean, lang),
          maxTokens: 3000, temperature: attempt === 1 ? 0.85 : 0.5
        });
        const j = jsonFrom(raw);
        const panels = Array.isArray(j.panels) ? j.panels.map(p => clip(p, 900)).filter(Boolean) : [];
        const scenes = Array.isArray(j.scenes) ? j.scenes : [];
        if (panels.length >= 3 && scenes.length >= 3) {
          out = {
            title: clip(j.title, 60) || clean[0],
            panels,
            cast: (Array.isArray(j.cast) ? j.cast : []).slice(0, 3)
              .map(c => ({ name: clip(c && c.name, 40), look: clip(c && c.look, 300) }))
              .filter(c => c.name && c.look),
            world: clip(j.world, 220),
            scenes: scenes.slice(0, 6).map(s => ({ brief: clip(s && s.brief, 400), shows: Array.isArray(s && s.shows) ? s.shows.slice(0, 6) : [] })),
            questions: (Array.isArray(j.questions) ? j.questions : []).slice(0, 3).map(q => clip(q, 200)).filter(Boolean)
          };
        } else why = 'в ответе меньше трёх частей';
      } catch (e) { why = String(e.message || e); }
    }

    // Сказка должна собираться всегда: если модель дважды не собрала историю,
    // складываем её сами прямо из восьми ответов — просто без литературной связки.
    if (!out) {
      const Q = lang === 'en'
        ? ['is called', 'is a', 'wants', 'is stopped by', 'is helped by', 'in', 'first tries', 'in the end']
        : ['зовут', 'это', 'хочет', 'мешает', 'помогает', 'происходит в', 'сначала пробует', 'в итоге'];
      out = {
        title: clean[0],
        panels: clean.map((a, i) => `${Q[i]}: ${a}`),
        cast: [{ name: clean[0], look: clean[1] }],
        world: clean[5],
        scenes: clean.map(a => ({ brief: `A picture-book illustration: ${a}`, shows: [] })),
        questions: lang === 'en'
          ? ['What do you think the hero felt?', 'What would you have done?', 'What happens next, do you think?']
          : ['Что, как ты думаешь, чувствовал герой?', 'А что бы сделал ты?', 'Как думаешь, что было дальше?'],
        source: 'fallback', why
      };
    }

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
