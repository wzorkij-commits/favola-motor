// Проверки, через которые проходит каждая сгенерированная история до того,
// как её услышит ребёнок. Ничего вероятностного: только детерминированные правила.
//
// Три уровня, и разница между ними принципиальная:
//
//   hard  — безопасность. Таких правил мало, они про вред: цифры про тело,
//           способы самоповреждения, суждение о внешности, обещание, что
//           проблема исчезнет. Через них не переступаем никогда: история
//           не показывается вообще.
//   craft — ремесло. Машинные обороты, названные чувства, вопрос-допрос.
//           Стоит переписать, но ребёнку от них вреда нет. Даём редактору
//           попытки, а если не вышло — показываем историю с пометкой.
//   soft  — то, что решает человек при вычитке.
//
// Раньше ремесленные правила стояли в hard, и любая живая русская фраза
// («не просто», «на самом деле», «почувствовала») блокировала историю целиком.

const CLOSING_RU = 'А теперь спроси у того, кто рядом с тобой.';
const CLOSING_EN = 'And now — ask whoever is sitting next to you.';

// 1. Ни одной цифры и характеристики про тело.
// Слова ищутся с начала слова (не внутри другого): раньше «вес» находился в «весь»,
// «размер» в «размером с блин», «size » в «the size of a walnut», и живая история блокировалась насмерть.
// Формат: строка — начало слова; строка с пробелом внутри — фраза.
const BODY_WORDS = [
  'килограмм', 'кг', 'калори', 'вес тела', 'весит', 'весил', 'весила', 'весишь', 'взвесил себя',
  'размер одежды', 'размер обуви', 'размер талии', 'сантиметр', 'талия', 'обхват', 'диет', 'худе',
  'толстяк', 'толстуха', 'ты толст', 'он толст', 'она толст', 'полнее', 'похуде',
  'lose weight', 'her weight', 'his weight', 'kilogram', 'kilos', 'kg', 'weighs', 'weighed', 'calorie',
  'waist', 'clothes size', 'dress size', 'diet', 'chubby'
];
// 2. Внешность как проблема или как достоинство.
const APPEARANCE_JUDGEMENT = [
  'некрасив', 'уродлив', 'страшная', 'страшный на вид', 'красивее', 'красивая девочка',
  'самая красивая', 'ты красивая', 'ты красивый', 'не такая красивая',
  'ugly', 'prettier', 'most beautiful', 'you are beautiful', 'you are pretty'
];
// 3. Методы самоповреждения — даже внутри предупреждения.
// Обычные предметы сказки (верёвка качелей, «hang on», «change») сюда не относятся:
// ловится только сочетание «способ + против себя».
const SELF_HARM_METHOD = [
  'резать себя', 'порезать себя', 'порезал себя', 'порезала себя', 'лезвие', 'лезвием', 'таблетки, чтобы', 'выпил все таблетки',
  'повеситься', 'повесился', 'повесилась', 'спрыгнуть с крыши', 'спрыгнуть с моста', 'отравить себя',
  'cut herself', 'cut himself', 'cut myself', 'a blade', 'swallow the pills', 'take all the pills',
  'hang himself', 'hang herself', 'hang myself', 'jump off the roof', 'jump off the bridge', 'poison herself', 'poison himself'
];
// 4. Мировоззрение названо правдой или выдумкой.
const WORLDVIEW_RANKED = [
  'на самом деле никакого', 'это просто выдумка', 'это неправда, а правда',
  'глупая сказка', 'взрослые это придумали', 'это враньё',
  'is just a myth', 'is not real, the truth is', 'made that up'
];
// 5. Обещание, что проблема исчезнет.
const PROMISES_DISAPPEARANCE = [
  'больше никогда не', 'исчезла навсегда', 'исчез навсегда', 'прошло насовсем',
  'замолчала навсегда', 'её больше не было', 'его больше не было', 'страх ушёл совсем',
  'never again', 'gone forever', 'never came back', 'disappeared for good'
];
// 6. Взрослый спасает или наказывает вместо героя.
const ADULT_RESCUES = [
  'наказал', 'наказала', 'отругал', 'отругала', 'заставил извинить', 'вызвал родителей',
  'разобрался за', 'вступился за', 'punished', 'told him off', 'made them apologise'
];
// 7. Вопрос-допрос вместо вопроса, на который взрослый может ответить про себя.
const INTERROGATION = [
  'что ты чувствуешь, когда я', 'почему ты мне не', 'а ты меня', 'ты меня любишь',
  'what do you feel when i', 'why don\'t you', 'do you love me'
];


