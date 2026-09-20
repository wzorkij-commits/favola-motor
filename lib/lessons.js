// Библиотека уроков: из неё в каждую сказку подставляется несколько приёмов,
// подходящих по возрасту, теме и части. Уроки появляются из книг, которые
// разбирает писатель-редактор, и попадают сюда только после решения Василия.

import LESSONS from '../data/lessons.js';

export function allLessons() {
  return (LESSONS.lessons || []).filter(l => l.status === 'approved');
}

/**
 * @param {{age?:number|null, topics?:string[], n?:number, rnd?:()=>number}} o
 * Возраст режет выдачу, тема и универсальность двигают вверх, случайность
 * перемешивает равные, чтобы одни и те же пять уроков не выпадали каждый раз.
 */
export function pickLessons({ age = null, topics = [], n = 5, rnd = Math.random } = {}) {
  const scored = allLessons()
    .filter(l => age == null || !l.ages || (age >= l.ages[0] && age <= l.ages[1]))
    .map(l => {
      const universal = (l.topics || []).includes('*');
      const overlap = (l.topics || []).filter(t => topics.includes(t)).length;
      return { l, s: (universal ? 1 : 0) + overlap * 3 + rnd() };
    })
    .filter(x => x.s >= 1)   // урок про другую тему без универсальности не берём
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map(x => x.l);
}

export function formatLessons(list) {
  if (!list || !list.length) return '';
  return list.map(l => `— ${l.technique}\n  Как здесь: ${l.how}${l.avoid ? '\n  Избегай: ' + l.avoid : ''}`).join('\n');
}
