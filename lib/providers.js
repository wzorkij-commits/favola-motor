// Тонкие обёртки над тремя провайдерами. Ключи только на сервере.
// Цены (проверены): текст ~£0.05, шесть картинок ~£0.18, шесть минут голоса ~£0.47.

const TEXT_MODEL   = process.env.FAVOLA_TEXT_MODEL   || 'claude-sonnet-4-5';
const IMAGE_MODEL  = process.env.FAVOLA_IMAGE_MODEL  || 'gemini-3.1-flash-image';
const VOICE_MODEL  = process.env.FAVOLA_VOICE_MODEL  || 'eleven_multilingual_v2';

export async function generateText({ system, prompt, maxTokens = 4000, temperature = 0.8 }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) throw new Error(`text ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.content.map(c => c.text || '').join('');
}

/**
 * То же самое, но возвращает ещё и причину остановки.
 * "max_tokens" значит, что ответ обрубили на полуслове — это не ошибка
 * модели, а наш слишком маленький потолок, и лечится он по-другому.
 */
export async function generateTextEx({ system, prompt, maxTokens = 4000, temperature = 0.8 }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) throw new Error(`text ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return {
    text: j.content.map(c => c.text || '').join(''),
    stop: j.stop_reason || '',
    out: j.usage ? j.usage.output_tokens : null
  };
}

/**
 * @param {string} prompt
 * @param {string[]} refs  data-URL референсов персонажа. Первый — лист персонажа.
 *                         Без них лицо героя плывёт к третьему-четвёртому кадру.
 */
const asB64 = (dataUrl) => {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  return m ? { mime: m[1], data: m[2] } : null;
};

/** Новый Interactions API. Модель по умолчанию — gemini-3.1-flash-image. */
async function imageViaInteractions(prompt, refs) {
  const input = [{ type: 'text', text: prompt }];
  for (const ref of refs) {
    const b = asB64(ref);
    if (b) input.push({ type: 'image', mime_type: b.mime, data: b.data });
  }
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      input,
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '1:1', image_size: '1K' }
    })
  });
  if (!r.ok) throw new Error(`interactions ${r.status}: ${(await r.text()).slice(0, 250)}`);
  const j = await r.json();
  let img = j?.output_image;
  if (!img) {
    for (const step of j?.steps || []) {
      const hit = (step.content || []).find(c => c.type === 'image' && c.data);
      if (hit) { img = hit; break; }
    }
  }
  if (!img?.data) throw new Error('interactions: в ответе нет изображения');
  return `data:${img.mime_type || 'image/png'};base64,${img.data}`;
}

/** Прежний generateContent — запасной путь для ключей со старым доступом. */
async function imageViaGenerateContent(prompt, refs, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const sendParts = [];
  for (const ref of refs) {
    const b = asB64(ref);
    if (b) sendParts.push({ inlineData: { mimeType: b.mime, data: b.data } });
  }
  sendParts.push({ text: prompt });
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: sendParts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    })
  });
  if (!r.ok) throw new Error(`${model} ${r.status}: ${(await r.text()).slice(0, 250)}`);
  const j = await r.json();
  const gotParts = j?.candidates?.[0]?.content?.parts || [];
  const img = gotParts.find(p => p.inlineData || p.inline_data);
  if (!img) throw new Error(`${model}: в ответе нет изображения`);
  const d = img.inlineData || img.inline_data;
  return `data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`;
}

/**
 * Смотрит на готовую картинку глазами модели и сверяет её со словами рассказчика.
 * Вернёт по каждому обязательному элементу «видно / не видно», а также замечания
 * про текст на картинке, страшное и противоречие словам.
 */
export async function judgeImage({ image, text, shows, system, prompt }) {
  const b = asB64(image);
  if (!b) throw new Error('на проверку пришла не картинка');
  if (!/^image\/(jpeg|png|webp|gif)$/.test(b.mime)) throw new Error('формат картинки не подходит для проверки: ' + b.mime);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      max_tokens: 400,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: b.mime, data: b.data } },
        { type: 'text', text: prompt }
      ] }]
    })
  });
  if (!r.ok) throw new Error(`проверка картинки ${r.status}: ${(await r.text()).slice(0, 250)}`);
  const j = await r.json();
  return j.content.map(c => c.text || '').join('');
}

/**
 * Пробует способы по очереди и, если все отвалились, отдаёт причины все сразу —
 * иначе на экране видно только «кадр не вышел», и чинить нечего.
 */
export async function generateImage(prompt, refs = []) {
  const tries = [
    ['interactions', () => imageViaInteractions(prompt, refs)],
    ['generateContent/' + IMAGE_MODEL, () => imageViaGenerateContent(prompt, refs, IMAGE_MODEL)],
    ['generateContent/gemini-2.5-flash-image', () => imageViaGenerateContent(prompt, refs, 'gemini-2.5-flash-image')]
  ];
  const errors = [];
  for (const [name, fn] of tries) {
    try { return await fn(); }
    catch (e) { errors.push(`${name}: ${e.message}`); }
  }
  throw new Error(errors.join(' | '));
}

export async function generateVoice({ text, voiceId, settings }) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: VOICE_MODEL,
      voice_settings: settings
    })
  });
  if (!r.ok) throw new Error(`voice ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return `data:audio/mpeg;base64,${buf.toString('base64')}`;
}

/**
 * Достаём JSON из ответа модели.
 *
 * Модель почти всегда права по смыслу и почти всегда неаккуратна в мелочах:
 * ставит ```json, пишет фразу перед ответом, а главное — оставляет живой
 * перенос строки внутри строки. В сказке диалог идёт с новой строки, и
 * JSON.parse на этом падает. Раньше это читалось как «модель не вернула
 * JSON» и стоило двух попыток впустую. Теперь чиним и разбираем.
 */
export function jsonFrom(text) {
  const src = String(text || '');

  // 1. без обёрток
  let body = src.replace(/```(?:json)?/gi, '');

  // 2. от первой скобки до парной ей, не считая скобок внутри строк
  const start = body.indexOf('{');
  if (start < 0) throw new Error('в ответе нет JSON: ' + src.slice(0, 120));
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error('JSON оборван — ответ не дописан до конца');
  body = body.slice(start, end + 1);

  try { return JSON.parse(body); } catch (e) { /* чиним ниже */ }

  // 3. чиним живые переносы и табуляции внутри строк + висячие запятые
  let fixed = '', str = false, sl = false;
  for (const c of body) {
    if (sl) { fixed += c; sl = false; continue; }
    if (c === '\\') { fixed += c; sl = true; continue; }
    if (c === '"') { str = !str; fixed += c; continue; }
    if (str && (c === '\n' || c === '\r')) { fixed += '\\n'; continue; }
    if (str && c === '\t') { fixed += '\\t'; continue; }
    fixed += c;
  }
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  try { return JSON.parse(fixed); }
  catch (e) { throw new Error('JSON не разбирается: ' + e.message); }
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FAVOLA_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
}
