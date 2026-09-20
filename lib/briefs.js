// Шесть кадров для иллюстраций. Модель иногда забывает их вернуть, пишет меньше шести,
// возвращает объектом или пустые строки. Сказка от этого не должна ломаться:
// недостающие кадры собираются из самого текста частей.

const flat = (p) => Array.isArray(p) ? p.map(flat).filter(Boolean).join('; ')
  : (p && typeof p === 'object') ? Object.values(p).map(flat).filter(Boolean).join('; ')
  : String(p == null ? '' : p);

// Первые предложения части, не длиннее max знаков и без обрыва посреди слова.
function lead(text, max = 260) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('… '));
  return end > 80 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

export function ensureBriefs(briefs, { panels = [], hero = '', lang = 'ru' } = {}) {
  let list = briefs;
  if (list && !Array.isArray(list) && typeof list === 'object') list = Object.values(list);
  if (!Array.isArray(list)) list = [];
  const out = list.map(flat).map(s => s.trim()).slice(0, 6);
  const who = String(hero || '').trim();
  const en = lang === 'en';
  for (let i = 0; i < 6; i++) {
    if (out[i] && out[i].length >= 3) continue;
    if (i < 5 && panels[i] && String(panels[i]).trim()) {
      out[i] = (en ? 'A quiet picture-book illustration of this moment' : 'Спокойная иллюстрация к детской книге про этот момент')
        + (who ? (en ? ' (hero: ' : ' (герой: ') + who + ')' : '') + ': ' + lead(panels[i]);
    } else {
      out[i] = en
        ? 'A quiet closing picture-book scene: ' + (who || 'the hero') + ' at home in soft evening light, calm, no text in the picture.'
        : 'Тихая финальная сцена детской книги: ' + (who || 'герой') + ' дома в мягком вечернем свете, спокойно, без надписей на картинке.';
    }
  }
  return out;
}
