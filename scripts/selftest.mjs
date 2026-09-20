// Проверка проверок. Гоняется без единого ключа и без единого запроса к провайдеру:
// подсовывает guardrails заведомо плохие истории и смотрит, что они не проходят.
//
//   node scripts/selftest.mjs

import { checkStory, CLOSING_RU } from '../lib/guardrails.js';
import { CONSTRUCTS, PANEL6, pickConstruct, pickPanel6 } from '../lib/data.js';

const construct = CONSTRUCTS.constructs[0];
const p6 = PANEL6.entries.find(e => e.id === construct.panel6);
const goodPanel6 = p6.ru + '\n\n' + CLOSING_RU;

const filler = 'Она умела свистеть в два пальца. Голуби слетались посмотреть. '.repeat(30);

function story(over = {}) {
  return {
    lang: 'ru',
    panels: [filler, filler, filler, filler, filler, goodPanel6],
    questions: [
      'А ты когда-нибудь боялся выйти на сцену? Что это было?',
      'Сколько тебе было лет, когда это случилось в первый раз?',
      'Что ты сделал тогда?'
    ],
    ...over
  };
}
const ctx = { construct, panel6Text: p6.ru, closing: CLOSING_RU };

const cases = [
  ['чистая история проходит', story(), true],
  ['цифра про тело', story({ panels: [filler + ' Она весила сорок килограммов.', filler, filler, filler, filler, goodPanel6] }), false],
  ['внешность как достоинство', story({ panels: [filler + ' Ты красивая, сказала мама.', filler, filler, filler, filler, goodPanel6] }), false],
  ['метод самоповреждения', story({ panels: [filler, filler + ' Она нашла лезвие.', filler, filler, filler, goodPanel6] }), false],
  ['мировоззрение названо выдумкой', story({ panels: [filler, filler, filler + ' Это просто выдумка, сказал он.', filler, filler, goodPanel6] }), false],
  ['обещано исчезновение', story({ panels: [filler, filler, filler, filler, filler + ' Запись замолчала навсегда.', goodPanel6] }), false],
  ['шестая часть переписана моделью', story({ panels: [filler, filler, filler, filler, filler, 'Если тебе плохо, скажи маме.\n\n' + CLOSING_RU] }), false],
  ['нет финальной строки', story({ panels: [filler, filler, filler, filler, filler, p6.ru] }), false],
  ['пять частей вместо шести', story({ panels: [filler, filler, filler, filler, goodPanel6] }), false],
  ['вопрос-допрос (ремесло: не блокирует, идёт в пометки)', story({ questions: ['Что ты чувствуешь, когда я тебя не слушаю?', 'А?', 'Б?'] }), true],
  ['два вопроса вместо трёх', story({ questions: ['А?', 'Б?'] }), false]
];

let pass = 0, fail = 0;
for (const [name, s, shouldPass] of cases) {
  const r = checkStory(s, ctx);
  const ok = r.ok === shouldPass;
  ok ? pass++ : fail++;
  const hits = r.hard.map(h => h.id).join(', ') || '—';
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name.padEnd(38)} ok=${r.ok}  hard=[${hits}]`);
}

// выбор конструкта и шестой части
console.log('\nвыбор конструкта:');
for (const [topics, age] of [[['stealing'], 9], [['appearance'], 5], [['hitting'], 8], [['big-questions'], 4], [['knitting'], 7]]) {
  const c = pickConstruct(topics, age);
  const six = c ? pickPanel6(c, topics, age) : null;
  console.log(`  ${JSON.stringify(topics)} age ${age} -> ${c ? c.id : 'НЕТ КОНСТРУКТА'}${six ? ' / ' + six.id : ''}`);
}

console.log(`\n${pass} прошло, ${fail} провалено`);

// новые правила: машинные обороты и названные чувства
console.log('\nновые правила:');
const extra = [
  ['машинный оборот «не просто»', 'Она была не просто девочкой, а капитаном. ', 'ai-tells'],
  ['«в этот момент»', 'В этот момент дверь открылась. ', 'ai-tells'],
  ['«с тех пор»', 'С тех пор он не подходил к воде. ', 'ai-tells'],
  ['названное чувство', 'Ей стало обидно, и она ушла. ', 'named-feelings'],
  ['«он понял, что»', 'Он понял, что был неправ. ', 'named-feelings']
];
for (const [name, bad, expectId] of extra) {
  const s = story({ panels: [filler + bad, filler, filler, filler, filler, goodPanel6] });
  const r = checkStory(s, ctx);
  // Ремесленные правила не блокируют историю: они попадают в craft, и редактор получает ещё попытку.
  const hit = r.craft.some(h => h.id === expectId) && r.ok;
  if (!hit) fail++;
  console.log(`  ${hit ? 'OK  ' : 'FAIL'} ${name.padEnd(30)} -> craft: ${r.craft.map(h => h.id).join(', ') || '—'}`);
}

process.exit(fail ? 1 : 0);
