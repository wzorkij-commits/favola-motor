// Промпты сказки живут в lib/bible.js (Библия Favola v2).
// Здесь остальное: картинки, записанные сказки, голос.

export { BIBLE, BIBLE_VERSION, buildSystemPrompt, buildStoryPrompt, buildPolishPrompt,
         buildDossierPrompt, formatDossier } from './bible.js';

// Стилевой блок вставляется дословно — он утверждён на четырёх сказках.
export const ART_STYLE = `Soft watercolour and coloured pencil children's book illustration on warm cream paper. Muted palette: dusty teal-blue, olive, terracotta, warm wood brown, soft grey. Fine dark pencil linework, no heavy outlines. Faces are simple: small dot eyes, tiny nose, faint pink cheeks, no detailed features. Slightly naive proportions, children have large heads and small hands. Plenty of empty cream paper around the figures. Gentle even daylight, soft small shadows. No gradients, no digital gloss, no text, no lettering.`;

export function buildHeroSheetPrompt(look) {
  return `${ART_STYLE}

A character sheet: the same child drawn four times on one sheet of blank cream paper —
standing facing the viewer, standing in profile, sitting, and walking.
Nothing else in the frame: no background, no props, no scenery.

The child: ${look}

Keep the four drawings identical in face, hair and clothing. No text anywhere.`;
}

export function buildImagePrompt(brief, heroSheet, hasRef) {
  return `${ART_STYLE}

${hasRef
  ? 'Use the attached character sheet as the reference for the child: same face, same hair, same clothes, same proportions. Do not redesign the character.'
  : ''}
Scene: ${brief}
${heroSheet ? `\nThe child: ${heroSheet}` : ''}
Square composition. No text anywhere in the image.`;
}

// ── Записанная сказка: рисуем то, что действительно сказано ─────────────
// Здесь нет героя-ребёнка из грамматики. Действующие лица берутся из самого
// рассказа: «дед Матвей», «голуби», «двор». Их облик описывает модель один раз
// (cast), и он повторяется в каждом кадре дословно.

export function buildCastSheetPrompt(look) {
  return `${ART_STYLE}

A character sheet: the same character drawn four times on one sheet of blank cream paper,
standing facing the viewer, standing in profile, sitting, and walking.
Nothing else in the frame: no background, no props, no scenery.

The character: ${look}

Keep the four drawings identical in face, hair and clothing. No text anywhere.`;
}

/**
 * Кадр записанной сказки. Рисуется ровно то, что сказано в этих предложениях:
 * world держит эпоху и место одинаковыми во всех кадрах, shows перечисляет то,
 * что обязано быть на картинке, fix говорит, чего не хватило в прошлой попытке.
 */
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
- Two to five short English noun phrases naming the concrete, visible things this picture must contain: who is there, the animal or object the text names, the place, the weather, the key action. Example: ["small boy in a red jacket", "old man handing over a big iron key", "wooden pigeon loft", "wooden fence"].
- Take every item from THIS scene's own sentences. Never take an item from another scene and never invent one.
- Prefer things that can be drawn. Skip feelings, thoughts, sounds, smells and abstract words.

BRIEF (one per scene, English, one to three sentences)
- Describe ONE moment, the one in the scene with the most visible action, as a single picture. Do not summarise the whole scene.
- The brief must include every item of that scene's "shows" and contradict nothing the text says: numbers of people or animals, colours, sizes, time of day, weather, who does what to whom.
- Use only what the text says or plainly implies. Do not invent characters, events or symbols.
- If the passage is reflection, advice or feeling, draw the nearest concrete thing the text mentions (the person speaking, the place, the objects), never a generic stock scene.
- Refer to characters by their cast names so the illustrator draws them the same way each time.
- Keep it gentle and child-safe. If the text mentions fear, harm or anger, show it softly: from a distance, or the moment after, or the character's face. Nothing graphic.

WORLD
- One English sentence: when and where the story happens, taken from the text (country, era, kind of place, season). Example: "A small Soviet-era courtyard with a pigeon loft, late 1980s, summer." If the text does not say, write "An ordinary everyday family setting."

CAST
- Up to three recurring characters (people or animals) that appear in more than one scene, or the main one if there is only one.
- name: a short English label used in the briefs. look: a fixed visual description (age, hair, clothes, build). Take details from the text when it gives them. Invent only plain visual details the text leaves open, and keep them ordinary. Stylised picture-book people only, never a likeness of a real person.
- If nobody recurs, return an empty list.

TITLE: two to five words, in the language of the story, no quotation marks.

QUESTIONS: three short, warm questions in the language of the story, about the people and feelings in the story, not answerable with just yes or no.

Answer with JSON only, no other text:
{"title":"...","world":"...","cast":[{"name":"...","look":"..."}],"scenes":[{"from":0,"to":2,"shows":["...","..."],"brief":"..."}],"questions":["...","...","..."]}`;

// Проверка картинки против слов, которые она иллюстрирует.
export const IMAGE_JUDGE_SYSTEM = `You check one illustration for a children's picture book against the words it illustrates. Be strict and literal: an element counts as found only if it is clearly visible in the picture, not merely possible. Answer with JSON only.`;

export function buildImageJudgePrompt(text, shows) {
  const list = shows.map((x, i) => `${i + 1}. ${x}`).join('\n');
  return `The words the teller said for this picture:
"""${String(text).slice(0, 700)}"""

Required elements:
${list}

Look at the picture and answer:
- found: an array of ${shows.length} booleans in the same order, true only if that element is clearly visible.
- text_in_image: true if any readable text, letters, numbers, captions or watermarks appear.
- unsafe: true if anything is frightening, graphic or unsuitable for young children.
- contradicts: true if the picture clearly shows something that contradicts the words (wrong number of people or animals, wrong colour named in the words, wrong place or action).
- note: one short sentence, English, naming what is missing or wrong (empty string if all is well).

JSON only: {"found":[true],"text_in_image":false,"unsafe":false,"contradicts":false,"note":""}`;
}

// Реплики внутреннего критика читаются ровно и скучно — единственное место,
// где режиссёрская ошибка причиняет вред, а не портит впечатление.
export const VOICE_SETTINGS = {
  stability: 0.72,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true
};
