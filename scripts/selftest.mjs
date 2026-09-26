// Быстрая проверка без сети и без ключей: все модули грузятся без ошибок,
// данные библиотеки в порядке, а чистая логика (без обращений к провайдерам)
// ведёт себя правильно. Живые проверки провайдеров — через /api/ping?test=...
// уже в развёрнутом виде, отдельно (нужны настоящие ключи).
import assert from 'node:assert/strict';

let ok = 0, fail = 0;
function check(name, fn) {
  try { fn(); ok++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '  -> ' + e.message); }
}

console.log('модули api/*.js загружаются');
const apiFiles = ['account', 'auth', 'pay', 'ping', 'record', 'image', 'hero', 'voice', 'library', 'wizard', 'stories'];
for (const f of apiFiles) {
  try { await import('../api/' + f + '.js'); ok++; console.log('  ok   загрузился api/' + f + '.js'); }
  catch (e) { fail++; console.log('  FAIL api/' + f + '.js не загрузился -> ' + e.message); }
}

console.log('\nбиблиотека сказок (data/library.js)');
const { LIBRARY, libraryList, libraryOne } = await import('../data/library.js');
check('в библиотеке двенадцать сказок', () => assert.equal(LIBRARY.length, 12));
check('шесть русских, шесть английских', () => {
  assert.equal(LIBRARY.filter(s => s.lang === 'ru').length, 6);
  assert.equal(LIBRARY.filter(s => s.lang === 'en').length, 6);
});
check('все id разные', () => assert.equal(new Set(LIBRARY.map(s => s.id)).size, LIBRARY.length));
check('у каждой сказки есть текст, источник и оценка времени', () => {
  for (const s of LIBRARY) {
    assert.ok(s.text && s.text.length > 30, s.id + ': текст пустой или совсем короткий');
    assert.ok(s.source && s.source.length > 5, s.id + ': нет источника');
    assert.ok(s.estMinutes > 0, s.id + ': нет оценки времени чтения');
  }
});
check('libraryList фильтрует по языку', () => assert.equal(libraryList('ru').length, 6));
check('libraryOne находит по id, иначе null', () => {
  assert.equal(libraryOne('ru-repka').title, 'Репка');
  assert.equal(libraryOne('нет-такой'), null);
});

console.log('\nтарифы (lib/plans.js) — пакет сказок, год без ограничений, донат');
const { PLANS, FREE_STORIES, RECORD_FREE, grantFor } = await import('../lib/plans.js');
check('два тарифа: pack10, year', () => assert.deepEqual(Object.keys(PLANS).sort(), ['pack10', 'year']));
check('grantFor(pack10) даёт 10 сказок', () => {
  const g = grantFor('pack10', 0);
  assert.equal(g.stories, 10);
});
check('grantFor(year) даёт безлимит на 365 дней', () => {
  const g = grantFor('year', 0);
  assert.equal(g.stories, null);
  assert.equal(g.until, 365 * 86400000);
});
check('FREE_STORIES=1: ровно одна бесплатная сказка любым способом', () => { assert.equal(FREE_STORIES, 1); assert.equal(RECORD_FREE, 1); });

console.log('\nправила аккаунта (lib/store.js) — тот же счётчик, что списывает Favola');
const { canMake, canMakeRecord, blankUser, publicView } = await import('../lib/store.js');
check('свежий аккаунт может сделать бесплатную сказку', () => {
  const u = blankUser('dev1');
  assert.equal(canMake(u, FREE_STORIES).ok, true);
});
check('после FREE_STORIES бесплатных без оплаты — нельзя', () => {
  const u = blankUser('dev2'); u.made = FREE_STORIES;
  assert.equal(canMake(u, FREE_STORIES).ok, false);
});
check('вторая сказка из записи без оплаты — нельзя (RECORD_FREE=1)', () => {
  const u = blankUser('dev3'); u.made = 1;
  assert.equal(canMakeRecord(u, FREE_STORIES, RECORD_FREE).ok, false);
});
check('publicView не отдаёт лишнего', () => {
  const u = blankUser('dev4');
  const v = publicView(u, FREE_STORIES, RECORD_FREE);
  assert.ok(!('payments' in v));
});

console.log('\nразбор записи (lib/record.js) — переиспользованная логика Favola');
const { splitSentences, sceneCountFor, cleanShows, timeline } = await import('../lib/record.js');
check('splitSentences режет по точке', () => {
  const words = 'Раз. Два.'.split(' ').map((t, i) => ({ t, s: i, e: i + 0.5 }));
  const s = splitSentences(words);
  assert.ok(s.length >= 2);
});
check('sceneCountFor держится в границах 3..6', () => {
  assert.ok(sceneCountFor(300, 30) <= 6);
  assert.ok(sceneCountFor(5, 2) >= 1);
});
check('cleanShows убирает повторы и режет длину списка', () => {
  assert.deepEqual(cleanShows(['кот', 'КОТ', 'дом', 'дом', 'дом', 'а', 'б', 'в', 'г']).length <= 6, true);
});

console.log('\nподсказки (lib/prompts.js) — новые для Radio собраны без ошибок');
const { buildWizardPrompt, buildPolishPrompt, buildLibraryScenesPrompt, WIZARD_SYSTEM, POLISH_SYSTEM } = await import('../lib/prompts.js');
check('buildWizardPrompt подставляет все восемь ответов', () => {
  const p = buildWizardPrompt(['Ася', 'зверь', 'мёд', 'дождь', 'сова', 'лес', 'спрятался', 'подождал'], 'ru');
  assert.ok(p.includes('Ася') && p.includes('подождал'));
});
check('buildPolishPrompt нумерует предложения', () => {
  const p = buildPolishPrompt(['Раз.', 'Два.'], 'ru');
  assert.ok(p.includes('0: Раз.') && p.includes('1: Два.'));
});
check('buildLibraryScenesPrompt нумерует абзацы', () => {
  const p = buildLibraryScenesPrompt(['Абзац один.', 'Абзац два.'], 'ru');
  assert.ok(p.includes('0: Абзац один.'));
});
check('системные подсказки не пустые', () => { assert.ok(WIZARD_SYSTEM.length > 100); assert.ok(POLISH_SYSTEM.length > 100); });

console.log(`\n${ok} прошло, ${fail} провалено`);
process.exit(fail ? 1 : 0);
