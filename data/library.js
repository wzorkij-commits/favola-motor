// «Прочитать сказку»: короткие тексты без прав, для чтения вслух с телесуфлёром.
//
// Это не сканы конкретных изданий, а собственный, короткий пересказ народных
// сюжетов — сами сюжеты (сказка целиком, кто действует, что происходит) очень
// старые и никому не принадлежат. Ниже у каждой сказки указано, откуда взят
// сюжет и почему на него нет прав — на случай если это спросят.
//
//   ru: русские народные сказки, сюжеты — из сборника «Народные русские
//       сказки», который в XIX веке собрал Александр Афанасьев (1826-1871).
//       Сам Афанасьев умер больше ста пятидесяти лет назад, а сказки —
//       безымянный фольклор, старше любого авторского права.
//   en: три сказки собраны и изданы Джозефом Джейкобсом (Joseph Jacobs,
//       1854-1916) в книге «English Fairy Tales» (1890) — с тех пор прошло
//       больше ста тридцати лет; две — совсем безымянный американский и
//       английский фольклор без единого автора; две — басни Эзопа, которым
//       две с половиной тысячи лет.
//
// estMinutes — на глаз, по счёту слов при спокойном чтении вслух.

export const LIBRARY = [
  {
    id: 'ru-repka',
    lang: 'ru',
    title: 'Репка',
    source: 'русская народная сказка, сюжет из сборника А. Н. Афанасьева',
    estMinutes: 2,
    text: `Посадил дед репку. Выросла репка большая-пребольшая.

Пошёл дед репку тянуть: тянет-потянет, вытянуть не может.

Позвал дед бабку. Бабка за дедку, дедка за репку — тянут-потянут, вытянуть не могут.

Позвала бабка внучку. Внучка за бабку, бабка за дедку, дедка за репку — тянут-потянут, вытянуть не могут.

Позвала внучка Жучку. Жучка за внучку, внучка за бабку, бабка за дедку, дедка за репку — тянут-потянут, вытянуть не могут.

Позвала Жучка кошку. Кошка за Жучку, Жучка за внучку, внучка за бабку, бабка за дедку, дедка за репку — тянут-потянут, вытянуть не могут.

Позвала кошка мышку. Мышка за кошку, кошка за Жучку, Жучка за внучку, внучка за бабку, бабка за дедку, дедка за репку — тянут-потянут — и вытянули репку!`
  },
  {
    id: 'ru-kurochka-ryaba',
    lang: 'ru',
    title: 'Курочка Ряба',
    source: 'русская народная сказка, сюжет из сборника А. Н. Афанасьева',
    estMinutes: 1,
    text: `Жили-были дед да баба. Была у них курочка Ряба.

Снесла курочка яичко, да не простое — золотое.

Дед бил-бил — не разбил. Баба била-била — не разбила.

Бежала мышка, хвостиком махнула, яичко упало и разбилось.

Дед плачет, баба плачет, а курочка кудахчет:

— Не плачь, дед, не плачь, баба. Снесу вам яичко другое, не золотое — простое.`
  },
  {
    id: 'ru-kolobok',
    lang: 'ru',
    title: 'Колобок',
    source: 'русская народная сказка, сюжет из сборника А. Н. Афанасьева',
    estMinutes: 3,
    text: `Жили-были старик со старухой. Просит старик: «Испеки, старуха, колобок». Наскребла старуха муки, замесила тесто, испекла колобок и положила на окошко студиться.

Полежал колобок, полежал, взял да и покатился — с окна на лавку, с лавки на пол, да в дверь, через порог — да на улицу.

Катится колобок по дороге, а навстречу ему заяц:
— Колобок, колобок, я тебя съем!
— Не ешь меня, косой заяц, я тебе песенку спою, — сказал колобок и спел:
«Я колобок, колобок, по амбару метён, по сусекам скребён, на сметане мешён, в печку сажён, на окошке стужён. Я от дедушки ушёл, я от бабушки ушёл, а от тебя, зайца, и подавно уйду!»
И покатился дальше — только заяц его и видел.

Катится колобок, а навстречу ему волк:
— Колобок, колобок, я тебя съем!
Колобок спел свою песенку и покатился дальше.

Катится колобок, а навстречу ему медведь:
— Колобок, колобок, я тебя съем!
Колобок спел свою песенку и покатился дальше.

Катится колобок, а навстречу ему лиса:
— Колобок, колобок, куда катишься?
Колобок запел свою песенку, а лиса и говорит:
— Какая хорошая песенка, да я стара стала, плохо слышу. Сядь ко мне на носок да спой ещё разок.

Колобок сел лисе на нос и запел снова, а лиса — ам! — и съела его.`
  },
  {
    id: 'ru-teremok',
    lang: 'ru',
    title: 'Теремок',
    source: 'русская народная сказка, сюжет из сборника А. Н. Афанасьева',
    estMinutes: 3,
    text: `Стоит в поле теремок. Бежит мимо мышка-норушка, увидела теремок и спрашивает:
— Терем-теремок! Кто в тереме живёт?
Никто не отзывается. Вошла мышка в теремок и стала там жить.

Прискакала лягушка-квакушка:
— Терем-теремок! Кто в тереме живёт?
— Я, мышка-норушка. А ты кто?
— Я, лягушка-квакушка.
— Иди ко мне жить!
Стали жить вдвоём.

Прибежал зайчик-побегайчик, потом лисичка-сестричка, потом волчок-серый бочок — и каждый спрашивал то же самое, и каждого пускали жить. Стало их пятеро.

Вдруг идёт мимо медведь косолапый, увидел теремок и заревел:
— Терем-теремок! Кто в тереме живёт?
Ему отвечают все звери по очереди.
— И я к вам хочу! — сказал медведь и полез на крышу.

Затрещал теремок, упал набок — и рассыпался.

Успели все выскочить целые и невредимые — мышка-норушка, лягушка-квакушка, зайчик-побегайчик, лисичка-сестричка, волчок-серый бочок. А медведь почесал за ухом и пошёл помогать им строить новый теремок, ещё лучше прежнего.`
  },
  {
    id: 'ru-gusi-lebedi',
    lang: 'ru',
    title: 'Гуси-лебеди',
    source: 'русская народная сказка, сюжет из сборника А. Н. Афанасьева',
    estMinutes: 4,
    text: `Жили муж да жена, и была у них дочка да маленький сынок. Собрались родители в город и наказали дочке:
— Смотри за братцем, со двора не ходи, будем мы в городе — купим тебе платочек.

Ушли родители, а дочка забыла про наказ, посадила братца на травке и убежала играть с подружками. Прилетели гуси-лебеди, подхватили мальчика и унесли на крыльях.

Вернулась девочка, а братца нет. Ахнула она и побежала искать.

Бежит, а навстречу ей печка:
— Печка, печка, скажи, куда гуси-лебеди полетели?
— Съешь моего ржаного пирожка — скажу.
Девочка была разборчива, не съела и побежала дальше.

Так спрашивала она у яблони и у молочной реки с кисельными берегами, и каждый раз просили её сперва отведать угощения, а она отказывалась и бежала дальше.

Долго бежала девочка и увидела наконец избушку на курьих ножках. В избушке сидела баба-яга, а братец играл у неё серебряными яблочками. Улучила девочка минутку, схватила братца и побежала домой.

Гуси-лебеди пустились в погоню. Девочка снова прибежала к молочной реке, к яблоне, к печке — и на этот раз, чтобы спастись, отведала и киселька, и яблочка, и пирожка, и они спрятали её с братцем и не выдали гусям-лебедям.

Прибежала девочка домой с братцем как раз перед возвращением родителей. С тех пор она уже не забывала, что обещала.`
  },
  {
    id: 'ru-lisa-i-zhuravl',
    lang: 'ru',
    title: 'Лиса и журавль',
    source: 'русская народная сказка, сюжет из сборника А. Н. Афанасьева',
    estMinutes: 2,
    text: `Подружились лиса с журавлём и решили в гости друг к другу ходить.

Позвала лиса журавля на обед, наварила манной каши и размазала по тарелке. Журавль клювом стучал-стучал, ничего не попадало — а лиса сама всё слизала.
— Не обессудь, куманёк, больше потчевать нечем, — говорит лиса.
Журавль ушёл голодным.

Позвал журавль лису к себе в гости. Наварил окрошки, налил в кувшин с узким горлышком.
— Кушай, кумушка, не побрезгуй.
Лиса вертелась-вертелась вокруг кувшина, а достать угощение никак не могла.

Так и разошлись друзья ни с чем: как аукнется, так и откликнется.`
  },
  {
    id: 'en-three-little-pigs',
    lang: 'en',
    title: 'The Three Little Pigs',
    source: 'English folk tale, plot as collected by Joseph Jacobs, "English Fairy Tales" (1890)',
    estMinutes: 4,
    text: `Once there were three little pigs who left home to seek their fortune. The first pig built his house of straw, because it was the quickest. The second pig built his house of sticks, a little sturdier. The third pig worked hard and built his house of bricks.

One day a wolf came along and knocked at the first pig's door. "Little pig, little pig, let me come in," he said. "No, no, not by the hair of my chinny chin chin," said the pig. So the wolf huffed and puffed and blew the house in, and the little pig ran to his brother's house of sticks.

The wolf followed and knocked at the door of sticks. "Little pig, little pig, let me come in." "No, no, not by the hair of my chinny chin chin." So the wolf huffed and puffed and blew that house in too, and both pigs ran to their brother's house of bricks.

The wolf came to the house of bricks and knocked. "Little pig, little pig, let me come in." "No, no, not by the hair of my chinny chin chin." So the wolf huffed, and he puffed, and he puffed, and he huffed, but he could not blow the brick house in.

The wolf tried to trick the pigs into coming out — inviting them to a turnip field, an apple tree, a fair — but the clever pigs always went earlier than promised and got safely home before the wolf could catch them.

At last the wolf climbed onto the roof to come down the chimney. But the third pig had a big pot of water boiling on the fire, and took the lid off just in time. Down came the wolf, right into the pot, and that was the end of him.

And the three little pigs lived happily ever after in the house of bricks.`
  },
  {
    id: 'en-henny-penny',
    lang: 'en',
    title: 'Henny Penny',
    source: 'English folk tale, as collected by Joseph Jacobs, "English Fairy Tales" (1890)',
    estMinutes: 3,
    text: `One day Henny Penny was picking up corn in the yard when — whack! — something hit her on the head. "Goodness gracious me!" said Henny Penny. "The sky's a-going to fall. I must go and tell the king."

So she went along and met Cocky Locky. "Where are you going, Henny Penny?" "I'm going to tell the king the sky's a-falling." "May I come with you?" "Certainly," said Henny Penny, and off they went together.

Soon they met Ducky Daddles, then Goosey Poosey, then Turkey Lurkey — and each one asked the same question, and each one joined the little parade, all going to tell the king the sky was falling.

Then they met Foxy Loxy. "Where are you going?" asked Foxy Loxy, very politely. "We're going to tell the king the sky's a-falling." "Ah," said Foxy Loxy, "come this way — I know a shortcut through my den."

One by one, as they went into the dark den, Foxy Loxy snapped them up — Turkey Lurkey, Goosey Poosey, Ducky Daddles, Cocky Locky, and last of all, poor Henny Penny.

And so the king never did hear that the sky was falling — and it wasn't falling at all, of course. It had only been an acorn.`
  },
  {
    id: 'en-little-red-hen',
    lang: 'en',
    title: 'The Little Red Hen',
    source: 'traditional English and American folk tale, no known author',
    estMinutes: 3,
    text: `Once there was a little red hen who lived in a farmyard with a lazy dog, a lazy cat, and a lazy duck. One day the little red hen found some grains of wheat.

"Who will help me plant this wheat?" she asked. "Not I," said the dog. "Not I," said the cat. "Not I," said the duck. "Then I will do it myself," said the little red hen, and she did.

When the wheat had grown tall and golden, she asked, "Who will help me cut this wheat?" "Not I," said the dog. "Not I," said the cat. "Not I," said the duck. "Then I will do it myself," said the little red hen, and she did.

She asked who would help carry the wheat to the mill, and who would help bake it into bread, and every time the dog, the cat, and the duck said, "Not I" — and every time the little red hen did the work herself.

At last the bread was baked, warm and golden, and its smell filled the farmyard. "Who will help me eat this bread?" asked the little red hen. "I will!" said the dog. "I will!" said the cat. "I will!" said the duck.

"No," said the little red hen. "I planted it myself, I cut it myself, I carried it myself, and I baked it myself. Now my chicks and I will eat it ourselves." And she did, sharing it happily with her own little chicks.`
  },
  {
    id: 'en-gingerbread-man',
    lang: 'en',
    title: 'The Gingerbread Man',
    source: 'traditional American folk tale, no known author',
    estMinutes: 3,
    text: `An old woman baked a gingerbread man and set him on the windowsill to cool. But as soon as she turned around, he jumped down and ran out the door.

"Stop, stop!" cried the old woman and the old man, but the gingerbread man only laughed and called back, "Run, run, as fast as you can, you can't catch me, I'm the gingerbread man!" And he ran on down the road.

He ran past a cow, who tried to catch him. He ran past a horse, who tried to catch him too. Each time he called out his little rhyme and ran on, faster than anyone could follow.

At last he came to a wide river. On the bank sat a sly fox. "I cannot swim across," said the gingerbread man, worried at last. "Climb on my tail," said the fox, "and I will carry you across."

The gingerbread man climbed on. Partway across, the fox said, "Climb onto my back, or you'll get wet." Then, "Climb onto my nose, the water is getting deep."

When the gingerbread man had climbed all the way up onto the fox's nose, the fox tossed him into the air, opened his mouth — and snap! That was the end of the gingerbread man, who had outrun everyone except the one who never chased him at all.`
  },
  {
    id: 'en-tortoise-and-hare',
    lang: 'en',
    title: 'The Tortoise and the Hare',
    source: "Aesop's fable, ancient Greek folk tradition",
    estMinutes: 2,
    text: `A hare was once boasting about how fast he could run, and laughed at the tortoise for being so slow. "Let's have a race and see," said the tortoise quietly.

The animals agreed on a course, and off they went. The hare shot ahead so quickly that he was soon far out of sight. Feeling sure of winning, he decided to lie down under a tree and rest a while before finishing.

But the hare slept far longer than he meant to. Meanwhile the tortoise kept walking, slowly and steadily, one small step after another, never stopping and never hurrying.

When the hare woke up, he ran as fast as he could to the finish line — but the tortoise was already there, resting comfortably.

Slow and steady wins the race.`
  },
  {
    id: 'en-fox-and-crow',
    lang: 'en',
    title: 'The Fox and the Crow',
    source: "Aesop's fable, ancient Greek folk tradition",
    estMinutes: 2,
    text: `A crow was sitting on a branch with a fine piece of cheese in her beak. A fox passing below saw her and thought of a plan to get it for himself.

"Good day, beautiful crow," said the fox. "What glossy feathers you have, what a fine shape — I'm sure your voice must be just as lovely. Won't you sing for me?"

Flattered, the crow opened her beak to show off her voice — and the cheese fell straight down to the fox, who caught it neatly and gobbled it up.

"That will do," said the fox, walking away satisfied. "Next time, remember: don't trust flattery."`
  }
];

export function libraryList(lang) {
  return LIBRARY
    .filter(s => !lang || s.lang === lang)
    .map(s => ({ id: s.id, lang: s.lang, title: s.title, estMinutes: s.estMinutes }));
}

export function libraryOne(id) {
  return LIBRARY.find(s => s.id === id) || null;
}
