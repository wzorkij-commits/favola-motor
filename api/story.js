// Шаг 2. Черновик по досье случая и Библии Favola v2.
//
// Сказка пишется двумя половинами: части 1–3 (part "a"), потом части 4–5, вопросы
// и кадры (part "b"), которая видит первую половину целиком. Каждая половина
// укладывается в лимит времени функции с запасом, а целая сказка на грани.
// Без part пишется всё сразу: так работал прежний клиент.
//
// Здесь важно не «получилось / не получилось», а ПОЧЕМУ не получилось:
// обрубленный ответ, кривой JSON и не то число частей лечатся по-разному,
// и приложение должно уметь назвать причину вслух.

import { cors, generateTextEx, jsonFrom } from '../lib/providers.js';
import { findConstruct, OPEN_CONSTRUCT } from '../lib/data.js';
import { buildSystemPrompt, buildStoryPrompt } from '../lib/prompts.js';
import { allLessons, formatLessons } from '../lib/lessons.js';

const NEED = { a: 3, b: 2, all: 5 };

// Некоторые формы рассказа (письма, репортаж, реплики) заставляют модель вернуть часть не строкой,
// а списком или объектом. Собираем в текст, а не отбрасываем черновик.
const flat = (p) => Array.isArray(p) ? p.map(flat).filter(Boolean).join('\n\n')
  : (p && typeof p === 'object') ? Object.values(p).map(flat).filter(Boolean).join('\n\n')
  : String(p == null ? '' : p);

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { request, child = {}, constructId, lang = 'ru', dossier = null, part = 'all', first = null } = req.body || {};
    const construct = findConstruct(constructId) || (dossier ? OPEN_CONSTRUCT() : null);
    if (!construct) return res.status(400).json({ error: 'неизвестный конструкт: ' + constructId });
    if (!['a', 'b', 'all'].includes(part)) return res.status(400).json({ error: 'part: a, b или all' });
    if (part === 'b' && !(first && Array.isArray(first.panels) && first.panels.length === 3)) {
      return res.status(400).json({ error: 'для части b нужны три готовые части (first.panels)' });
    }

    // Уроки, выбранные на шаге досье, подставляются по id: та же выборка у писателя и редактора.
    const ids = (dossier && dossier.lessons) || [];
    const lessons = allLessons().filter(l => ids.includes(l.id));

    const r = await generateTextEx({
      system: buildSystemPrompt(lang),
      prompt: buildStoryPrompt({
        construct, request, child, lang,
        dossier, variety: dossier && dossier.variety,
        lessonsText: formatLessons(lessons), part, first
      }),
      temperature: 0.9,
      maxTokens: part === 'all' ? 9000 : 5000
    });

    if (r.stop === 'max_tokens') {
      return res.status(200).json({
        outcome: 'retry',
        why: 'модель не успела дописать ответ до конца (потолок ' + r.out + ' слов-кусочков)',
        stop: r.stop
      });
    }

    let draft;
    try {
      draft = jsonFrom(r.text);
    } catch (e) {
      return res.status(200).json({
        outcome: 'retry',
        why: String(e.message),
        stop: r.stop,
        head: r.text.slice(0, 400)
      });
    }

    if (Array.isArray(draft.panels)) draft.panels = draft.panels.map(flat);
    if (Array.isArray(draft.questions)) draft.questions = draft.questions.map(flat).filter(q => q.trim());
    else if (typeof draft.questions === 'string') draft.questions = draft.questions.split(/\n+/).map(q => q.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    if (draft.hero && typeof draft.hero !== 'string') draft.hero = flat(draft.hero);

    // Иногда модель пишет и шестую часть, хотя её просили не писать:
    // она приходит из клинической библиотеки. Лишнее просто отрезаем.
    const need = NEED[part];
    if (Array.isArray(draft.panels) && draft.panels.length > need) draft.panels = draft.panels.slice(0, need);

    if (!Array.isArray(draft.panels) || draft.panels.length !== need) {
      return res.status(200).json({
        outcome: 'retry',
        why: 'в черновике ' + (Array.isArray(draft.panels) ? draft.panels.length : 'ноль') +
             ' частей вместо ' + need,
        stop: r.stop
      });
    }

    const empty = draft.panels.findIndex(p => !p || String(p).trim().length < 80);
    if (empty >= 0) {
      return res.status(200).json({
        outcome: 'retry',
        why: 'часть ' + (empty + 1 + (part === 'b' ? 3 : 0)) + ' пустая или в две строки',
        stop: r.stop
      });
    }

    // Мелочи, из-за которых раньше выбрасывался целый черновик, теперь чинятся на месте:
    // нет героя (берём первое имя из выбора редактора), меньше трёх вопросов (редактор дополнит).
    if (part === 'a' && !draft.hero) {
      const names = dossier && dossier.variety && dossier.variety.names;
      draft.hero = (child && child.heroName) || (names && names[0]) || (lang === 'en' ? 'Kit' : 'Гоша');
    }
    if (part === 'b' && !Array.isArray(draft.questions)) draft.questions = [];

    return res.status(200).json({ outcome: 'ok', part, draft });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
