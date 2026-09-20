// Файлы сказок: картинки и дорожки. В базу они не помещаются и не должны:
// база для описи, файлы — в файловом хранилище.
//
// Пишем по одному файлу за запрос. У функций Vercel потолок тела запроса
// 4,5 МБ, а целая сказка весит около четырёх — впритык, и однажды не влезет.
// По одному кадру это триста килобайт, запас десятикратный.

let putFn = null, delFn = null;

async function sdk() {
  if (putFn) return { put: putFn, del: delFn };
  const m = await import('@vercel/blob');
  putFn = m.put; delFn = m.del;
  return { put: putFn, del: delFn };
}

// Хранилище считается подключённым, если есть либо старый ключ BLOB_READ_WRITE_TOKEN,
// либо новый набор: BLOB_STORE_ID (Vercel сам выдаёт короткий пропуск на время работы функции).
export const BLOB_READY = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

/**
 * @param {string} path  куда класть, например stories/<id>/panel-1.jpg
 * @param {Buffer} data
 * @returns {Promise<string>} постоянный адрес файла
 */
export async function putFile(path, data, contentType) {
  if (!BLOB_READY()) throw new Error('файловое хранилище не подключено: нет BLOB_READ_WRITE_TOKEN и нет BLOB_STORE_ID');
  const { put } = await sdk();
  const b = await put(path, data, {
    access: 'public',              // ссылка угадывается только вместе со случайным хвостом
    addRandomSuffix: true,
    contentType
  });
  return b.url;
}

export async function deleteFiles(urls) {
  if (!BLOB_READY() || !urls || !urls.length) return;
  const { del } = await sdk();
  try { await del(urls); } catch (e) { /* уже удалено — не беда */ }
}

/** data:image/jpeg;base64,.... -> { buffer, type, ext } */
export function fromDataUrl(s) {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(String(s || ''));
  if (!m) throw new Error('это не файл в виде строки');
  const type = m[1];
  const ext = type.includes('jpeg') ? 'jpg'
            : type.includes('png')  ? 'png'
            : type.includes('webp') ? 'webp'
            : type.includes('mpeg') ? 'mp3'
            : type.includes('mp4')  ? 'm4a' : 'bin';
  return { buffer: Buffer.from(m[2], 'base64'), type, ext };
}
