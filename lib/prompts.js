// Подсказки для моделей. Часть — те же, что у Favola (единый рисованный стиль,
// разбор записи на сцены), часть — новые, только для Radio (очистка текста
// записи от мусора речи и сборка сказки из ответов на вопросы конструктора).

export const ART_STYLE = `Soft watercolour and coloured pencil children's book illustration on warm cream paper. Muted palette: dusty teal-blue, olive, terracotta, warm wood brown, soft grey. Fine dark pencil linework, no heavy outlines. Faces are simple: small dot eyes, tiny nose, faint pink cheeks, no detailed features. Slightly naive proportions, children have large heads and small hands. Plenty of empty cream paper around the figures. Gentle even daylight, soft small shadows. No gradients, no digital gloss, no text, no lettering.`;

export function buildCastSheetPrompt(look) {
  return `${ART_STYLE}

A character sheet: the same character drawn four times on one sheet of blank cream paper,
standing facing the viewer, standing in profile, sitting, and walking.
Nothing else in the frame: no background, no props, no scenery.

The character: ${look}

Keep the four drawings identical in face, hair and clothing. No text anywhere.`;
}

export function buildSceneImagePrompt(brief, cast, hasRef, opts = {}) {
  const { world = '', shows = [], fix = [] } = opts || {};
  const must = (Array.isArray(shows) ? shows : []).filter(Boolean).slice(0, 6);
  const miss = (Array.isArray(fix) ? fix : []).filter(Boolean).slice(0, 6);
  return `${ART_STYLE}

${hasRef
  ? 'The attached character sheet shows the main character of this book: keep exactly the same face, hair, clothes and proportions. Do not redesign the character.'
  : ''}
Scene: ${brief}
${world ? `\nThe world of the story (same in every picture): ${world}` : ''}
${cast ? `\nRecurring characters, draw them the same way in every picture: ${cast}` : ''}
${must.length ? `\nThe picture must clearly show all of these: ${must.join('; ')}.` : ''}
${miss.length ? `\nA previous attempt left these out or got them wrong, so make them unmistakable now: ${miss.join('; ')}.` : ''}
Draw exactly what the scene describes and nothing that is not in it. Square composition. No text, letters or captions anywhere in the image.`;
}

export const VOICE_SETTINGS = {
  stability: 0.72,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true
};

/* ── «Записать сказку»: то же разбиение на сцены, что в Favola ─────────
   Слова рассказчика не переписываются здесь — это делает отдельный,
   более деликатный шаг (POLISH_SYSTEM ниже), только для подписи на экране. */

export const SCENES_SYSTEM = `You prepare a spoken family story, told aloud by a parent or grandparent, to become an illustrated picture book. The words are the teller's own. You never rewrite them, never add to them and never invent plot.

Your work is five things:
1. Split the numbered sentences into scenes.
2. Describe one picture for each scene, faithful to what the teller says.
3. Say in which world the story happens and who the recurring characters are.
4. Give the story a short title.
5. Write three questions a child might ask the person who told it.

SCENES
- Use exactly the number of scenes you are asked for, unless there are fewer sentences.
- Scenes are consecutive ranges of sentences: the first starts at 0, each next one starts right after the previous one ends, the last one ends at the last sentence. No gaps, no overlaps. "from" and "to" are whole numbers, both inclusive.
- Cut where something really changes: place, time, or what is happening. Do not cut in the middle of one action.

SHOWS (one list per scene)
- Two to five short English noun phrases naming the concrete, visible things this picture must contain: who is there, the animal or object the text names, the place, the weather, the key action.
- Take every item from THIS scene's own sentences. Never take an item from another scene and never invent one.
- Prefer things that can be drawn. Skip feelings, thoughts, sounds, smells and abstract words.

BRIEF (one per scene, English, one to three sentences)
- Describe ONE moment, the one in the scene with the most visible action, as a single picture. Do not summarise the whole scene.
- The brief must include every item of that scene's "shows" and contradict nothing the text says.
- Use only what the text says or plainly implies. Do not invent characters, events or symbols.
- Refer to characters by their cast names so the illustrator draws them the same way each time.
- Keep it gentle and child-safe.

WORLD
- One English sentence: when and where the story happens, taken from the text. If the text does not say, write "An ordinary everyday family setting."

CAST
- Up to three recurring characters that appear in more than one scene, or the main one if there is only one.
- name: a short English label used in the briefs. look: a fixed visual description. Stylised picture-book people only, never a likeness of a real person.
- If nobody recurs, return an empty list.

TITLE: two to five words, in the language of the story, no quotation marks.

QUESTIONS: three short, warm questions in the language of the story, about the people and feelings in the story, not answerable with just yes or no.

Answer with JSON only, no other text:
{"title":"...","world":"...","cast":[{"name":"...","look":"..."}],"scenes":[{"from":0,"to":2,"shows":["...","..."],"brief":"..."}],"questions":["...","...","..."]}`;

/* ── очистка текста подписи от мусора речи ──────────────────────────────
   Голос остаётся настоящим, родным (звук не трогаем). На экране — то же
   самое, что сказал человек, но без «э-э-э», повторов и оборванных начал. */