// 8. Обороты, по которым сразу видно машину.
const AI_TELLS = [
  'не просто ', 'не только ', 'в этот момент', 'в тот момент он понял', 'в тот момент она поняла',
  'и тогда он понял', 'и тогда она поняла', 'с тех пор', 'с того дня', 'казалось бы',
  'как оказалось', 'на самом деле', 'что-то изменилось', 'всё изменилось',
  'маленький, но важный', 'простой, но', 'волшебн',
  'not just ', 'not only ', 'in that moment', 'from that day', 'everything changed', 'magical'
];
// 9. Названные чувства вместо действия.
const NAMED_FEELINGS = [
  'стало обидно', 'стало стыдно', 'почувствовал', 'почувствовала', 'внутри всё сжалось',
  'сердце ёкнуло', 'на душе', 'он понял, что', 'она поняла, что', 'ощутил', 'ощутила',
  'felt ashamed', 'felt sad', 'her heart sank', 'he realised that', 'she realised that'
];
// 10. Абстракции вместо предметов.
const ABSTRACT_NOUNS = [
  'уверенность', 'самооценк', 'осознани', 'принятие себя', 'внутренний мир',
  'self-esteem', 'confidence in herself', 'acceptance'
];

const RULES = [
  { id: 'body-numbers', level: 'hard', words: BODY_WORDS,
    why: 'Ни одной цифры и характеристики про тело.' },
  { id: 'appearance-judged', level: 'hard', words: APPEARANCE_JUDGEMENT,
    why: 'Внешность не описывается ни как проблема, ни как достоинство.' },
  { id: 'self-harm-method', level: 'hard', words: SELF_HARM_METHOD,
    why: 'Никаких методов самоповреждения, даже в предупреждении.' },
  { id: 'worldview-ranked', level: 'hard', words: WORLDVIEW_RANKED,
    why: 'Ни одно мировоззрение не названо правдой или выдумкой.' },
  { id: 'promises-disappearance', level: 'hard', words: PROMISES_DISAPPEARANCE,
    why: 'Инструмент не обещает исчезновения: меняется расстояние, а не наличие.' },
  { id: 'adult-rescues', level: 'soft', words: ADULT_RESCUES,
    why: 'Взрослый не переубеждает и не спасает — он называет происходящее и даёт средство.' },
  { id: 'ai-tells', level: 'craft', words: AI_TELLS,
    why: 'Обороты, по которым сразу видно машину. Перепиши живой прозой.' },
  { id: 'named-feelings', level: 'craft', words: NAMED_FEELINGS,
    why: 'Чувства не называются. Только действие, предмет, что стало с голосом.' },
  { id: 'abstract-nouns', level: 'soft', words: ABSTRACT_NOUNS,
    why: 'Абстрактные существительные вместо предметов.' }
];

const esc = (w) => w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Слово ищется с начала слова: «вес» не находится в «весь», «hang» в «change».
// Начало слова — не буква и не цифра перед совпадением.
function findWords(haystack, words) {
  const low = haystack.toLowerCase();
  return words.filter(w => new RegExp('(?<![\\p{L}\\p{N}])' + esc(w), 'u').test(low));
}

