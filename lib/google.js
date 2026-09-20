// Вход через Google. Браузер получает от Google подписанный пропуск и шлёт
// его нам; мы сами сверяем подпись открытыми ключами Google.
//
// Почему не отладочный адрес tokeninfo: он у Google помечен как средство для
// разработки. Подпись проверяется здесь, штатным шифрованием Node, без
// дополнительных библиотек.

const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

export const GOOGLE_READY = () => !!process.env.GOOGLE_CLIENT_ID;
export const clientId = () => process.env.GOOGLE_CLIENT_ID || null;

let keyCache = { at: 0, keys: null };

async function googleKeys() {
  // Ключи Google меняются редко; час держим у себя.
  if (keyCache.keys && Date.now() - keyCache.at < 3600e3) return keyCache.keys;
  const r = await fetch(CERTS);
  if (!r.ok) throw new Error('не получили ключи Google: ' + r.status);
  const j = await r.json();
  keyCache = { at: Date.now(), keys: j.keys || [] };
  return keyCache.keys;
}

const b64url = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * @returns {{sub:string, email:string|null, emailVerified:boolean, name:string|null, picture:string|null}}
 * @throws если подпись, срок или адресат не сходятся
 */
export async function verifyIdToken(token) {
  if (!GOOGLE_READY()) throw new Error('вход через Google не настроен: нет GOOGLE_CLIENT_ID');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('пропуск не похож на пропуск');

  const header = JSON.parse(b64url(parts[0]).toString('utf8'));
  const body = JSON.parse(b64url(parts[1]).toString('utf8'));

  const key = (await googleKeys()).find(k => k.kid === header.kid);
  if (!key) throw new Error('ключ подписи неизвестен');

  const pub = await crypto.subtle.importKey(
    'jwk',
    { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );
  const good = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', pub, b64url(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  if (!good) throw new Error('подпись не сходится');

  if (!ISSUERS.includes(body.iss)) throw new Error('пропуск выдан не Google');
  if (body.aud !== clientId()) throw new Error('пропуск выписан другому приложению');
  if (!body.exp || body.exp * 1000 < Date.now()) throw new Error('срок пропуска вышел');
  if (!body.sub) throw new Error('в пропуске нет опознавателя');

  return {
    sub: String(body.sub),
    email: body.email ? String(body.email).toLowerCase() : null,
    emailVerified: body.email_verified === true || body.email_verified === 'true',
    name: body.name || body.given_name || null,
    picture: body.picture || null
  };
}
