// Шаг 2б. Редакторский проход. Черновик правится против свода норм целиком,
// потом вставляется шестая часть и результат идёт через все проверки.
// Провалил — приложение зовёт этот шаг ещё раз со списком замечаний.

import { cors, generateText, jsonFrom } from '../lib/providers.js';
import { findConstruct, pickPanel6, CLOSING } from '../lib/data.js';
import { buildPolishPrompt } from '../lib/prompts.js';
import { checkStory } from '../lib/guardrails.js';

// Запасные вопросы: подставляются, только если редактор вернул меньше трёх.
// Они общие нарочно — на них взрослый может ответить про себя всегда.
const SPARE_Q = {
  ru: ['А у тебя такое было?', 'Сколько тебе было тогда?', 'Что ты тогда сделал?'],
  en: ['Did that ever happen to you?', 'How old were you then?', 'What did you do about it?']
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { draft, constructId, topics = [], child = {}, lang = 'ru', dossier = null,
            attempt = 1, maxAttempts = 3, previousFailures = [] } = req.body || {};
    const last = attempt >= maxAttempts;   // на последнем заходе история собирается в любом случае
    const construct = findConstruct(constructId);
    if (!construct) return res.status(400).json({ error: 'неизвестный конструкт: ' + constructId });
    if (!draft || !Array.isArray(draft.panels)) return res.status(400).json({ error: 'нет черновика' });

    const p6 = pickPanel6(construct, topics, child.age);
    const panel6Text = p6[lang] || p6.ru;
    const closing = CLOSING[lang] || CLOSING.ru;

    const raw = await generateText({
      system: 'Ты редактор детской прозы. Отвечаешь только JSON, без пояснений.',
      prompt: buildPolishPrompt({ draft, construct, dossier, failures: previousFailures, lang }),
      temperature: 0.6,
      maxTokens: 4500
    });

    let edited = null;
    try { edited = jsonFrom(raw); }
    catch (e) {
      // Редактор не вернул JSON. Пока есть попытки — просим заново.
      // На последней берём черновик как есть: он уже прошёл свод норм при написании.
      if (!last) {
        return res.status(200).json({ outcome: 'retry', attempt,
          hard: [{ id: 'not-json', why: 'редактор не вернул JSON', detail: String(e.message) }] });
      }
      edited = {};
    }

    // Редактор возвращает только изменённые части (edits). Прежний формат, целые panels,
    // тоже принимается. Шестая часть сюда не приходит никогда.
    const base = draft.panels.slice(0, 5);
    let fiveParts = base.slice();
    if (edited.edits && typeof edited.edits === 'object') {
      for (const [k, v] of Object.entries(edited.edits)) {
        const i = parseInt(k, 10) - 1;
        if (i >= 0 && i < 5 && typeof v === 'string' && v.trim().length >= 80) fiveParts[i] = v.trim();
      }
    } else if (edited.panels && edited.panels.length >= 5) {
      fiveParts = edited.panels.slice(0, 5);
    }
    const panels = [...fiveParts, panel6Text + '\n\n' + closing];

    // Вопросов всегда ровно три — это структура, а не творчество,
    // и чинится здесь, а не переписыванием всей истории.
    const source = (edited.questions && edited.questions.length ? edited.questions : draft.questions) || [];
    const questions = source.filter(q => q && String(q).trim()).slice(0, 3);
    while (questions.length < 3) questions.push(SPARE_Q[lang === 'en' ? 'en' : 'ru'][questions.length]);

    const story = { panels, questions, lang };
    const check = checkStory(story, { construct, panel6Text, closing, hero: draft.hero, dossier });

    // Безопасность — стена: сюда попадают цифры про тело, способы самоповреждения
    // и обещание, что проблема исчезнет. Такую историю не показываем никогда.
    if (check.hard.length) {
      return res.status(200).json({ outcome: 'blocked', attempt,
        hard: check.hard, soft: check.soft });
    }
    // Ремесло — не стена. Пока есть попытки, просим переписать.
    if (check.craft.length && !last) {
      // Следующий заход редактора начинается с уже поправленного текста, а не с исходного черновика.
      return res.status(200).json({ outcome: 'retry', attempt,
        hard: check.craft, craft: check.craft, soft: check.soft,
        draft: { ...draft, panels: fiveParts, questions } });
    }

    return res.status(200).json({
      outcome: 'ok',
      attempts: attempt,
      story: {
        hero: draft.hero, title: draft.title, need: draft.need,
        plot: draft.plot, want: draft.want, symbol: draft.symbol,
        panels, questions,
        illustration_briefs: draft.illustration_briefs, lang
      },
      fixed: edited.fixed || [],
      flags: check.craft,                       // что осталось на вычитку человеком
      clean: check.clean,
      panel6: { id: p6.id, clinical_review: p6.clinical_review },
      construct: { id: construct.id, title: construct.title },
      check: check.report
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