function countWords(s) {
  return (s.trim().match(/[\p{L}\p{N}’'-]+/gu) || []).length;
}

/**
 * @param {object} story  { panels:[6], questions:[3], lang }
 * @param {object} ctx    { construct, panel6Text, closing }
 * @returns {{ok:boolean, hard:Array, soft:Array, report:Array}}
 */
export function checkStory(story, ctx) {
  const hard = [], craft = [], soft = [], report = [];
  const add = (level, id, why, detail) => {
    const item = { id, why, detail };
    (level === 'hard' ? hard : level === 'craft' ? craft : soft).push(item);
    report.push({ level, ...item });
  };
  const pass = (id, detail) => report.push({ level: 'pass', id, detail });

  const lang = story.lang || 'ru';
  const closing = lang === 'en' ? CLOSING_EN : CLOSING_RU;

  // --- структура ---
  if (!Array.isArray(story.panels) || story.panels.length !== 6) {
    add('hard', 'six-panels', 'История состоит ровно из шести частей.',
        `частей: ${story.panels ? story.panels.length : 0}`);
  } else pass('six-panels', '6 частей');

  if (!Array.isArray(story.questions) || story.questions.length !== 3) {
    add('hard', 'three-questions', 'Три вопроса ребёнка к взрослому — всегда три.',
        `вопросов: ${story.questions ? story.questions.length : 0}`);
  } else pass('three-questions', '3 вопроса');

  const body = (story.panels || []).join('\n\n');

  // --- шестая часть вставлена дословно, а не сочинена ---
  if (ctx.panel6Text) {
    const got = (story.panels && story.panels[5] || '').replace(/\s+/g, ' ').trim();
    const want = (ctx.panel6Text + '\n\n' + closing).replace(/\s+/g, ' ').trim();
    if (got !== want) {
      add('hard', 'panel6-verbatim',
          'Шестая часть вставляется дословно из клинической библиотеки и не генерируется.',
          'текст части 6 отличается от библиотечного');
    } else pass('panel6-verbatim', 'часть 6 совпадает с библиотечной побайтно');
  }

  // --- финальная строка ---
  if (!body.trim().endsWith(closing)) {
    add('hard', 'closing-line', 'Финальная строка всегда одна и та же.', closing);
  } else pass('closing-line', 'финальная строка на месте');

  // --- словарные правила ---
  for (const rule of RULES) {
    const hits = findWords(body + '\n' + (story.questions || []).join('\n'), rule.words);
    if (hits.length) add(rule.level, rule.id, rule.why, hits.join(', '));
    else pass(rule.id, 'чисто');
  }

  // --- вопросы: отвечаемы взрослым, не допрос ---
  const qHits = findWords((story.questions || []).join('\n'), INTERROGATION);
  if (qHits.length) {
    add('craft', 'question-is-interrogation',
        'Вопрос должен быть отвечаем взрослым честно и без подготовки, а не быть допросом.',
        qHits.join(', '));
  } else pass('question-is-interrogation', 'вопросы отвечаемы');

  // --- не подписи к картинкам, а связная история ---
  if (Array.isArray(story.panels) && story.panels.length >= 5) {
    const five = story.panels.slice(0, 5);
    const hasDialogue = five.some(p => /(^|\n)\s*[—–-]\s+\S/.test(p));
    if (!hasDialogue) {
      add('soft', 'no-dialogue',
          'Ни одной реплики: живые диалоги отличают историю от пересказа.', 'тире не найдено');
    } else pass('no-dialogue', 'диалоги есть');

    if (ctx.hero) {
      const startsWithHero = five.filter(p =>
        p.trim().toLowerCase().startsWith(String(ctx.hero).toLowerCase())).length;
      if (startsWithHero >= 3) {
        add('soft', 'caption-like',
            'Части начинаются одинаково — читается как подписи к картинкам, а не как связная история.',
            `${startsWithHero} части из 5 начинаются с имени героя`);
      } else pass('caption-like', 'части начинаются по-разному');
    }
  }

  // --- объём: шесть минут вслух ---
  const wc = countWords(body);
  if (wc < 600 || wc > 1300) {
    add('soft', 'length', 'Шесть-восемь минут вслух: примерно 750–1100 слов вместе с шестой частью.', `слов: ${wc}`);
  } else pass('length', `${wc} слов`);

  // --- досье: сказка отвечает на этот случай, а не на тему рядом ---
  const dos = ctx.dossier;
  if (dos && Array.isArray(story.panels) && story.panels.length >= 5) {
    const five = story.panels.slice(0, 5).join('\n\n');
    const stemOf = (w) => String(w).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
    const inflect = (w) => { const t = stemOf(w); return t.length > 5 ? t.slice(0, t.length - Math.min(2, Math.floor(t.length / 4))) : t; };
    const details = (dos.keep_details || []).map(inflect).filter(Boolean);
    if (details.length >= 3) {
      const low = five.toLowerCase();
      const found = details.filter(d => low.includes(d));
      if (found.length < Math.ceil(details.length / 2)) {
        add('craft', 'answers-the-request',
            'Сказка должна быть про этот случай: вернуть в неё предметы, места и действия из запроса.',
            `есть ${found.length} из ${details.length}: нужны ${(dos.keep_details || []).join(', ')}`);
      } else pass('answers-the-request', `${found.length} из ${details.length} деталей запроса`);
    }
    const handle = dos.tool && dos.tool.handle ? stemOf(dos.tool.handle) : '';
    if (handle) {
      const tail = story.panels.slice(3, 5).join(' ').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ');
      const flat = handle.replace(/\s+/g, ' ');
      if (!tail.includes(flat)) {
        add('craft', 'handle-present',
            'Ручка инструмента должна прозвучать в частях 4–5 дословно, как в досье.', `«${dos.tool.handle}»`);
      } else pass('handle-present', 'ручка прозвучала');
    }
    const lastPara = story.panels[4].trim().split(/\n\n/).pop().toLowerCase();
    if (/(понял|поняла|научил|главное|нужно всегда|надо всегда|realised|realized|learned|the lesson)/.test(lastPara)) {
      add('soft', 'moral-ending', 'Финал без морали: последняя фраза называет вещь или движение.', lastPara.slice(-80));
    } else pass('moral-ending', 'финал без морали');
  }

  // --- запреты конкретного конструкта ---
  if (ctx.construct && Array.isArray(ctx.construct.must_not)) {
    report.push({ level: 'note', id: 'construct-must-not',
      why: 'Запреты конструкта проверяются человеком при вычитке.',
      detail: ctx.construct.must_not.join(' · ') });
  }

  // ok — можно ли показать. Ремесленные замечания показать не мешают:
  // они идут в пометки и в очередь на человеческую вычитку.
  return { ok: hard.length === 0, clean: hard.length === 0 && craft.length === 0,
           hard, craft, soft, report };
}

export { CLOSING_RU, CLOSING_EN };
