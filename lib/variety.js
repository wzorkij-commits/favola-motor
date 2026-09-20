// Разнообразие. Модель, которую просят «придумай заново», придумывает одно и то же
// (Даша, Тим, шкаф, бабушка-мастер). Поэтому имена, тип помощника, способ начать и
// приём юмора выбирает код, а не модель. Модели остаётся выбрать из короткого списка.
//
// С версии 3 Библии к этому добавлен рецепт (lib/recipe.js): девять осей формы, голоса,
// юмора, входа помощника, закладки, финала и места. Прежние поля form, opening и humor
// остаются для совместимости, но когда рецепт есть, писатель видит только его.

import { pickRecipe } from './recipe.js';

const NAMES = {
  ru: {
    f: ['Аглая', 'Варя', 'Зоя', 'Лиза', 'Мира', 'Ульяна', 'Фрося', 'Юля', 'Тася', 'Рита', 'Стеша', 'Алёна', 'Ася', 'Полина', 'Клава', 'Маруся', 'Вера', 'Ляля', 'Глаша', 'Эля'],
    m: ['Гоша', 'Ефим', 'Тёма', 'Кирилл', 'Лёва', 'Митя', 'Назар', 'Паша', 'Родион', 'Сеня', 'Тимур', 'Федя', 'Егор', 'Дима', 'Аркаша', 'Боря', 'Филипп', 'Юра', 'Вадик', 'Ерёма']
  },
  en: {
    f: ['Maisie', 'Ivy', 'Nell', 'Tamsin', 'Poppy', 'Edie', 'Wren', 'Hattie', 'Lottie', 'Ruby', 'Freya', 'Nora', 'Bea', 'Jess', 'Mabel', 'Pippa'],
    m: ['Alfie', 'Otis', 'Felix', 'Rory', 'Ned', 'Barnaby', 'Jasper', 'Hugo', 'Stanley', 'Albie', 'Milo', 'Ozzy', 'Archie', 'Louie', 'Kit', 'Fergus']
  }
};

// Имена, которые уже жили в историях и в образце. Не предлагаем и просим не брать.
export const USED_NAMES = ['Даша', 'Кьяра', 'Тим', 'Ника', 'Соня', 'Нина Сергеевна', 'мистер Белл', 'Яша', 'Тамара', 'Миша', 'Костя'];

const HELPERS = {
  ru: [
    'ровесник, который сам так делает и говорит об этом как о пустяке',
    'старший брат или сестра лет десяти-двенадцати, у которых свои дела и мало времени',
    'сосед или соседка по лестничной клетке, занятые чем-то своим (чинят, красят, поливают)',
    'человек за прилавком, за рулём или за стойкой, который видел таких много',
    'дедушка или бабушка, но не мастер и не мудрец, а человек посреди хлопот',
    'самый младший в компании, четырёхлетка, который говорит невпопад и попадает точно',
    'тренер, вожатый или воспитатель, который бросает совет мимоходом и уходит',
    'старая вещь или домашнее животное только если герою до шести лет и мир допускает разговор',
    'кто-то, кого герой считал противником, и теперь оказалось, что у него так же'
  ],
  en: [
    'a same-age kid who does this too and mentions it like it is nothing',
    'an older brother or sister of ten or twelve with their own things to do',
    'a neighbour on the landing busy with something of their own (mending, painting, watering)',
    'someone behind a counter, a wheel or a desk who has seen plenty of kids like this',
    'a grandparent, but not a sage: someone in the middle of chores',
    'the youngest in the group, a four-year-old who speaks at random and hits the mark',
    'a coach, a camp leader or a teacher who tosses out advice on the way past',
    'an old object or a household animal only if the hero is under six and the world allows talking',
    'someone the hero took for an opponent who turns out to have it the same way'
  ]
};

