// Данные приходят из JS-модулей, а не с диска: серверная функция на Vercel
// не видит файлов проекта, и чтение с диска её роняет ещё до первого запроса.
// Файлы data/*.json оставлены как читаемая копия для правки руками —
// после правки перегенерируй .js командой npm run data.

import CONSTRUCTS from '../data/constructs.js';
import PANEL6 from '../data/panel6.js';
import HEROES from '../data/heroes.js';
import TOOLS from '../data/tools.js';
import SAMPLE from '../data/sample.js';

export { CONSTRUCTS, PANEL6, HEROES, TOOLS, SAMPLE };

/** Конструкт без темы: подставляется, когда готовых нет. Выбором по тегам не выбирается. */
export const OPEN_CONSTRUCT = () => CONSTRUCTS.constructs.find(c => c.id === 'open');

export function findConstruct(id) {
  return CONSTRUCTS.constructs.find(c => c.id === id);
}

/** Выбор конструкта по тегам ситуации и возрасту. Детерминированно. */
export function pickConstruct(topics = [], age) {
  const scored = CONSTRUCTS.constructs.map(c => {
    const overlap = topics.filter(t => c.topics.includes(t)).length;
    const ageOk = age == null || (age >= c.ages[0] && age <= c.ages[1]);
    // Совпадение по теме обязательно. Один возраст конструкт не выбирает:
    // без темы честнее показать «такой истории пока нет», чем подставить чужую.
    return { c, score: overlap === 0 ? 0 : overlap * 10 + (ageOk ? 3 : 0) };
  }).sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].c : null;
}

/**
 * Текст шестой части. Сначала тот, что закреплён за конструктом; если возраст
 * ребёнка выпал из его вилки — подходящий по теме и возрасту; в последнюю
 * очередь общий. Никогда не генерируется.
 */
export function pickPanel6(construct, topics = [], age) {
  const byId = PANEL6.entries.find(e => e.id === construct.panel6);
  const fits = (e) => age == null || (age >= e.ages[0] && age <= e.ages[1]);
  if (byId && fits(byId)) return byId;

  const byTopic = PANEL6.entries
    .filter(e => e.topics[0] !== '*' && fits(e))
    .map(e => ({ e, n: topics.filter(t => e.topics.includes(t)).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (byTopic && byTopic.n > 0) return byTopic.e;

  return PANEL6.entries.find(e => e.topics[0] === '*');
}

export const CLOSING = PANEL6.closing_line;

/** Лист персонажа под историю: закреплённый за конструктом, иначе по полу и возрасту. */
export function pickHero(constructId, gender, age) {
  const list = HEROES.heroes || [];
  const fits = (h) => age == null || (age >= h.ages[0] && age <= h.ages[1]);
  return list.find(h => h.story === constructId && fits(h))
      || list.find(h => h.gender === gender && fits(h))
      || list.find(h => h.id === 'girl-default');
}

export const GRAMMAR = HEROES.grammar;
