// Проверка нового устройства сказки без единого ключа: подменяет ответы модели и смотрит,
// что досье, две половины черновика, редактор и проверки собираются в целую сказку.
//   node scripts/story-test.mjs

import { checkStory, CLOSING_RU } from '../lib/guardrails.js';
import { CONSTRUCTS, PANEL6, SAMPLE, OPEN_CONSTRUCT, pickPanel6, pickConstruct, TOOLS } from '../lib/data.js';
import { pickVariety, USED_NAMES } from '../lib/variety.js';
import { pickRecipe, cleanRecent, sameAxes, recipeFromIds } from '../lib/recipe.js';
import { AXES, KEY_AXES, CATALOG, byId } from '../lib/catalog.js';
import { BIBLE_VERSION, VARIETY_RULE, CRAFT_DRAMA } from '../lib/bible.js';
import { pickLessons, allLessons, formatLessons } from '../lib/lessons.js';
import { buildDossierPrompt, buildStoryPrompt, buildPolishPrompt, buildSystemPrompt, formatDossier } from '../lib/prompts.js';

let ok = 0, bad = 0;
const t = (name, cond, extra = '') => { cond ? ok++ : bad++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (!cond && extra ? '  -> ' + extra : '')); };
const words = (s) => (s.match(/[\p{L}\p{N}’'-]+/gu) || []).length;

/* ── подмена ответов модели ── */
let queue = [];
const seen = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  seen.push({ url, body });
  const next = queue.shift();
  if (next === undefined) throw new Error('в очереди нет ответа для ' + url);
  if (next instanceof Error) throw next;
  const text = typeof next === 'string' ? next : JSON.stringify(next);
  return { ok: true, status: 200, json: async () => ({ content: [{ text }], stop_reason: next.__stop || 'end_turn', usage: { output_tokens: 100 } }), text: async () => text };
};
process.env.ANTHROPIC_API_KEY = 'test';

const call = async (handler, body) => {
  let code = 200, out;
  const res = { setHeader() {}, status(c) { code = c; return res; }, json(o) { out = o; return res; }, end() { return res; } };
  await handler({ method: 'POST', body, query: {} }, res);
  return { code, out };
};

/* ── образец проходит наши же проверки ── */
const dossier = {
  safety: 'ok', topics: ['losing'], age_guess: 6, child_gender: 'm',
  what_happened: 'Проиграл в «стульчики» на дне рождения, разревелся, ушёл в коридор.',
  wants: 'выиграть медаль', did: 'спрятался под вешалкой', wrong_belief: 'теперь все запомнят, что я ревел',
  need: 'проигрывать и остаться своим', nothing_terrible: ['торт съели', 'никто не запомнил'],
  keep_details: ['стульчики', 'день рождения', 'коридор', 'слёзы'],
  tool: { id: 'pause-breath', name: 'Пауза и три выдоха', how: 'сказать «я на минутку», три выдоха, решить самому', handle: 'Я на минутку.' },
  outside: 'фотография чужого мальчика', register: 'comic', funny: 'кошка выигрывает всегда',
  plot: { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e' }
};
const construct = OPEN_CONSTRUCT();
t('открытый конструкт есть и не выбирается по тегам', !!construct && !pickConstruct(['losing'], 6));
const p6 = pickPanel6(construct, ['losing'], 6);
t('для открытого конструкта шестая часть общая', p6.id === 'p6-general', p6.id);
const sampleStory = { lang: 'ru', panels: [...SAMPLE.panels.slice(0, 5), p6.ru + '\n\n' + CLOSING_RU], questions: SAMPLE.questions };
const r0 = checkStory(sampleStory, { construct, panel6Text: p6.ru, closing: CLOSING_RU, hero: 'Яша', dossier });
t('образец проходит все свои проверки без замечаний', r0.clean, JSON.stringify([...r0.hard, ...r0.craft]));
t('образец: замечаний «на вычитку» нет', r0.soft.length === 0, JSON.stringify(r0.soft));
const wc = words(sampleStory.panels.join(' '));
t('образец укладывается в 600–1300 слов', wc >= 600 && wc <= 1300, String(wc));

/* ── ложные срабатывания прежних правил безопасности ── */
const fp = 'Весь двор смеялся, было весело. Пирожок размером с блин. It was the size of a walnut. She had to change her mind. Верёвка качелей скрипела. Толстая ветка.';
const rfp = checkStory({ lang: 'ru', panels: [fp, '', '', '', '', ''], questions: ['a', 'b', 'c'] }, {});
t('обычные слова не блокируют историю («весь», «размером», «size of», «change», «верёвка»)',
  !rfp.hard.some(h => ['self-harm-method'].includes(h.id)) && !rfp.soft.some(x => x.id === 'body-targets'), JSON.stringify(rfp.hard));
const rreal = checkStory({ lang: 'ru', panels: ['Она весит сорок килограммов.', '', '', '', '', ''], questions: ['a', 'b', 'c'] }, {});
t('про вес и тело можно говорить: ничего не блокируется', !rreal.hard.some(h => h.id === 'self-harm-method') && !rreal.soft.some(x => x.id === 'body-targets') && !rreal.craft.some(x => x.id === 'appearance-judged'));
const rdiet = checkStory({ lang: 'ru', panels: ['Ей сказали сесть на диету.', '', '', '', '', ''], questions: ['a', 'b', 'c'] }, {});
t('диета как цель уходит на вычитку человеку, но не блокирует', rdiet.soft.some(x => x.id === 'body-targets') && !rdiet.hard.some(x => x.id === 'body-targets'));
const rharm = checkStory({ lang: 'ru', panels: ['Он хотел повеситься.', '', '', '', '', ''], questions: ['a', 'b', 'c'] }, {});
t('настоящий способ самоповреждения по-прежнему блокируется', rharm.hard.some(h => h.id === 'self-harm-method'));

/* ── новые проверки досье ── */
const off = { ...sampleStory, panels: sampleStory.panels.map((p, i) => i < 5 ? 'Жил на свете зайчик. '.repeat(20) : p) };
const r1 = checkStory(off, { construct, panel6Text: p6.ru, closing: CLOSING_RU, dossier });
t('сказка мимо запроса ловится (answers-the-request)', r1.craft.some(c => c.id === 'answers-the-request'));
t('сказка без ручки ловится (handle-present)', r1.craft.some(c => c.id === 'handle-present'));
const moral = { ...sampleStory, panels: sampleStory.panels.map((p, i) => i === 4 ? p + '\n\nИ тогда он понял, что главное — не сдаваться.' : p) };
const r2 = checkStory(moral, { construct, panel6Text: p6.ru, closing: CLOSING_RU, dossier });
t('мораль в финале попадает на вычитку', r2.soft.some(c => c.id === 'moral-ending'));

/* ── разнообразие ── */
let names = new Set();
for (let i = 0; i < 40; i++) pickVariety({ age: 7, lang: 'ru', gender: 'f' }).names.forEach(n => names.add(n));
t('имена героя разнообразны (не менее 12 разных за 40 заходов)', names.size >= 12, String(names.size));
t('в именах нет использованных', ![...names].some(n => USED_NAMES.includes(n)));
t('пол ограничивает имена', pickVariety({ gender: 'm', lang: 'en' }).names.every(n => ['Alfie','Otis','Felix','Rory','Ned','Barnaby','Jasper','Hugo','Stanley','Albie','Milo','Ozzy','Archie','Louie','Kit','Fergus'].includes(n)));
t('малышам форма с припевом', /припев/.test(pickVariety({ age: 4 }).form));
const forms = new Set(); for (let i = 0; i < 60; i++) forms.add(pickVariety({ age: 7 }).form);
t('для 6–8 лет бывает и первое лицо, и третье', forms.size >= 2);

/* ── рецепт: каталог, возраст, тон, совместимость, повторы ── */
// предсказуемый генератор, чтобы тесты не мигали
const seeded = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
t('каталог: девять осей', AXES.length === 9 && KEY_AXES.every(k => CATALOG[k]));
t('каталог: идентификаторы уникальны внутри оси, у каждого значения есть текст и возраст',
  AXES.every(a => new Set(a.list.map(x => x.id)).size === a.list.length && a.list.every(x => x.t.length > 20 && x.a[0] <= x.a[1] && x.a[0] >= 3 && x.a[1] <= 12)));
t('каталог: ссылки x указывают на существующие значения',
  AXES.every(a => a.list.every(x => x.x.every(ref => { const [ax, id] = ref.split(':'); return byId(ax, id); }))));
t('каталог: на любой возраст и любой тон в каждой оси есть значения',
  AXES.every(a => [3,4,5,6,7,8,9,10,11,12].every(age => ['c','t','a'].every(r => a.list.some(x => age >= x.a[0] && age <= x.a[1] && x.r.includes(r))))));
t('каталог не содержит цитат из книг (нет кавычек-ёлочек длиннее 15 слов)',
  AXES.every(a => a.list.every(x => (x.t.match(/«[^»]*»/g) || []).every(q => q.split(/\s+/).length <= 15))));

const rr = pickRecipe({ age: 4, register: 'tender', rnd: seeded(7) });
t('рецепт: есть все девять осей и текст', AXES.every(a => rr.ids[a.key] && rr.lines[a.key]) && /Обязательно:/.test(rr.text) && /Голос:/.test(rr.text));
t('рецепт: детерминирован при одном генераторе', JSON.stringify(pickRecipe({ age: 7, register: 'comic', rnd: seeded(42) }).ids) === JSON.stringify(pickRecipe({ age: 7, register: 'comic', rnd: seeded(42) }).ids));
t('рецепт: без возраста и тона всё равно собирается', !!pickRecipe({ rnd: seeded(3) }).ids.form && !!pickRecipe({ age: 'abc', register: '???', topics: 'x', recent: 'x' }).ids.voice);

let badAge = 0, badReg = 0, badNarr = 0, badX = 0, badNt = 0;
const seenForms = new Set(), seenVoices = new Set(), seenEnd = new Set(), seenEntry = new Set(), seenHumor = new Set();
const RG = { comic: 'c', tender: 't', adventure: 'a' };
for (let i = 0; i < 600; i++) {
  const age = 3 + (i % 10), reg = ['comic', 'tender', 'adventure'][i % 3], topics = i % 5 === 0 ? ['death', 'bullying'] : [];
  const rc = pickRecipe({ age, register: reg, topics, rnd: seeded(1000 + i) });
  const items = AXES.map(a => [a.key, byId(a.key, rc.ids[a.key])]);
  for (const [k, it] of items) {
    if (age < it.a[0] || age > it.a[1]) badAge++;
    if (!it.r.includes(RG[reg])) badReg++;
    if (it.nt.some(x => topics.includes(x))) badNt++;
    if (it.ot.length && !it.ot.some(x => topics.includes(x))) badNt++;
  }
  const narrs = new Set(items.map(([, it]) => it.narr).filter(Boolean));
  if (narrs.size > 1) badNarr++;
  for (const [k, it] of items) for (const ref of it.x) { const [ax, id] = ref.split(':'); if (rc.ids[ax] === id) badX++; }
  seenForms.add(rc.ids.form); seenVoices.add(rc.ids.voice); seenEnd.add(rc.ids.ending); seenEntry.add(rc.ids.entry); seenHumor.add(rc.ids.humor);
}
t('600 рецептов: все значения по возрасту слушателя', badAge === 0, String(badAge));
t('600 рецептов: все значения по тону сказки', badReg === 0, String(badReg));
t('600 рецептов: темы, для которых значение не годится, соблюдены', badNt === 0, String(badNt));
t('600 рецептов: лицо рассказа не противоречит само себе', badNarr === 0, String(badNarr));
t('600 рецептов: несовместимые пары не встречаются', badX === 0, String(badX));
t('600 рецептов: разнообразие (форм ≥14, голосов ≥10, финалов ≥12, входов ≥12, юмора ≥10)',
  seenForms.size >= 14 && seenVoices.size >= 10 && seenEnd.size >= 12 && seenEntry.size >= 12 && seenHumor.size >= 10,
  [seenForms.size, seenVoices.size, seenEnd.size, seenEntry.size, seenHumor.size].join('/'));

// анти-повтор: цепочка из 60 сказок подряд, каждая помнит прошлые
let recent = [], worst = 0, dupNeighbour = 0;
for (let i = 0; i < 60; i++) {
  const rc = pickRecipe({ age: 7, register: 'comic', recent, rnd: seeded(5000 + i) });
  for (const past of recent.slice(0, 5)) worst = Math.max(worst, sameAxes(rc.ids, past));
  if (recent[0] && rc.ids.form === recent[0].form) dupNeighbour++;
  recent = [rc.ids, ...recent].slice(0, 8);
}
t('анти-повтор: с любой из пяти прошлых сказок совпадает не больше одной главной оси из пяти', worst <= 1, String(worst));
t('анти-повтор: форма не повторяется у соседних сказок', dupNeighbour === 0, String(dupNeighbour));
// без памяти повторы, конечно, бывают чаще
let same = 0; for (let i = 0; i < 200; i++) { const a = pickRecipe({ age: 4, register: 'tender', rnd: seeded(i) }), b = pickRecipe({ age: 4, register: 'tender', rnd: seeded(i + 999) }); if (sameAxes(a.ids, b.ids) >= 2) same++; }
let same2 = 0, mem = [];
for (let i = 0; i < 200; i++) { const a = pickRecipe({ age: 4, register: 'tender', recent: mem, rnd: seeded(i) }); mem = [a.ids, ...mem].slice(0, 8); if (mem[1] && sameAxes(mem[0], mem[1]) >= 2) same2++; }
t('анти-повтор для малышей (узкий выбор) работает лучше, чем без памяти', same2 <= same, `${same2} против ${same}`);

t('рецепт из мусора в recent не падает и мусор отбрасывается',
  cleanRecent([null, 5, 'x', [], { form: 'classic', voice: '<script>' }, { form: 'x'.repeat(50) }, { ending: 'gesture' }]).length === 2);
t('recent больше двенадцати обрезается', cleanRecent(Array.from({ length: 40 }, () => ({ form: 'classic' }))).length === 12);
const restored = recipeFromIds(rr.ids);
t('рецепт восстанавливается из идентификаторов', restored && restored.text === rr.text && recipeFromIds({ form: 'нет' }) === null);
t('pickVariety отдаёт рецепт и прежние поля', (() => { const v = pickVariety({ age: 7, lang: 'ru', register: 'comic', topics: ['losing'] }); return v.recipe && v.recipe.ids.form && v.form && v.opening && v.humor && v.names.length; })());
t('малышу в рецепте нет взрослых форм (письма, странствие)', (() => { for (let i = 0; i < 200; i++) { const r2 = pickRecipe({ age: 4, rnd: seeded(i) }); if (['frame-letter', 'journey', 'twin', 'unreliable', 'dry-first'].includes(r2.ids.form) || ['unreliable', 'dry-first'].includes(r2.ids.voice)) return false; } return true; })());

t('Библия версии 3, в ней «неизменно / меняется» и драматургия', BIBLE_VERSION === 3 && /НЕИЗМЕННО/.test(VARIETY_RULE) && /Хочу и надо/.test(CRAFT_DRAMA));
const sp3 = buildStoryPrompt({ construct, request: 'x', child: { age: 6 }, lang: 'ru', dossier: { ...dossier, variety: pickVariety({ age: 6, register: 'comic' }) }, part: 'b', first: { hero: 'Я', title: 'Т', panels: ['a', 'b', 'c'] } });
t('образец урезан до двух сцен и не тянет к одной форме', /части 2 и 4/.test(sp3) && !/Пол-медали/.test(sp3) || /части 2 и 4/.test(sp3));
const pp = buildPolishPrompt({ draft: { panels: ['a', 'b', 'c', 'd', 'e'], questions: ['1', '2', '3'] }, construct, dossier: { ...dossier, variety: pickVariety({ age: 6, register: 'comic' }) }, lang: 'ru' });
t('редактор видит рецепт, вопросы драматургии и проход русского редактора', /РЕЦЕПТ/.test(pp) && /Драматургия:/.test(pp) && /литературный редактор российского издательства/.test(pp));
t('английскому редактору вместо русского прохода дан английский', /Английский: естественный британский/.test(buildPolishPrompt({ draft: { panels: ['a', 'b', 'c', 'd', 'e'], questions: [] }, construct, dossier, lang: 'en' })));
t('досье показывает «хочу», «надо», угол зрения и закладки', /Хочу героя/.test(formatDossier({ ...dossier, goal: 'медаль', core: 'проигрывать', angle: 'a', plant: ['x', 'y'] })));

/* ── уроки ── */
const L4 = pickLessons({ age: 4, topics: ['night-fears'], n: 5 });
t('уроки режутся по возрасту', L4.every(l => 4 >= l.ages[0] && 4 <= l.ages[1]), L4.map(l => l.id).join());
t('малышу достаётся припев', pickLessons({ age: 4, n: 20 }).some(l => l.id === 'refrain-and-sound'));
t('урок про чужую тему не берётся', !pickLessons({ age: 10, topics: ['anger'], n: 30 }).some(l => l.id === 'fear-has-a-place'));
t('уроки форматируются', /Как здесь:/.test(formatLessons(L4)));
t('библиотека: у каждого урока есть приём и способ применить', allLessons().every(l => l.technique && l.how && l.status === 'approved'));
t('библиотека инструментов: у каждого ручка на двух языках', TOOLS.tools.every(x => x.ru.handle && x.en.handle && x.ru.how && x.ages));

/* ── промпты собираются ── */
const dp = buildDossierPrompt({ request: 'ребёнок проиграл', child: { age: 6 }, lang: 'ru', topicList: ['losing'] });
t('промпт досье содержит запрос, библиотеку инструментов и формат', dp.includes('ребёнок проиграл') && dp.includes('pause-breath') && dp.includes('"keep_details"'));
const sp = buildStoryPrompt({ construct, request: 'x', child: { age: 6 }, lang: 'ru', dossier: { ...dossier, variety: pickVariety({ age: 6 }) }, part: 'a' });
t('промпт части a: досье, образец, выбор редактора', sp.includes('Ручка (произнести дословно)') && sp.includes('ОБРАЗЕЦ') && sp.includes('Рецепт этой сказки') && sp.includes('Голос:'));
t('промпт части a просит только три части', /ТОЛЬКО части 1, 2 и 3/.test(sp));
const spb = buildStoryPrompt({ construct, request: 'x', child: { age: 6 }, lang: 'ru', dossier, part: 'b', first: { hero: 'Яша', title: 'Т', panels: ['a', 'b', 'c'] } });
t('промпт части b несёт первую половину и вопросы', spb.includes('ЧАСТЬ 3') && spb.includes('"questions"'));
const sysEn = buildSystemPrompt('en');
t('система на английском требует английскую историю', sysEn.includes('по-английски') && sysEn.includes('And now'));
t('система длиной разумной (до 12 000 знаков)', buildSystemPrompt('ru').length < 12000, String(buildSystemPrompt('ru').length));
t('имя ребёнка от родителя фиксируется', buildStoryPrompt({ construct, request: 'x', child: { heroName: 'Зина' }, lang: 'ru', dossier, part: 'a' }).includes('Героя зовут Зина'));
t('досье форматируется', /Ручка/.test(formatDossier(dossier)));

/* ── конвейер: триаж → часть a → часть b → редактор ── */
const triage = (await import('../api/triage.js')).default;
const story = (await import('../api/story.js')).default;
const polish = (await import('../api/polish.js')).default;

queue = [{ ...dossier, topics: ['losing', 'crying'] }];
let r = await call(triage, { request: 'Сын проиграл в стульчики, разревелся, убежал в коридор.', child: { age: 6 } });
t('триаж: досье и открытый конструкт при неизвестной теме', r.out.outcome === 'ok' && r.out.construct.id === 'open' && r.out.dossier.tool.handle, JSON.stringify(r.out).slice(0, 200));
t('триаж: варианты и уроки едут в досье', r.out.dossier.variety.names.length >= 3 && r.out.dossier.lessons.length >= 1);
const tr = r.out;
t('триаж: рецепт едет в досье и подходит по возрасту', tr.dossier.variety.recipe && tr.dossier.variety.recipe.ids.form && tr.dossier.variety.recipe.text.includes('Голос:'));
queue = [{ ...dossier, register: 'comic' }];
const lastRecipe = tr.dossier.variety.recipe.ids;
r = await call(triage, { request: 'Сын проиграл в стульчики.', child: { age: 6 }, recent: [lastRecipe, 'мусор', { form: '<b>' }, ...Array.from({ length: 50 }, () => ({ form: 'classic' }))] });
t('триаж: recent принимается, мусор не мешает, рецепт отличается от прошлого', r.out.outcome === 'ok' && sameAxes(r.out.dossier.variety.recipe.ids, lastRecipe) <= 1 && r.out.dossier.variety.recipe.ids.form !== lastRecipe.form);

queue = [{ ...dossier, topics: ['stealing'] }];
r = await call(triage, { request: 'Она взяла браслет у подруги и не признаётся.', child: { age: 9 } });
t('триаж: готовый конструкт находится по тегу', r.out.construct.id === 'cupboard', r.out.construct && r.out.construct.id);

queue = [{ safety: 'adult', safety_why: 'угроза', topics: [] }];
r = await call(triage, { request: 'У нас дома иногда страшно, когда папа злой.', child: { age: 6 } });
t('триаж: модель увидела опасность и показала экран помощи', r.out.outcome === 'disclosure' && r.out.screen.helplines.length > 0);

for (const ok of ['Сын бьёт младшую сестру, когда злится.', 'Её заставляют доедать суп, и она плачет.', 'Брат трогает мои игрушки, ребёнок обижается.', 'Дочь спрашивает, почему она весит больше подруг.', 'Мальчик говорит, что он толстый, и не хочет на физкультуру.']) {
  queue = [{ ...dossier }];
  const rr = await call(triage, { request: ok, child: { age: 7 } });
  t('обычный запрос про тело или драку получает сказку: ' + ok.slice(0, 30), rr.out.outcome === 'ok', rr.out.outcome);
}
r = await call(triage, { request: 'у него бьёт отчим', child: { age: 6 } });
t('триаж: ключевые слова срабатывают до модели', r.out.outcome === 'disclosure' && queue.length === 0);

const pa = 'Утро было такое: '.repeat(1) + 'Гоша ходил кругами и считал ступеньки, потому что в коридоре стульчики стояли в ряд и никто не спрашивал.';
const half = (x) => x.padEnd(120, ' и снова');
queue = [{ hero: 'Гоша', title: 'Ступеньки', want: 'выиграть', panels: [half(pa), half('Два'), half('Три')] }];
r = await call(story, { request: 'x', child: { age: 6 }, constructId: 'open', lang: 'ru', dossier: tr.dossier, part: 'a' });
t('часть a: три части и герой', r.out.outcome === 'ok' && r.out.draft.panels.length === 3 && r.out.draft.hero === 'Гоша', JSON.stringify(r.out).slice(0, 200));
const sentPrompt = seen[seen.length - 1].body.messages[0].content;
t('часть a: в модель ушли досье и уроки', sentPrompt.includes('Ручка (произнести дословно)') && sentPrompt.includes('ПРИЁМЫ ИЗ ХОРОШИХ КНИГ'));
t('часть a: потолок ответа 5000', seen[seen.length - 1].body.max_tokens === 5000);
const first = r.out.draft;

queue = [{ panels: [half('Четыре'), half('Пять')], questions: ['А?', 'Б?', 'В?'], symbol: 'тетрадь', illustration_briefs: ['1', '2', '3', '4', '5', '6'] }];
r = await call(story, { request: 'x', child: { age: 6 }, constructId: 'open', lang: 'ru', dossier: tr.dossier, part: 'b', first });
t('часть b: две части, три вопроса, шесть кадров', r.out.outcome === 'ok' && r.out.draft.panels.length === 2 && r.out.draft.illustration_briefs.length === 6);
t('часть b видела первую половину', seen[seen.length - 1].body.messages[0].content.includes(first.panels[0].slice(0, 30)));

// модель забыла кадры совсем, вернула три, объект и пустые строки: всё равно ровно шесть
for (const [name, br] of [['нет вообще', undefined], ['только три', ['а', 'б', 'в']], ['объектом', { a: 'первый кадр', b: 'второй кадр' }], ['пустые строки', ['', ' ', '', '', '', '']]]) {
  queue = [{ panels: [half('Четыре'), half('Пять')], questions: ['А?', 'Б?', 'В?'], illustration_briefs: br }];
  r = await call(story, { request: 'x', child: { age: 6 }, constructId: 'open', lang: 'ru', dossier: tr.dossier, part: 'b', first });
  t('часть b, кадры «' + name + '»: всё равно шесть непустых', r.out.outcome === 'ok' && r.out.draft.illustration_briefs.length === 6 && r.out.draft.illustration_briefs.every(b => typeof b === 'string' && b.trim().length > 3), JSON.stringify(r.out.draft && r.out.draft.illustration_briefs).slice(0, 200));
}
queue = [{ panels: [half('Четыре'), half('Пять')], questions: ['А?', 'Б?', 'В?'], illustration_briefs: ['мой кадр 1'] }];
r = await call(story, { request: 'x', child: { age: 6 }, constructId: 'open', lang: 'ru', dossier: tr.dossier, part: 'b', first });
t('часть b: кадры модели сохраняются, недостающие достраиваются', r.out.draft.illustration_briefs[0] === 'мой кадр 1' && r.out.draft.illustration_briefs[1].length > 20);
queue = [{ hero: 'Гоша', title: 'Т', panels: [half('1'), half('2'), half('3'), half('4'), half('5')], questions: ['а', 'б', 'в'] }];
r = await call(story, { request: 'x', child: { age: 8 }, constructId: 'cupboard', lang: 'ru' });
t('прежний клиент без кадров: тоже шесть', r.out.outcome === 'ok' && r.out.draft.illustration_briefs.length === 6);

r = await call(story, { request: 'x', child: {}, constructId: 'open', lang: 'ru', dossier: tr.dossier, part: 'b', first: null });
t('часть b без первой половины: отказ 400', r.code === 400);

queue = [{ hero: 'Гоша', panels: ['мало', 'мало', 'мало'] }];
r = await call(story, { request: 'x', child: {}, constructId: 'open', lang: 'ru', dossier: tr.dossier, part: 'a' });
t('часть a: пустая часть даёт понятную причину для повтора', r.out.outcome === 'retry' && /пустая/.test(r.out.why), JSON.stringify(r.out));

queue = [{ __stop: 'max_tokens' }];
r = await call(story, { request: 'x', child: {}, constructId: 'open', lang: 'ru', dossier: tr.dossier, part: 'a' });
t('обрубленный ответ объявляется отдельно', r.out.outcome === 'retry' && /не успела/.test(r.out.why), JSON.stringify(r.out));

// части списком или объектом (письма, репортаж), нет героя, нет вопросов: чиним, а не отбрасываем
queue = [{ title: 'Т', panels: [[half('Письмо один'), half('Письмо два')], { a: half('Два'), b: half('Два ещё') }, half('Три')] }];
r = await call(story, { request: 'x', child: {}, constructId: 'open', lang: 'ru', dossier: tr.dossier, part: 'a' });
t('часть a: части списком и объектом склеиваются, герой берётся из выбора редактора', r.out.outcome === 'ok' && r.out.draft.panels.every(p => typeof p === 'string' && p.length > 80) && tr.dossier.variety.names.includes(r.out.draft.hero), JSON.stringify(r.out).slice(0, 200));
queue = [{ panels: [half('Четыре'), half('Пять')] }];
r = await call(story, { request: 'x', child: {}, constructId: 'open', lang: 'ru', dossier: tr.dossier, part: 'b', first: { hero: 'Гоша', title: 'Т', panels: ['a', 'b', 'c'] } });
t('часть b: без вопросов тоже принимается, редактор дополнит', r.out.outcome === 'ok' && r.out.draft.questions.length === 0, JSON.stringify(r.out).slice(0, 200));

// без part и без досье: так вызывает прежний клиент
queue = [{ hero: 'Гоша', title: 'Т', panels: [half('1'), half('2'), half('3'), half('4'), half('5'), half('шестая, лишняя')], questions: ['а', 'б', 'в'], illustration_briefs: [] }];
r = await call(story, { request: 'ребёнок взял чужое', child: { age: 8 }, constructId: 'cupboard', lang: 'ru' });
t('прежний клиент: пять частей, шестую лишнюю режем', r.out.outcome === 'ok' && r.out.draft.panels.length === 5, JSON.stringify(r.out).slice(0, 200));

// редактор
const full = { hero: 'Яша', title: 'Пол-медали', panels: SAMPLE.panels.slice(0, 5), questions: SAMPLE.questions, illustration_briefs: ['1', '2', '3', '4', '5', '6'] };
queue = [{ verdict: 'ok', edits: {}, fixed: [] }];
r = await call(polish, { draft: full, constructId: 'open', topics: ['losing'], child: { age: 6 }, lang: 'ru', dossier, attempt: 1, maxAttempts: 3 });
t('редактор: хороший текст остаётся как есть и проходит', r.out.outcome === 'ok' && r.out.story.panels[0] === SAMPLE.panels[0] && r.out.clean, JSON.stringify(r.out).slice(0, 300));
{
  const noBr = { ...full }; delete noBr.illustration_briefs;
  queue = [{ verdict: 'ok', edits: {}, fixed: [] }];
  const rr = await call(polish, { draft: noBr, constructId: 'open', topics: ['losing'], child: { age: 6 }, lang: 'ru', dossier, attempt: 1, maxAttempts: 3 });
  t('редактор: черновик без кадров выходит с шестью кадрами', rr.out.outcome === 'ok' && Array.isArray(rr.out.story.illustration_briefs) && rr.out.story.illustration_briefs.length === 6);
  queue = [{ verdict: 'ok', edits: {}, fixed: [] }];
  const rb = await call(polish, { draft: { ...noBr, illustration_briefs: 'просто строка' }, constructId: 'open', topics: ['losing'], child: { age: 6 }, lang: 'en', dossier, attempt: 3, maxAttempts: 3 });
  t('редактор: кадры строкой, последний заход, английский: шесть кадров', rb.out.outcome === 'ok' && rb.out.outcome === 'ok' && rb.out.story.illustration_briefs.length === 6, JSON.stringify(rb.out).slice(0, 300));
}
t('редактор: шестая часть вставлена дословно', r.out.story.panels[5] === p6.ru + '\n\n' + CLOSING_RU);
t('редактор: проверки идут по досье', r.out.check.some(c => c.id === 'handle-present' && c.level === 'pass'));

const edit2 = SAMPLE.panels[1].replace('Тамара получила медаль.', 'Тамара получила медаль, а Яша, как показывает практика, на самом деле не расстроился.');
queue = [{ verdict: 'edit', edits: { '2': edit2, '9': 'мусор', '1': 'коротко' }, fixed: ['вставил'] }];
r = await call(polish, { draft: full, constructId: 'open', topics: ['losing'], child: { age: 6 }, lang: 'ru', dossier, attempt: 1, maxAttempts: 3 });
t('редактор: правка части 2 применилась, мусорные ключи и обрубки нет', r.out.outcome === 'retry' && r.out.draft.panels[1] === edit2 && r.out.draft.panels[0] === SAMPLE.panels[0], JSON.stringify(r.out).slice(0, 200));
t('редактор: ремесленный провал просит ещё заход и возвращает уже правленый текст', r.out.craft.some(c => c.id === 'ai-tells'));

queue = [{ verdict: 'edit', edits: { '2': edit2 }, fixed: [] }];
r = await call(polish, { draft: full, constructId: 'open', topics: ['losing'], child: { age: 6 }, lang: 'ru', dossier, attempt: 3, maxAttempts: 3 });
t('редактор: на последнем заходе сказка выходит с пометками', r.out.outcome === 'ok' && r.out.flags.length > 0 && !r.out.clean);

const harmful = SAMPLE.panels[1] + ' Он хотел повеситься.';
queue = [{ verdict: 'edit', edits: { '2': harmful }, fixed: [] }];
r = await call(polish, { draft: full, constructId: 'open', topics: ['losing'], child: { age: 6 }, lang: 'ru', dossier, attempt: 3, maxAttempts: 3 });
t('редактор: способ самоповреждения вырезается, сказка всё равно выходит', r.out.outcome === 'ok' && !r.out.story.panels.join(' ').includes('повеситься') && r.out.scrubbed.length === 1 && r.out.story.panels[5].endsWith(CLOSING_RU), JSON.stringify(r.out).slice(0, 300));
queue = [{ verdict: 'edit', edits: { '2': harmful }, fixed: [] }];
r = await call(polish, { draft: full, constructId: 'open', topics: ['losing'], child: { age: 6 }, lang: 'ru', dossier, attempt: 1, maxAttempts: 3 });
t('редактор: на первом заходе то же просит переписать, а не отменяет', r.out.outcome === 'retry' && r.out.craft.some(c => c.id === 'self-harm-method'));
const bodyTale = SAMPLE.panels[1] + ' Соня весила больше всех в классе, и физрук знал это точно: тридцать шесть килограммов.';
queue = [{ verdict: 'edit', edits: { '2': bodyTale }, fixed: [] }];
r = await call(polish, { draft: full, constructId: 'open', topics: ['losing'], child: { age: 6 }, lang: 'ru', dossier, attempt: 3, maxAttempts: 3 });
t('редактор: слова про вес и килограммы не отменяют сказку', r.out.outcome === 'ok' && r.out.story.panels[1].includes('килограммов'));

queue = [{ panels: full.panels, questions: full.questions }];
r = await call(polish, { draft: full, constructId: 'open', topics: [], child: { age: 6 }, lang: 'ru', attempt: 1, maxAttempts: 3 });
t('прежний формат редактора (целые panels) и отсутствие досье работают', r.out.outcome === 'ok');

console.log(`\n${ok} прошло, ${bad} провалено`);
process.exit(bad ? 1 : 0);
