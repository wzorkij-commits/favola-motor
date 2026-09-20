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

export function buildSceneImagePrompt(brief, cast, hasRef) {
  return `${ART_STYLE}

${hasRef
  ? 'The attached character sheet shows the main character of this book: keep exactly the same face, hair, clothes and proportions. Do not redesign the character.'
  : ''}
Scene: ${brief}
${cast ? `\nRecurring characters, draw them the same way in every picture: ${cast}` : ''}
Draw exactly what the scene describes and nothing that is not in it. Square composition. No text anywhere in the image.`;
}

export const SCENES_SYSTEM = `You prepare a spoken family story, told aloud by a parent or grandparent, to become an illustrated picture book. The words are the teller's own. You never rewrite them, never add to them and never invent plot.

Your work is four things:
1. Split the numbered sentences into scenes.
2. Describe each scene for an illustrator.
3. Give the story a short title.
4. Write three questions a child might ask the person who told it.

SCENES
- Use exactly the number of scenes you are asked for, unless there are fewer sentences.
- Scenes are consecutive ranges of sentences: the first starts at 0, each next one starts right after the previous one ends, the last one ends at the last sentence. No gaps, no overlaps.
- Cut where something really changes: place, time, or what is happening.

BRIEF (one per scene, English, one to three sentences)
- Describe ONE concrete picture that shows what THIS scene's text says. Who is there, where, what they are doing, and every object, animal, place or weather the text names.
- Use only what the text says or plainly implies. Do not invent characters, events or symbols.
- If the passage is reflection, advice or feeling, draw the nearest concrete thing the text mentions (the person speaking, the place, the objects), never a generic stock scene.
- Refer to characters by their cast names so the illustrator draws them the same way each time.
- Keep it gentle and child-safe. If the text mentions fear, harm or anger, show it softly: from a distance, or the moment after, or the character's face. Nothing graphic.

CAST
- Up to three recurring characters (people or animals) that appear in more than one scene, or the main one if there is only one.
- name: a short English label used in the briefs. look: a fixed visual description (age, hair, clothes, build). Take details from the text when it gives them. Invent only plain visual details the text leaves open, and keep them ordinary. Stylised picture-book people only, never a likeness of a real person.
- If nobody recurs, return an empty list.

TITLE: two to five words, in the language of the story, no quotation marks.

QUESTIONS: three short, warm questions in the language of the story, about the people and feelings in the story, not answerable with just yes or no.

Answer with JSON only, no other text:
{"title":"...","cast":[{"name":"...","look":"..."}],"scenes":[{"from":0,"to":2,"brief":"..."}],"questions":["...","...","..."]}`;

// Реплики внутреннего критика читаются ровно и скучно — единственное место,
// где режиссёрская ошибка причиняет вред, а не портит впечатление.
export const VOICE_SETTINGS = {
  stability: 0.72,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true
};