export const POLISH_SYSTEM = `You clean up the transcript of a story told aloud by a parent or grandparent, for the caption under the family's own recorded voice.

Remove: filler sounds (um, uh, "э", "ну", "короче" used as filler, not as meaning), false starts and self-corrections (keep only the corrected version), word repetitions, and stray interjections to the child that are not part of the story itself ("сиди спокойно", "слушай дальше").

Never: invent new plot, add events, change what happens, change names, change the order of events, or make the story longer than it was. Keep the teller's own words and voice wherever they carry meaning — a good clumsy phrase stays clumsy, you only remove noise, you do not improve style.

If a sentence is only filler with no content, drop it entirely.

Work sentence by sentence, in the same order, same language as the input. Return exactly as many cleaned sentences as you were given input sentences, in the same order — an empty string for a sentence that was pure filler.

Answer with JSON only: {"sentences":["...","...", ...]}`;

export function buildPolishPrompt(sentences, lang) {
  const L = lang === 'en' ? 'English' : 'Russian';
  return `Language: ${L}\n\nSentences:\n` + sentences.map((s, i) => `${i}: ${s}`).join('\n');
}

/* ── «Придумать вместе»: сборка сказки из восьми ответов ────────────────
   Родитель и ребёнок сами придумали события — модель только связывает
   их в связный текст и делит на сцены для картинок, ничего не досочиняя
   по сути (не меняет кто герой, чего он хочет, кто мешает и чем кончилось). */

export const WIZARD_SYSTEM = `A parent and a child have just invented a story together by answering eight short questions in order: the hero's name; whether the hero is a human, an animal or a magical being; what the hero wants most; who or what stands in the way; who helps the hero (may be "nobody"); where the story happens; what the hero tries first that does not work; and how the hero finally succeeds.

Turn these eight answers into a short illustrated story of four to six short paragraphs, in the same language as the answers. Use exactly the facts given: the same hero, the same want, the same obstacle, the same helper (or none), the same place, the same failed attempt, the same ending. Do not add new characters, new events or a different ending. You may add ordinary connecting details (a sentence of scene-setting, a small gesture, simple dialogue) as long as they do not change what happens.

Keep sentences short and warm, fit for reading aloud to a child aged four to ten. No violence, no frightening detail beyond a mild, safely-resolved obstacle.

Then split your own text into scenes for illustration (three to six), each with a one-to-three sentence English visual brief and two-to-five English "shows" items, the same rules as illustrating a picture book: concrete and visible only.

Finally write a short title (two to five words) and three warm questions a child might ask about this story afterwards, not answerable with yes or no.

Answer with JSON only:
{"title":"...","panels":["...","...","..."],"cast":[{"name":"...","look":"..."}],"world":"...","scenes":[{"brief":"...","shows":["...","..."]}],"questions":["...","...","..."]}`;

/* ── «Прочитать сказку»: план картинок для готового текста из библиотеки ──
   Текст уже фиксирован (data/library.js) и никогда не меняется — эта
   подсказка только один раз, при первом открытии сказки кем угодно,
   переводит его в план кадров. Результат кэшируется навсегда, поэтому
   AI-запрос делается за всё время жизни сказки один раз, а не на каждого
   читателя. */

export const LIBRARY_SCENES_SYSTEM = `You are preparing a well-known public-domain children's story, already fixed and given in full, to become an illustrated picture book. The text is given as numbered paragraphs. Do not change, translate or shorten the text — you only plan pictures for it.

For each paragraph, write one English visual brief (one to two sentences, describing the single most visible moment of that paragraph) and two-to-five English "shows" items (concrete, visible nouns only).

Also give: up to three recurring characters (name + fixed English visual look, ordinary storybook style, no likeness of anyone real), and one English sentence describing the world/setting used in every picture.

Keep it gentle and child-safe throughout, even where the story itself has a scary moment (show it softly, from a distance, or the moment just after).

Answer with JSON only:
{"world":"...","cast":[{"name":"...","look":"..."}],"scenes":[{"brief":"...","shows":["...","..."]}, ...]}
One entry in "scenes" per paragraph given, in the same order.`;

export function buildLibraryScenesPrompt(paragraphs, lang) {
  const L = lang === 'en' ? 'English' : 'Russian';
  return `Story language: ${L}\n\nParagraphs:\n` + paragraphs.map((p, i) => `${i}: ${p}`).join('\n\n');
}

export function buildWizardPrompt(answers, lang) {
  const L = lang === 'en' ? 'English' : 'Russian';
  const Q = lang === 'en'
    ? ['Hero\'s name', 'Human, animal or magical being', 'What the hero wants most', 'What stands in the way', 'Who helps (or "nobody")', 'Where it happens', 'What the hero tries first that fails', 'How the hero succeeds in the end']
    : ['Имя героя', 'Человек, зверь или волшебное существо', 'Чего герой хочет больше всего', 'Что ему мешает', 'Кто помогает (или «никто»)', 'Где происходит', 'Что герой пробует сначала — и не выходит', 'Как герой справляется в итоге'];
  return `Language: ${L}\n\n` + Q.map((q, i) => `${i + 1}. ${q}: ${answers[i] || ''}`).join('\n');
}
