// Шаг 1. Что это за запрос, и можно ли на него вообще отвечать сказкой.
//
// Протокол раскрытия: если в запросе звучит насилие, принуждение или самоповреждение,
// приложение НЕ отвечает историей. Оно показывает другой экран — простые слова и
// настоящие телефоны доверия в стране семьи. Это правило детерминированное и стоит
// ПЕРЕД моделью: ни один запрос из этого списка до генерации не доходит.

import { cors, generateText, jsonFrom } from '../lib/providers.js';
import { CONSTRUCTS, TOOLS, OPEN_CONSTRUCT, pickConstruct } from '../lib/data.js';
import { buildDossierPrompt } from '../lib/prompts.js';
import { pickVariety } from '../lib/variety.js';
import { pickLessons } from '../lib/lessons.js';

const DISCLOSURE = [
  'бьёт', 'бьет', 'избил', 'ударил меня', 'насил', 'домогал', 'трогает', 'приставал',
  'угрожа', 'заставля', 'шантаж', 'запретил рассказывать', 'не разрешает говорить',
  'себя резал', 'себя режет', 'не хочет жить', 'покончить', 'суицид', 'самоубий',
  'голодает', 'не ест несколько дней', 'синяки', 'отчим бьёт', 'отец бьёт', 'мать бьёт',
  'beats', 'hits her', 'hits him', 'abuse', 'touched', 'threaten', 'forced',
  'self-harm', 'cutting', 'kill herself', 'kill himself', 'suicide', 'bruises'
];

const HELPLINES = {
  GB: [
    { name: 'NSPCC', detail: '0808 800 5000 — для взрослых, кто тревожится за ребёнка' },
    { name: 'Childline', detail: '0800 1111 — бесплатно, для самого ребёнка' },
    { name: 'Samaritans', detail: '116 123 — круглосуточно' }
  ],
  ES: [
    { name: 'ANAR', detail: '900 20 20 10 — ayuda a niños y adolescentes' },
    { name: 'Teléfono de la Esperanza', detail: '717 003 717' }
  ],
  DEFAULT: [
    { name: 'Child Helpline International', detail: 'childhelplineinternational.org — номер в вашей стране' }
  ]
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { request = '', child = {}, country = 'GB', recent = [] } = req.body || {};
    if (!request.trim()) return res.status(400).json({ error: 'empty request' });

    // Язык истории — язык, на котором написал родитель, а не язык интерфейса.
    const lang = /[а-яё]/i.test(request) ? 'ru' : 'en';

    // --- детерминированный протокол раскрытия, до всякой модели ---
    const low = request.toLowerCase();
    const flagged = DISCLOSURE.filter(w => low.includes(w));
    if (flagged.length) {
      return res.status(200).json({
        outcome: 'disclosure',
        matched: flagged,
        screen: {
          title: 'Это не для сказки на ночь.',
          body: 'То, что вы описали, важнее истории. Мы не станем отвечать на это сказкой. Ниже — люди, которые занимаются именно этим, и им можно позвонить сегодня.',
          helplines: HELPLINES[country] || HELPLINES.DEFAULT
        }
      });
    }

    // --- досье случая: модель читает запрос и заполняет карточку, выбор конструкта и
    //     шестой части остаётся за кодом ---
    const topicList = [...new Set([
      ...CONSTRUCTS.constructs.flatMap(c => c.topics),
      ...(TOOLS.tools || []).flatMap(t => t.fits)
    ])];
    const raw = await generateText({
      system: 'Ты редактор сказок и детский психолог. Отвечаешь только JSON, без пояснений.',
      temperature: 0.3,
      maxTokens: 2600,
      prompt: buildDossierPrompt({ request, child, lang, topicList })
    });

    const dossier = jsonFrom(raw);
    const age = child.age ?? dossier.age_guess ?? null;

    // Модель заметила то, что ключевые слова не ловят: дальше сказкой не отвечаем.
    if (dossier.safety === 'adult') {
      return res.status(200).json({
        outcome: 'disclosure',
        matched: [String(dossier.safety_why || '').slice(0, 200)],
        screen: {
          title: 'Это не для сказки на ночь.',
          body: 'То, что вы описали, важнее истории. Мы не станем отвечать на это сказкой. Ниже — люди, которые занимаются именно этим, и им можно позвонить сегодня.',
          helplines: HELPLINES[country] || HELPLINES.DEFAULT
        }
      });
    }

    // Готовый конструкт нужен только для запретов и шестой части.
    // Нет подходящего — берём открытый, сказка от этого не отказывается.
    const topics = Array.isArray(dossier.topics) ? dossier.topics : [];
    const construct = pickConstruct(topics, age) || OPEN_CONSTRUCT();

    // `recent` присылает браузер: рецепты последних сказок этого устройства. Их значения
    // выбираются реже, чтобы две сказки подряд не были похожи. Чужое и мусор отбрасываются.
    const variety = pickVariety({ age, lang, gender: dossier.child_gender || 'unknown',
      register: dossier.register, topics, recent });
    dossier.age = age;
    dossier.variety = variety;
    // Уроки выбираются тут же и едут вместе с досье: писатель и редактор видят одно и то же.
    dossier.lessons = pickLessons({ age, topics, n: 5 }).map(l => l.id);

    return res.status(200).json({
      outcome: 'ok',
      lang,
      topics,
      need: dossier.need,
      age,
      dossier,
      construct: {
        id: construct.id,
        title: construct.title,
        tool: construct.tool,
        ages: construct.ages,
        reference_story: construct.reference_story
      }
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