const OPENINGS = {
  ru: [
    'с точной цифры или списка (что лежит в кармане, сколько ступенек, сколько раз)',
    'с реплики, брошенной посреди разговора',
    'с правила, которое герой сам придумал и строго соблюдает',
    'со звука',
    'с того, что герой делает руками прямо сейчас',
    'с предмета, который потом вернётся',
    'с короткого честного признания рассказчика про героя'
  ],
  en: [
    'with an exact number or a list (what is in the pocket, how many steps, how many times)',
    'with a line thrown in the middle of a conversation',
    'with a rule the hero made up and keeps strictly',
    'with a sound',
    'with what the hero is doing with their hands right now',
    'with an object that will come back later',
    'with a short honest confession from the narrator about the hero'
  ]
};

const HUMOR = {
  ru: [
    'детская серьёзность: герой рассуждает о пустяке как о государственном деле',
    'тройка с обрывом: два повтора и третий, который ломает ритм',
    'буквальное понимание: слова взрослых понимаются в прямом смысле',
    'точная придуманная цифра или список',
    'возвращение шутки: то, что было смешно в начале, возвращается в конце с другим смыслом',
    'взрослый, который очень уверен и слегка не прав',
    'невпопад сказанная правда от самого младшего'
  ],
  en: [
    'child seriousness: the hero reasons about a trifle like a matter of state',
    'the rule of three with a break: two repeats and a third that breaks the rhythm',
    'literal understanding: what grown-ups say is taken at face value',
    'an exact made-up number or a list',
    'callback: what was funny at the start comes back at the end with a different meaning',
    'a grown-up who is very sure and slightly wrong',
    'a truth said out of turn by the youngest'
  ]
};

const FORMS = {
  young: {
    ru: 'От третьего лица, короткими фразами. Один припев из трёх-шести слов, который возвращается три раза и в конце меняется. Много глаголов и звуков, мало придаточных.',
    en: 'Third person, short sentences. One refrain of three to six words that comes back three times and changes at the end. Plenty of verbs and sounds, few subordinate clauses.'
  },
  middle: [
    { ru: 'От третьего лица, близко к герою. Много живых диалогов. Комизм в серьёзности героя.', en: 'Third person, close to the hero. Plenty of lively dialogue. The comedy is in the hero\'s seriousness.' },
    { ru: 'От первого лица: герой сам рассказывает, что с ним было, по-детски точно и с юмором, как в «Денискиных рассказах».', en: 'First person: the hero tells it himself or herself, with a child\'s precision and humour, in the manner of a funny schoolboy memoir.' }
  ],
  older: [
    { ru: 'От первого лица, с сухой иронией и точными деталями. Герой смешной там, где сам этого не замечает.', en: 'First person, with dry irony and exact details. The hero is funny where he or she does not notice it.' },
    { ru: 'От третьего лица, близко к герою, с ироничным рассказчиком, который на стороне героя.', en: 'Third person, close to the hero, with a wry narrator who is on the hero\'s side.' }
  ]
};

function pick(list, rnd) { return list[Math.floor(rnd() * list.length)]; }
function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * @param {{age?:number|null, lang?:'ru'|'en', gender?:'m'|'f'|'unknown', rnd?:()=>number,
 *          register?:string, topics?:string[], recent?:any[]}} o
 */
export function pickVariety({ age = null, lang = 'ru', gender = 'unknown', rnd = Math.random,
                              register = '', topics = [], recent = [] } = {}) {
  const L = lang === 'en' ? 'en' : 'ru';
  const pool = NAMES[L];
  let names;
  if (gender === 'm') names = shuffle(pool.m, rnd).slice(0, 5);
  else if (gender === 'f') names = shuffle(pool.f, rnd).slice(0, 5);
  else names = [...shuffle(pool.m, rnd).slice(0, 3), ...shuffle(pool.f, rnd).slice(0, 3)];

  let form;
  if (age != null && age <= 5) form = FORMS.young[L];
  else if (age != null && age >= 9) form = pick(FORMS.older, rnd)[L];
  else form = pick(FORMS.middle, rnd)[L];

  return {
    names,
    helper: pick(HELPERS[L], rnd),
    form,
    opening: pick(OPENINGS[L], rnd),
    humor: pick(HUMOR[L], rnd),
    recipe: pickRecipe({ age, register, topics, recent, rnd })
  };
}
